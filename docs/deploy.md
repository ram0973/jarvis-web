# Деплой в прод

Прод — это один VPS и `docker compose`: приложение, Postgres и Caddy (TLS) в контейнерах.
Файлы для сервера лежат в [`deploy/`](../deploy):

| Файл                                                           | Зачем                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`docker-compose.prod.yml`](../deploy/docker-compose.prod.yml) | `db` + `app` + `caddy`, тома для базы, картинок и сертификатов         |
| [`Caddyfile`](../deploy/Caddyfile)                             | HTTPS (Let's Encrypt), проксирование на `app:3000`, security-заголовки |
| [`env.example`](../deploy/env.example)                         | шаблон `deploy/.env` со всеми переменными                              |

## База в Docker или на хосте?

Для нашего профиля разницы в скорости нет: Docker на Linux — это не виртуалка, Postgres в контейнере теряет
1–3% на I/O и network-namespace, то есть меньше, чем шум от самого запроса. Заметная разница появляется только
на десятках тысяч транзакций в секунду, а не на вики.

Что реально стоит взвешивать:

|            | База в Docker (так в `docker-compose.prod.yml`)      | База на хосте (`apt install postgresql`)                 |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Скорость   | практически та же                                    | практически та же                                        |
| Обновление | меняешь тег образа, `docker compose up -d`           | `pg_upgradecluster`, отдельный ритуал                    |
| Бэкап      | том + `pg_dump` из контейнера                        | тот же `pg_dump`                                         |
| Изоляция   | своя версия, свои лимиты, ничего не ставит в систему | общая с системой                                         |
| Сеть       | `db:5432` внутри compose                             | нужен `host.docker.internal:5432` и правка `pg_hba.conf` |

Поэтому по умолчанию — база в Docker. Если всё же нужна хостовая (например, уже есть управляемый Postgres на этой
же машине), см. раздел [«Postgres на хосте»](#postgres-на-хосте).

## С нуля до работающего сайта

### 1. Сервер и DNS

- VPS: 2 vCPU / 2 ГБ RAM / 20 ГБ SSD достаточно (сборка образа идёт на сервере).
- Ubuntu 24.04.
- A-запись `wiki.example.com` → IP сервера. Дождись, пока DNS разойдётся: Caddy не получит сертификат раньше.

### 2. Docker и firewall

```bash
sudo apt update && sudo apt install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Postgres наружу не открываем — он и не публикуется.

### 3. Код и секреты

```bash
git clone https://github.com/ram0973/jarvis-web.git
cd jarvis-web

cp deploy/env.example deploy/.env
chmod 600 deploy/.env
```

Заполни `deploy/.env`:

- `DOMAIN`, `SERVER_URL`, `CLIENT_URL` — один и тот же https-хост;
- `POSTGRES_PASSWORD` и пароль в `DATABASE_URL` — одинаковые, длинные случайные;
- `BETTER_AUTH_SECRET` — 32+ символа (`openssl rand -hex 32`); менять его позже нельзя без разлогина всех;
- `OPENAPI_CREDENTIALS` и `ADMIN_CREDENTIALS` — свои, не `admin:admin`.

### 4. Запуск

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs -f app
```

Что происходит: собирается образ (bun install → prisma generate → point0 build → production-слой), поднимается
Postgres, приложение ждёт `db` до `service_healthy`, entrypoint применяет `prisma migrate deploy`, создаёт первого
админа из `ADMIN_CREDENTIALS`, поднимает сервер, Caddy получает сертификат и начинает проксировать.

Проверка:

```bash
curl -fsS https://wiki.example.com/api/auth/ok    # {"ok":true}
```

### 5. Обновление

```bash
cd jarvis-web
git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

Миграции применяются сами на старте контейнера. Откат — `git checkout <тег/коммит>` и та же команда.

### 6. Бэкапы

База (том `jarvis-web_db_data`):

```bash
docker compose -f deploy/docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
```

Картинки (том `jarvis-web_uploads`):

```bash
docker run --rm -v jarvis-web_uploads:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Cron-пример (каждый день в 03:30, хранить 14 дней):

```cron
30 3 * * * cd /home/deploy/jarvis-web && docker compose -f deploy/docker-compose.prod.yml exec -T db pg_dump -U jarvis jarvis | gzip > /home/deploy/backup-$(date +\%F).sql.gz
40 3 * * * cd /home/deploy/jarvis-web && docker run --rm -v jarvis-web_uploads:/data:ro -v /home/deploy:/backup alpine tar czf /backup/uploads-$(date +\%F).tgz -C /data .
50 3 * * * find /home/deploy -name 'backup-*.sql.gz' -mtime +14 -delete
50 3 * * * find /home/deploy -name 'uploads-*.tgz' -mtime +14 -delete
```

Бэкапы стоит уносить с сервера (rsync/rclone в S3-совместимое хранилище) — иначе при потере VPS они потеряются вместе с ним.

### 7. Логи и здоровье

```bash
docker compose -f deploy/docker-compose.prod.yml logs --tail 100 app
docker compose -f deploy/docker-compose.prod.yml ps
curl -fsS https://wiki.example.com/api/auth/ok
```

У сервисов ограниченный `json-file` лог (10 МБ × 3), чтобы диск не забился.

## Postgres на хосте

Если база ставится в систему (`sudo apt install postgresql-17`), приложение в контейнере должно до неё достучаться:

1. В compose у сервиса `app` добавь:

   ```yaml
   extra_hosts:
     - 'host.docker.internal:host-gateway'
   ```

2. В `deploy/.env` поменяй хост в `DATABASE_URL` на `host.docker.internal`:

   ```
   DATABASE_URL=postgresql://jarvis:<пароль>@host.docker.internal:5432/jarvis
   ```

3. В `/etc/postgresql/17/main/postgresql.conf`: `listen_addresses = 'localhost'`.
   В `pg_hba.conf` разреши docker-мост:

   ```
   host    jarvis    jarvis    172.16.0.0/12    scram-sha-256
   ```

4. `sudo systemctl restart postgresql`, затем обычный `up -d --build`.

Плюс этого варианта только один: база живёт отдельно от `docker compose down -v`. Минусы — обновления и бэкапы
руками, и легко случайно открыть 5432 наружу.

## Мелочи, которые легко забыть

- **HTTPS обязателен**: better-auth ставит `Secure` на cookie только при https-`baseURL`; на http вход будет
  «работать», но cookie уйдёт без `Secure`.
- **`deploy/.env` в git не попадает** (`.env*` в `.gitignore`) — так и должно быть; бэкап секретов
  держи в менеджере паролей.
- **`ADMIN_CREDENTIALS` после первого запуска** можно убрать: существующего админа функция не трогает, а пароль
  в env — лишняя поверхность.
- **Том `uploads`** обязателен: без него картинки из вики исчезнут при пересборке образа.
- **Не запускай `docker compose down -v` на проде** — `-v` стирает базу и картинки.
