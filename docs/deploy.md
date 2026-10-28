# Деплой в прод

Прод состоит из двух слоёв, и это главное, что стоит понять до первого `up`:

- **edge** — один Caddy на весь VPS. Он владеет портами 80/443, получает сертификаты и проксирует по домену.
- **проект** — свой `docker compose` со своей базой и приложением. Публичных портов у него нет вообще.

```
Интернет ──▶ :80/:443 ──▶ Caddy (edge) ──▶ jarvis-web:3000   (этот проект)
                                      ──▶ blog:3000          (следующий)
                                      ──▶ api:8080           (и так далее)
```

Так один VPS спокойно тянет несколько проектов: у каждого своя база, свои тома, свой деплой, а TLS и порты
общие. Остановить один проект (`down`) нельзя так, чтобы упали остальные.

## Файлы

| Файл                                                                   | Зачем                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`edge/docker-compose.yml`](../deploy/edge/docker-compose.yml)         | Caddy: порты 80/443, том сертификатов, сеть `edge`                                        |
| [`edge/Caddyfile`](../deploy/edge/Caddyfile)                           | общий конфиг: email для Let's Encrypt, сниппет `security_headers`, импорт `sites/*.caddy` |
| [`edge/sites/jarvis-web.caddy`](../deploy/edge/sites/jarvis-web.caddy) | сайт этого проекта: домен → `reverse_proxy jarvis-web:3000`                               |
| [`edge/env.example`](../deploy/edge/env.example)                       | шаблон `edge/.env` (почта для ACME)                                                       |
| [`docker-compose.prod.yml`](../deploy/docker-compose.prod.yml)         | проект: `db` + `app`, сеть `edge` как внешняя                                             |
| [`env.example`](../deploy/env.example)                                 | шаблон `.env` проекта                                                                     |

## Один раз на VPS: edge

```bash
sudo apt update && sudo apt install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

git clone https://github.com/ram0973/jarvis-web.git
cd jarvis-web
cp deploy/edge/env.example deploy/edge/.env   # ACME_EMAIL
docker compose -f deploy/edge/docker-compose.yml up -d
```

Caddy создаёт сеть `edge` (её имя зафиксировано в compose) и ждёт сайты в `deploy/edge/sites/`.
Сертификат выдаётся при первом запросе на домен, поэтому DNS A-запись должна уже указывать на сервер.

## Проект

```bash
cp deploy/env.example deploy/.env
chmod 600 deploy/.env
# адрес сайта — в deploy/edge/sites/jarvis-web.caddy; в .env — SERVER_URL/CLIENT_URL и секреты
nano deploy/.env

docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f app
curl -fsS https://wiki.example.com/api/auth/ok    # {"ok":true}
```

Что происходит при старте: сборка образа → Postgres → приложение ждёт `service_healthy` → `prisma migrate deploy` →
первый админ из `ADMIN_CREDENTIALS` → сервер на `:3000` внутри сети → Caddy проксирует на алиас `jarvis-web`.

Порт приложению не нужен: Caddy ходит к нему по имени из сети `edge`. Для отладки снаружи — `docker compose exec app`.

## Второй проект на том же VPS

1. Скопируй репозиторий в отдельную папку (или свой репозиторий) — **свой** `deploy/docker-compose.prod.yml`.
2. В его `app` объяви уникальный алиас в общей сети:

   ```yaml
   networks:
     default: {}
     edge:
       aliases: [my-project]
   networks:
     edge:
       external: true
       name: edge
   ```

3. Добавь сайт в edge: `deploy/edge/sites/my-project.caddy`

   ```caddy
   my.domain.com {
       import security_headers
       encode zstd gzip
       reverse_proxy my-project:3000
   }
   ```

4. Перечитай конфиг Caddy (рестарт не обязателен):

   ```bash
   docker compose -f deploy/edge/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

5. Подними проект своим `docker compose up -d --build`.

Алиас (`jarvis-web`, `my-project`) должен быть уникален в сети `edge` — это фактически DNS-имя внутри Docker.

## Обновление проекта

```bash
cd jarvis-web
git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

Миграции применяются на старте контейнера. Откат — `git checkout <коммит/тег>` и та же команда.

## Бэкапы

База (том `<проект>_db_data`):

```bash
docker compose -f deploy/docker-compose.prod.yml exec -T db \
  pg_dump -U jarvis jarvis | gzip > backup-$(date +%F).sql.gz
```

