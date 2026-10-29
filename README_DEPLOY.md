# README_DEPLOY — от локальной машины до продакшена

Подробная инструкция: как запустить проект на своём компьютере, как выложить его на сервер, как потом деплоить новые
фичи и как делать бэкапы. Все команды проверены на этом репозитории; там, где есть выбор, он явно описан.

| Что                    | Где                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Код                    | https://github.com/ram0973/jarvis-web (`main`)                                      |
| Схема A (по умолчанию) | общий Caddy (`deploy/edge`) + compose-проект (`deploy/docker-compose.prod.yml`)     |
| Схема B (альтернатива) | Kamal, см. [docs/kamal.md](docs/kamal.md)                                           |
| Переменные окружения   | `env.example` (dev), `deploy/env.example` (прод), `deploy/edge/env.example` (Caddy) |
| Бэкапы                 | [`deploy/backup.sh`](deploy/backup.sh), раздел [4](#4-бэкапы)                       |

Обе схемы делят порты 80/443 — на одном сервере одновременно их не поднять. Выбирай одну.

---

## 0. Что понадобится

**Локально:** [Bun](https://bun.sh) 1.4+ (в нём же рантайм), Git, Docker Desktop (или Docker Engine +
`docker compose`). Node.js отдельно **не нужен**: Bun заменяет его целиком.

**На сервере:** Ubuntu 24.04 (или Debian 12), 2 vCPU / 2 ГБ RAM / 20 ГБ SSD, Docker, SSH-ключ, домен с A-записью
на IP сервера.

```bash
# проверка локального окружения
bun --version        # 1.4+
docker --version
docker compose version
git --version
```

На Windows Bun обычно лежит в `%USERPROFILE%\.bun\bin` — если `bun` не находится, добавь этот каталог в `PATH`.

---

## 1. Запуск на dev-компьютере

### 1.1. Первый запуск (5 минут)

```bash
git clone https://github.com/ram0973/jarvis-web.git
cd jarvis-web
bun install
```

Создай `.env` из шаблона и **заполни два секрета**:

```bash
cp env.example .env
```

```dotenv
# .env
SERVER_PORT=3000
CLIENT_PORT=3001
SERVER_URL=http://localhost:3000
CLIENT_URL=http://localhost:3001
DATABASE_URL=postgresql://jarvis:jarvis@localhost:5432/jarvis

OPENAPI_CREDENTIALS=admin:admin
BETTER_AUTH_SECRET=<openssl rand -hex 32>        # 32+ символа, иначе старт упадёт
ADMIN_CREDENTIALS=admin@jarvis.local:jarvis12345 # первый админ (email:пароль)
UPLOADS_DIR=./uploads
```

```bash
openssl rand -hex 32          # значение для BETTER_AUTH_SECRET
```

Теперь база и кодогенерация:

```bash
docker compose up -d db       # Postgres 17 на localhost:5432 (jarvis/jarvis/jarvis)
bun run setup                 # миграции + prisma generate + point0 generate + seed
bun run dev
```

`bun run dev` поднимает **два** сервера:

| Порт | Что                             | Открывать в браузере          |
| ---- | ------------------------------- | ----------------------------- |
| 3000 | сервер (SSR, API, `/uploads/*`) | нет                           |
| 3001 | клиентский dev-сервер (HMR)     | **да**: http://localhost:3001 |

Вход: `admin@jarvis.local` / `jarvis12345` (из `ADMIN_CREDENTIALS`). Админка — http://localhost:3001/admin.

### 1.2. Что проверить после запуска

```bash
bun run types                                    # обязательный минимум: tsc без ошибок
bun run check:ui http://localhost:3001/           # открывает Chrome, падает на ошибках в консоли
curl -s http://localhost:3001/api/auth/ok         # {"ok":true}
```

Ручной чек-лист: главная отдаёт дерево разделов, статья открывается, вход работает, `/admin` пускает админа и отдаёт
**403** анонимному.

### 1.3. Ежедневный цикл

```bash
git pull
bun install                                      # если менялись зависимости
bun run prisma:migrate:deploy                    # если в репозитории появились новые миграции
bun run dev
```

Полезное:

| Задача                            | Команда                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| Пересоздать демо-данные           | `bun run seed`                                                       |
| Снести базу и начать с нуля       | `docker compose down -v && docker compose up -d db && bun run setup` |
| Новая миграция после правки схемы | `bun run prisma:migrate:dev -- --name add_something`                 |
| Перегенерировать Prisma-клиент    | `bun run prisma:generate`                                            |
| Прогнать прод-сборку локально     | `bun run build && bun run start`                                     |

### 1.4. Грабли, которые ловятся сразу

- **`bun` не найден** — добавь `%USERPROFILE%\.bun\bin` в `PATH` (Windows) и открой новый терминал.
- **Порт 3000/3001 занят** — останови старый `bun run dev` или смени `SERVER_PORT`/`CLIENT_PORT` в `.env`.
- **`Invalid "server.BETTER_AUTH_SECRET"`** — секрет короче 32 символов, сгенерируй новый.
- **Пустая страница/странные ошибки `reading 'lets'`** — устаревший HMR-граф: перезапусти `bun run dev`.
- **Таблиц нет** — забыл `bun run setup` (или `bun run prisma:migrate:deploy`).
- **`[db] cannot reach PostgreSQL`** при старте — сервер сам проверяет базу и не поднимается, пока её нет. В сообщении
  есть `reason` и `hint`: обычно это «Docker не запущен» → запусти Docker Desktop и `docker compose up -d db`. Если база
  есть, но пароль не тот — будет `authentication failed` и подсказка про `POSTGRES_PASSWORD`/`DATABASE_URL`.

---

## 2. Первый выклад на сервер (схема A: edge + compose)

«Edge» — один Caddy на весь VPS: держит 80/443, получает сертификаты и проксирует домен на контейнер проекта.
Проект — свой compose: Postgres + миграции + приложение, наружу не публикуется вообще.

```
Интернет ──▶ :80/:443 ──▶ Caddy (edge) ──▶ jarvis-web:3000   (контейнер проекта)
```

### 2.1. Сервер и DNS

1. Создай VPS (2 vCPU / 2 ГБ достаточно) и добавь свой SSH-ключ.
2. В DNS-панели домена: `A` → IP сервера. Подожди, пока запись разойдётся
   (`dig +short wiki.example.com` должен вернуть IP).
3. Зайди на сервер: `ssh root@<IP>`.

### 2.2. Docker и firewall

```bash
apt update && apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version && docker compose version
```

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Postgres наружу **не открываем** — он и не публикуется.

### 2.3. Код на сервере

```bash
useradd -m -s /bin/bash deploy || true
usermod -aG docker deploy
su - deploy
git clone https://github.com/ram0973/jarvis-web.git
cd jarvis-web
```

Дальше все команды — от пользователя `deploy` в `~/jarvis-web`.

### 2.4. Edge (один раз на весь VPS)

```bash
cp deploy/edge/env.example deploy/edge/.env
nano deploy/edge/.env          # ACME_EMAIL=you@example.com
chmod 600 deploy/edge/.env

docker compose -f deploy/edge/docker-compose.yml up -d
docker compose -f deploy/edge/docker-compose.yml ps
```

Caddy создаёт docker-сеть `edge` и ждёт сайты в `deploy/edge/sites/`. Укажи свой домен:

```bash
nano deploy/edge/sites/jarvis-web.caddy
```

```caddy
wiki.example.com {
	import security_headers
	encode zstd gzip
	reverse_proxy jarvis-web:3000
}
```

```bash
docker compose -f deploy/edge/docker-compose.yml exec caddy \
  caddy reload --config /etc/caddy/Caddyfile
```

Сертификат выдаётся при первом HTTPS-запросе на домен, поэтому DNS уже должен указывать на сервер.

### 2.5. Секреты проекта

```bash
cp deploy/env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

```dotenv
# deploy/.env — прод
POSTGRES_USER=jarvis
POSTGRES_PASSWORD=<openssl rand -hex 24>          # и тот же пароль ниже
POSTGRES_DB=jarvis

SERVER_URL=https://wiki.example.com
CLIENT_URL=https://wiki.example.com
DATABASE_URL=postgresql://jarvis:<тот же пароль>@db:5432/jarvis

OPENAPI_CREDENTIALS=admin:<свой пароль>
BETTER_AUTH_SECRET=<openssl rand -hex 32>
ADMIN_CREDENTIALS=you@example.com:<пароль для первого входа>
```

Правила:

- `SERVER_URL`/`CLIENT_URL` — ровно тот https-домен, что в `.caddy`-файле. Иначе cookie и редиректы будут ломаться.
- Пароль в `DATABASE_URL` должен совпадать с `POSTGRES_PASSWORD` (символы `@ : / ?` в пароле кодируй или используй
  hex — `openssl rand -hex 24` безопасен).
- `BETTER_AUTH_SECRET` менять потом нельзя без разлогина всех.

### 2.6. Первый запуск

**Вариант 1 — собирать на сервере** (просто, но сборка ест ~1 ГБ RAM):

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

**Вариант 2 — собрать у себя/в CI, сервер только тянет** (рекомендуется для слабого VPS):

```bash
# локально или в CI
docker login ghcr.io                     # нужен токен с write:packages
export IMAGE_TAG=2026-10-28
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -f deploy/docker-compose.prod.yml build app migrate
docker compose -f deploy/docker-compose.prod.yml push app migrate

# на сервере
export IMAGE_TAG=2026-10-28
docker compose -f deploy/docker-compose.prod.yml pull app migrate
docker compose -f deploy/docker-compose.prod.yml up -d --no-build
```

Что происходит по шагам: поднимается `db` → ждём `service_healthy` → запускается одноразовый `migrate`
(`prisma migrate deploy`) → **после его успешного завершения** стартует `app`. Приложение само миграции не делает.

### 2.7. Проверка первого деплоя

```bash
# 1. Состояние контейнеров: migrate — Exited (0), app — Up, db — healthy
docker compose -f deploy/docker-compose.prod.yml ps

# 2. Логи миграций
docker compose -f deploy/docker-compose.prod.yml logs migrate | tail -5
#    ожидаемо: "All migrations have been successfully applied."

# 3. Логи приложения
docker compose -f deploy/docker-compose.prod.yml logs app | tail -5
#    ожидаемо: "Server started"

# 4. Снаружи: health и страницы
curl -fsS https://wiki.example.com/health          # {"ok":true}
curl -fsS -o /dev/null -w '%{http_code}\n' https://wiki.example.com/
curl -fsS -o /dev/null -w '%{http_code}\n' https://wiki.example.com/wiki/ustanovka

# 5. TLS
docker compose -f deploy/edge/docker-compose.yml logs caddy | grep -i 'certificate obtained'
```

Открой сайт, войди под `ADMIN_CREDENTIALS` из `deploy/.env`, проверь `/admin/wiki` и редактор статьи.

### 2.8. После первого успешного запуска

- **Убери `ADMIN_CREDENTIALS` из `deploy/.env`** (или оставь только существующего админа) — функция не сбрасывает
  пароль существующему пользователю, но лишний пароль в файле ни к чему. Затем:
  `docker compose -f deploy/docker-compose.prod.yml up -d app` (пересоздаст контейнер с новым env).
- **Сразу настрой бэкапы**: раздел [4](#4-бэкапы). Потерять базу на этом этапе — обидно и бессмысленно.
- **Проверь, что порт приложения не опубликован**: `docker compose -f deploy/docker-compose.prod.yml ps` не должен
  показывать `0.0.0.0:3000`. Наружу — только Caddy.

### 2.9. Схема B — Kamal (если нужен push-to-deploy)

Отдельная инструкция: [docs/kamal.md](docs/kamal.md). Кратко: на сервере только `kamal-proxy` + контейнер, деплой
из GitHub Actions по пушу в `main`, база — accessory, миграции — pre-deploy hook. Не поднимай на том же VPS edge-Caddy.

---

## 3. Деплой новых фич после первого выклада

### 3.1. Локально: сделать и проверить

```bash
git checkout -b feature/search
# ... правки ...
bunx prettier --write <изменённые файлы>
bun run types
bun run build
bun run check:ui http://localhost:3001/wiki/ustanovka
```

Если менялась схема БД — миграция обязательна:

```bash
bun run prisma:migrate:dev -- --name add_search_index
bun run prisma:generate
git status                              # prisma/migrations/... должен попасть в коммит
```

Коммит и пуш:

```bash
git add -A
git commit -m "Add wiki search"
git push -u origin feature/search
# после ревью/мержа в main:
git checkout main && git pull
```

### 3.2. Деплой схемы A (compose)

**Если собираешь на сервере:**

```bash
cd ~/jarvis-web
git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

**Если собираешь локально/в CI:**

```bash
# локально
export IMAGE_TAG=$(git rev-parse --short HEAD)   # новый тег на каждый релиз
docker compose -f deploy/docker-compose.prod.yml build app migrate
docker compose -f deploy/docker-compose.prod.yml push app migrate

# на сервере
cd ~/jarvis-web
git pull                                          # нужен новый compose, если он менялся
export IMAGE_TAG=<тот же тег>
docker compose -f deploy/docker-compose.prod.yml pull app migrate
docker compose -f deploy/docker-compose.prod.yml up -d --no-build
```

Миграции применяются автоматически: compose запускает `migrate` и ждёт `service_completed_successfully`, только
потом пересоздаёт `app`. Если миграция упала — приложение не тронется (старый контейнер продолжит работать).

### 3.3. Деплой схемы B (Kamal)

```bash
git push origin main        # GitHub Actions сам соберёт :migrate и вызовет kamal deploy
# или локально:
kamal deploy                # pre-deploy hook применит миграции, потом переключит трафик
```

### 3.4. Проверка после деплоя

```bash
# compose
docker compose -f deploy/docker-compose.prod.yml ps            # migrate Exited (0), app Up
docker compose -f deploy/docker-compose.prod.yml logs -n 50 app
curl -fsS https://wiki.example.com/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://wiki.example.com/

# kamal
kamal app logs -n 50
curl -fsS https://wiki.example.com/health
```

Глазами: открыть изменённую страницу, проверить вход и админку. Если фича про загрузку картинок — загрузить одну и
убедиться, что она отдаётся по `/uploads/...`.

### 3.5. Откат

**Схема A, откат кода** (без отката схемы):

```bash
export IMAGE_TAG=<предыдущий тег>
docker compose -f deploy/docker-compose.prod.yml pull app migrate
docker compose -f deploy/docker-compose.prod.yml up -d --no-build
```

Тег мигратора — `<IMAGE_TAG>-migrate`, поэтому тянуть нужно оба образа, иначе compose полезет собирать недостающий.
Повторный `migrate` на уже применённой схеме безопасен: Prisma видит, что миграции в базе есть, и ничего не делает.

**Схема B:**

```bash
kamal rollback
```

**Про схему БД:** откат возвращает только код. Если миграция удалила/переименовала колонку, старый код на новой схеме
может сломаться. Безопасный путь: делать миграции совместимыми в обе стороны (добавить колонку → задеплоить код →
в следующем релизе удалить старую), а перед рискованным релизом снять бэкап вручную (раздел 4).

### 3.6. Чек-лист релиза

- [ ] `bun run types` и `bun run build` зелёные локально.
- [ ] Миграция закоммичена (если менялась схема).
- [ ] Свежий бэкап снят (или таймер отработал за последние сутки).
- [ ] Деплой прошёл, `migrate` завершился с кодом 0.
- [ ] `/health` = 200, изменённая страница открывается, вход работает.
- [ ] В логах нет ошибок и циклов рестарта.

---

## 4. Бэкапы

### 4.1. Что бэкапим

| Что                                 | Где                                                                    | Как                        |
| ----------------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| База (статьи, пользователи, сессии) | контейнер `jarvis-web-db` (Kamal) / `jarvis-web-db-1` (compose)        | `pg_dump`                  |
| Картинки                            | `/srv/jarvis-web/uploads` (Kamal) / том `jarvis-web_uploads` (compose) | `tar`                      |
| Секреты                             | `deploy/.env`, `deploy/edge/.env`, `.kamal/secrets`                    | вручную в менеджер паролей |
| Конфиги                             | `deploy/`, `config/`, `prisma/`                                        | уже в git                  |

Без `.env` восстановишь данные, но потеряешь `BETTER_AUTH_SECRET` — все сессии станут недействительны (придётся
войти заново), а `ADMIN_CREDENTIALS` восстановишь из менеджера паролей.

### 4.2. Скрипт

```bash
# Kamal: каталог с картинками
deploy/backup.sh

# compose: том
UPLOADS_VOLUME=jarvis-web_uploads DB_CONTAINER=jarvis-web-db-1 deploy/backup.sh
```

Результат в `BACKUP_DIR` (по умолчанию `./backups`):

```
db-2026-10-28.sql.gz
uploads-2026-10-28.tgz
```

Переменные: `BACKUP_DIR`, `DB_CONTAINER`, `POSTGRES_USER`, `POSTGRES_DB`, `UPLOADS_DIR`, `UPLOADS_VOLUME`,
`KEEP_DAYS` (по умолчанию 14). Скрипт удаляет только свои файлы старше `KEEP_DAYS`.

### 4.3. Раз в сутки через systemd

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
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis-backup.timer
systemctl list-timers jarvis-backup.timer
sudo journalctl -u jarvis-backup.service -n 30
```

`Persistent=true` догоняет пропущенный запуск, если сервер был выключен.

### 4.4. Уносить с сервера

Бэкап на том же диске защищает от ошибки, но не от потери VPS. Пример с `rclone` (S3-совместимое хранилище):

```bash
rclone config                                   # один раз: создать remote "s3"
rclone copy /var/backups/jarvis-web s3:jarvis-web-backups --bwlimit 5M
```

Добавь эту строку в конец `jarvis-backup.service` (через `ExecStartPost=`) или во вторую oneshot-службу.

### 4.5. Восстановление

**База** (приложение лучше остановить, чтобы никто не писал):

```bash
docker compose -f deploy/docker-compose.prod.yml stop app
docker exec -i jarvis-web-db-1 psql -U jarvis -d postgres \
  -c 'drop database jarvis' -c 'create database jarvis'
gzip -dc /var/backups/jarvis-web/db-2026-10-28.sql.gz | \
  docker exec -i jarvis-web-db-1 psql -U jarvis -d jarvis
docker exec jarvis-web-db-1 psql -U jarvis -d jarvis -c 'select count(*) from wiki_page'
docker compose -f deploy/docker-compose.prod.yml start app
```

Для Kamal контейнер называется `jarvis-web-db`.

**Картинки:**

```bash
tar xzf /var/backups/jarvis-web/uploads-2026-10-28.tgz -C /srv/jarvis-web/uploads    # Kamal
# compose: распаковать в том
docker run --rm -v jarvis-web_uploads:/data -v /var/backups/jarvis-web:/backup alpine \
  sh -c 'tar xzf /backup/uploads-2026-10-28.tgz -C /data'
```

### 4.6. Проверяй восстановление, а не наличие файлов

Раз в месяц (или после смены версии Postgres):

```bash
docker exec jarvis-web-db-1 psql -U jarvis -d postgres -c 'create database jarvis_restore'
gzip -dc /var/backups/jarvis-web/db-2026-10-28.sql.gz | \
  docker exec -i jarvis-web-db-1 psql -q -U jarvis -d jarvis_restore
docker exec jarvis-web-db-1 psql -U jarvis -d jarvis_restore -t -A -c 'select count(*) from wiki_page'
docker exec jarvis-web-db-1 psql -U jarvis -d postgres -c 'drop database jarvis_restore'
```

Проверено на этом проекте: дамп, снятый `deploy/backup.sh`, разворачивается в чистую базу, `wiki_page`: 7 → 7.

### 4.7. Мониторинг бэкапов

Минимум — проверять, что свежий файл появился:

```bash
find /var/backups/jarvis-web -name 'db-*.sql.gz' -mtime -1 | wc -l    # должно быть ≥ 1
```

Если хочется уведомлений — `healthchecks.io` (бесплатно): в конце `jarvis-backup.sh` дерни
`curl -fsS https://hc-ping.com/<uuid>`, сервис сам напишет, если пинг не пришёл.

---

## Приложение: шпаргалка

**Dev**

```bash
bun install && docker compose up -d db && bun run setup && bun run dev   # всё с нуля
bun run types && bun run check:ui http://localhost:3001/                  # проверка
```

**Prod (схема A)**

```bash
docker compose -f deploy/edge/docker-compose.yml up -d                   # edge, один раз
docker compose -f deploy/docker-compose.prod.yml up -d --build           # проект
docker compose -f deploy/docker-compose.prod.yml logs -f app migrate     # логи
curl -fsS https://<домен>/health                                         # проверка
```

**Порты**

| Где  | Порт   | Кто                                         |
| ---- | ------ | ------------------------------------------- |
| dev  | 3000   | сервер Point0                               |
| dev  | 3001   | клиент (открывать в браузере)               |
| prod | 80/443 | Caddy (edge)                                |
| prod | —      | приложение и Postgres наружу не публикуются |

**Что читать дальше:** [docs/deploy.md](docs/deploy.md) — второй проект на том же VPS, Postgres на хосте, Coolify;
[docs/kamal.md](docs/kamal.md) — деплой через Kamal; [AGENTS.md](AGENTS.md) — правила разработки.
