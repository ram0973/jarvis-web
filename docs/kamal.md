# Деплой через Kamal

[Kamal 2](https://kamal-deploy.org) — это деплой без панели: на сервере живут только `kamal-proxy` (~10 МБ) и
контейнер приложения, а команды запускаются с твоей машины или из GitHub Actions по SSH.

```
ноутбук / GitHub Actions ──(ssh)──▶ VPS: kamal-proxy :80/:443 ──▶ jarvis-web:3000
                                          └──▶ accessory jarvis-web-db (Postgres 17)
```

Зачем: `kamal deploy` одной командой (или пуш в `main`), TLS сам, база как accessory, откат `kamal rollback`.
Плата — нет UI и «кнопок»: смотреть логи/переменные придётся командами.

## Файлы

| Файл                                                              | Роль                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| [`config/deploy.yml`](../config/deploy.yml)                       | сервис, домен, registry, env, Postgres-accessory, тома |
| [`.kamal/secrets.example`](../.kamal/secrets.example)             | шаблон `.kamal/secrets` (сам файл в git не попадает)   |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | деплой по пушу в `main`                                |
| [`src/lib/health.ts`](../src/lib/health.ts)                       | `GET /health` — проверка, которая трогает базу         |

## Что нужно один раз

1. **VPS** с Ubuntu и Docker (`curl -fsSL https://get.docker.com | sudo sh`). Если Docker нет, `kamal server bootstrap`
   поставит его сам.
2. **DNS**: A-запись домена на IP сервера.
3. **SSH-ключ** для `root@сервер` (Kamal по умолчанию ходит root-ом; пользователя можно сменить через `ssh: user:`).
4. **Registry**: этот конфиг пушит в GHCR. Нужен GitHub PAT с правом `write:packages` — он идёт в
   `KAMAL_REGISTRY_PASSWORD`.
5. **Kamal локально**: Ruby 3.3+ и `gem install kamal`. Не хочется ставить Ruby на Windows — деплой уже собран в
   GitHub Actions, локально он не обязателен.

## Настройка

```bash
cp .kamal/secrets.example .kamal/secrets
# заполни пароли/токены; DATABASE_URL должен указывать на jarvis-web-db и совпадать по паролю с POSTGRES_PASSWORD
chmod 600 .kamal/secrets

export KAMAL_HOST=203.0.113.10        # IP сервера
export KAMAL_DOMAIN=wiki.example.com  # домен из DNS
```

`KAMAL_HOST` и `KAMAL_DOMAIN` вынесены в переменные окружения, потому что они не должны лежать в репозитории.

## Первый деплой

```bash
kamal setup     # ставит Docker при необходимости, поднимает proxy и Postgres-accessory, деплоит приложение
```

Обычно после этого достаточно:

```bash
curl -fsS https://wiki.example.com/health    # {"ok":true}
```

Если база не поднялась: `kamal accessory boot db`, логи — `kamal accessory logs db -f`.

## Миграции

Образ приложения не содержит Prisma CLI: в нём нет `node_modules` (только пустая папка под кэш Point0). Миграции едут в
отдельном образе `ghcr.io/ram0973/jarvis-web:migrate`, и их прогоняет **pre-deploy hook** — скрипт
[`.kamal/hooks/pre-deploy`](../.kamal/hooks/pre-deploy), который Kamal запускает на машине, где вызван `kamal deploy`.

```
kamal deploy
  └─ pre-deploy hook (локально, с .kamal/secrets в окружении)
       └─ ssh на сервер: docker pull :migrate && docker run --rm --network kamal -e DATABASE_URL … :migrate
  └─ kamal-proxy переключает трафик только если hook завершился успешно
```

Почему так: контейнер миграций живёт на сети `kamal`, то есть видит базу по имени `jarvis-web-db`, а упавшая миграция
**отменяет деплой** — старый контейнер продолжает работать.

Что нужно:

1. Образ миграций должен быть в registry: в CI это делает шаг «Build and push the migration image» перед `kamal deploy`.
   Локально — `docker build --target migrate -t ghcr.io/ram0973/jarvis-web:migrate . && docker push …`.
2. `DATABASE_URL` должен быть в `.kamal/secrets` (он там уже есть) — без него hook падает с понятной ошибкой.

Проверить миграции вручную, не деплоя:

```bash
docker build --target migrate -t ghcr.io/ram0973/jarvis-web:migrate . && docker push ghcr.io/ram0973/jarvis-web:migrate
kamal deploy --skip-push   # или просто дождаться, пока hook отработает в обычном деплое
```

`kamal rollback` возвращает **код**, но не схему: если миграция была несовместимой (удалили колонку), старый контейнер
на новой схеме может сломаться. Откат схемы — это `prisma migrate resolve`/ручной SQL, и его стоит продумывать заранее
для каждой миграции, которая удаляет или переименовывает.

## Каждый день

| Задача             | Команда                                              |
| ------------------ | ---------------------------------------------------- |
| Задеплоить         | `kamal deploy` (или пуш в `main` → workflow)         |
| Откатить           | `kamal rollback`                                     |
| Логи приложения    | `kamal app logs -f` (или алиас `kamal logs`)         |
| Bash в контейнере  | `kamal shell`                                        |
| psql               | `kamal psql` (алиас в `aliases:`)                    |
| Бэкап базы         | `kamal dbbackup \| gzip > backup-$(date +%F).sql.gz` |
| Перезапустить базу | `kamal accessory reboot db`                          |

Алиасы объявлены в `config/deploy.yml`; список — `kamal aliases`.

## Второй проект на том же VPS

Kamal-proxy на сервере один и разводит трафик по `Host`, поэтому второй проект — это второй `config/deploy.yml`
(в своём репозитории или папке) со своими `service`, `image`, `proxy.host`, `servers` и своим доменом. Оба деплоятся
независимо, порты 80/443 не конфликтуют.

```bash
cd ~/another-project
kamal deploy    # proxy уже поднят, конфиг лишь добавит маршрут по домену
```

## Бэкапы

У Kamal **нет** встроенных бэкапов: он умеет только деплоить. Зато у него уже есть всё нужное — контейнер базы и
тома — поэтому бэкап это скрипт [`deploy/backup.sh`](../deploy/backup.sh) на сервере:

```bash
cd /home/deploy/jarvis-web
deploy/backup.sh                       # Kamal: контейнер jarvis-web-db, картинки из /srv/jarvis-web/uploads
```

Что делает: `pg_dump` через `docker exec`, `tar` картинок, удаление файлов старше `KEEP_DAYS` (по умолчанию 14).
Переменные: `BACKUP_DIR`, `DB_CONTAINER`, `POSTGRES_USER`/`POSTGRES_DB`, `UPLOADS_DIR`, `UPLOADS_VOLUME`, `KEEP_DAYS`.

Для compose вместо каталога картинок — том:

```bash
UPLOADS_VOLUME=jarvis-web_uploads DB_CONTAINER=jarvis-web-db-1 deploy/backup.sh
```

### Раз в сутки через systemd

`/etc/systemd/system/jarvis-backup.service`:

```ini
[Unit]
Description=Backup jarvis-web (Postgres + uploads)

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/home/deploy/jarvis-web
Environment=BACKUP_DIR=/var/backups/jarvis-web
ExecStart=/home/deploy/jarvis-web/deploy/backup.sh
```

`/etc/systemd/system/jarvis-backup.timer`:

```ini
[Unit]
Description=Nightly jarvis-web backup

[Timer]
OnCalendar=03:30
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo mkdir -p /var/backups/jarvis-web && sudo chown deploy:deploy /var/backups/jarvis-web
sudo systemctl daemon-reload && sudo systemctl enable --now jarvis-backup.timer
systemctl list-timers jarvis-backup.timer
```

`Persistent=true` догоняет пропущенный запуск, если сервер спал.

### Восстановление

```bash
# база: снять приложение, чтобы никто не писал, затем залить дамп
docker exec -i jarvis-web-db psql -U jarvis -d postgres -c 'drop database jarvis' -c 'create database jarvis'
gzip -dc /var/backups/jarvis-web/db-2026-10-28.sql.gz | docker exec -i jarvis-web-db psql -U jarvis -d jarvis
docker exec jarvis-web-db psql -U jarvis -d jarvis -c 'select count(*) from wiki_page'

# картинки
tar xzf /var/backups/jarvis-web/uploads-2026-10-28.tgz -C /srv/jarvis-web/uploads
```

Проверено на живом Postgres: дамп, снятый скриптом, разворачивается в чистую базу, и число строк совпадает
(`wiki_page`: 7 → 7).

### Что важно помнить

- **Бэкап на том же диске — не бэкап.** `rsync`/`rclone` в S3-совместимое хранилище или на другую машину.
- **Проверяй восстановление**, а не только наличие файлов: скрипт раз в месяц → `psql` в `jarvis_restore`-базу.
- `docker exec ... pg_dump` работает без остановки приложения (согласованный снимок на момент транзакции), но при
  восстановлении приложение лучше остановить.

## Чем отличается от compose-схемы

|                    | Kamal                                   | edge + compose                      |
| ------------------ | --------------------------------------- | ----------------------------------- |
| Что на сервере     | proxy + контейнер + accessory           | Caddy + контейнер + контейнер БД    |
| Деплой             | `kamal deploy` / push в main            | `git pull && compose up -d --build` |
| Панель             | нет                                     | нет                                 |
| RAM оверхеда       | ~10–20 МБ (proxy)                       | ~10 МБ (Caddy)                      |
| Несколько проектов | отдельные config, общий proxy           | `sites/*.caddy` + алиасы            |
| Откат              | `kamal rollback` (хранит прошлый образ) | `git checkout` + rebuild            |
| База               | accessory (`kamal accessory ...`)       | сервис в compose                    |

**Не запускай обе схемы на одном VPS**: и kamal-proxy, и Caddy хотят 80/443.

## Проверка здоровья

`/health` намеренно ходит в базу (`SELECT 1`): если Postgres недоступен, эндпоинт отвечает **503**, и
kamal-proxy не переключит трафик на новый контейнер. Проверено локально: с живой базой — `200 {"ok":true}`,
с остановленной — `503 {"ok":false,"database":"unreachable"}`.