Картинки (том `<проект>_uploads`):

```bash
docker run --rm -v jarvis-web_uploads:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Cron-пример (03:30, хранить 14 дней) — подставь имена томов своего проекта:

```cron
30 3 * * * cd /home/deploy/jarvis-web && docker compose -f deploy/docker-compose.prod.yml exec -T db pg_dump -U jarvis jarvis | gzip > /home/deploy/backup-$(date +\%F).sql.gz
40 3 * * * docker run --rm -v jarvis-web_uploads:/data:ro -v /home/deploy:/backup alpine tar czf /backup/uploads-$(date +\%F).tgz -C /data .
50 3 * * * find /home/deploy -name 'backup-*.sql.gz' -mtime +14 -delete
50 3 * * * find /home/deploy -name 'uploads-*.tgz' -mtime +14 -delete
```

Уноси бэкапы с сервера (rsync/rclone в S3-совместимое хранилище), иначе потеря VPS = потеря бэкапов.

## Альтернатива без панели: Kamal

Если хочется деплой одной командой (`kamal deploy` / пуш в `main`), а на сервере — только `kamal-proxy` (~10 МБ)
вместо Caddy, в репозитории есть готовая схема: [`config/deploy.yml`](../config/deploy.yml),
[`docs/kamal.md`](./kamal.md), workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
Обе схемы одновременно на одном VPS не поднять — они делят порты 80/443.

## Coolify: когда стоит вместо этой схемы

[Coolify](https://coolify.io) — self-hosted PaaS: веб-UI, git-деплой по пушу, авто-TLS, базы в один клик, логи,
бэкапы, откаты. Это тот же Docker, но с панелью сверху.

**Стоит взять, если:**

- проектов много и нужен пуш → автодеплой без `ssh`;
- хочется UI для env-переменных, логов, доменов и баз;
- не хочется руками вести Caddyfile.

**Цена:**

- свой Postgres + Redis и панель: ~1–1.5 ГБ RAM сверху на VPS;
- Coolify сам занимает 80/443 (у него Traefik) — **нельзя держать рядом свой edge**: либо Coolify, либо наш Caddy;
- обновления панели и её собственные бэкапы — отдельная забота;
- «магия» buildpacks не нужна: этот проект живёт как **Docker Compose**-приложение в Coolify (compose без сервиса
  `caddy`, домен и TLS выдаёт Traefik Coolify).

**Практический совет:** для 2–3 личных проектов схема «edge + проекты» из этого репозитория проще для понимания и
не съедает RAM. Когда проектов станет больше и захочется деплоить из UI — переезд на Coolify это в основном
«выкинуть `deploy/edge` и указать домен в панели», код приложения менять не нужно.

Не смешивай: если на VPS уже стоит Coolify, не поднимай наш edge на тех же портах — будет конфликт 80/443.

## Postgres на хосте

Если база ставится в систему (`sudo apt install postgresql-17`), приложение в контейнере должно до неё достучаться:

1. В compose у сервиса `app` добавь:

   ```yaml
   extra_hosts:
     - 'host.docker.internal:host-gateway'
   ```

2. В `deploy/.env` поменяй хост в `DATABASE_URL`:

   ```
   DATABASE_URL=postgresql://jarvis:<пароль>@host.docker.internal:5432/jarvis
   ```

3. В `/etc/postgresql/17/main/postgresql.conf`: `listen_addresses = 'localhost'`.
   В `pg_hba.conf` разреши docker-мост:

   ```
   host    jarvis    jarvis    172.16.0.0/12    scram-sha-256
   ```

4. `sudo systemctl restart postgresql`, затем обычный `up -d --build`.

Плюс варианта только один: база живёт отдельно от `docker compose down -v`. Минусы — обновления и бэкапы руками.

## Чек-лист безопасности

- **HTTPS обязателен**: better-auth ставит `Secure` на cookie только при https-`baseURL`.
- **`deploy/.env` и `deploy/edge/.env` в git не попадают** (`.env*` в `.gitignore`); секреты дублируй в менеджер паролей.
- **`ADMIN_CREDENTIALS` после первого запуска** убери: существующего админа функция не трогает.
- **Тома обязательны**: `uploads` без тома потеряется при пересборке, `db_data` — при `down -v`.
- **`docker compose down -v` на проде стирает базу и картинки.**
- **Порт приложения не публикуй**: пусть его видят только Caddy и сеть `edge`.
