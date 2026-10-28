# AGENTS.md

Инструкции для AI-агентов (DeepSeek Harness, Codex, Cursor, Claude Code — см. `CLAUDE.md`).
Человеку этот файл тоже полезен: он объясняет, как устроен проект и что здесь принято.

## Что это за проект

`jarvis-web` — fullstack-приложение на **Point0** (Bun + React 19 + TypeScript + Prisma/Postgres + Tailwind v4).
Главная страница — **вики**: дерево разделов слева, статьи в markdown с подсветкой кода, оглавлением и картинками;
статьи редактируются в админке визуальным редактором (MDXEditor), картинки грузятся в `uploads/<app>/<год>/<месяц>`
и отдаются универсальным маршрутом `/uploads/*`. Авторизация — **better-auth** (вход, регистрация, выход, `/profile`,
`HttpOnly`-cookie), админка `/admin` (пользователи, роли, баны), Postgres 17 и приложение живут в Docker.
Репозиторий — https://github.com/ram0973/jarvis-web (ветка `main`). Дальше по плану — сброс пароля и подтверждение
почты.

## Перед началом работы

1. Прочитай `src/engine.ts`, `src/lib/root.tsx` и `src/pages/home.tsx` — на этих трёх файлах держится всё приложение.
2. По возможностям Point0 **не угадывай** — спроси документацию, она лежит локально:
   - `bunx point0 docs search "<вопрос>"` и `bunx point0 docs get <slug>`
   - `bunx point0 docs list` — список всех тем
   - MCP-серверы из `.mcp.json`: `point0-docs` (`search_docs`, `get_doc`, `list_docs`) и
     `point0-project` (`list_points`, `get_point`, `compile`, `trace`)
3. Зависимости не добавляй без согласия: сначала предложи решение на том, что уже установлено.

## Команды

| Команда                                      | Что делает                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `bun install`                                | установить зависимости (нужен Bun ≥ 1.4)                                     |
| `docker compose up -d db`                    | поднять Postgres 17 в Docker (`localhost:5432`, user/password/db — `jarvis`) |
| `docker compose up -d --build`               | собрать и поднять `db` + `app` (приложение на `:3000`)                       |
| `docker compose logs -f app`                 | логи приложения в контейнере                                                 |
| `docker compose down`                        | остановить (`-v` — вместе с данными)                                         |
| `bun run dev`                                | dev-сервер: сервер `:3000`, клиент `:3001` — в браузере открывать клиент     |
| `bun run generate`                           | пересобрать `src/generated/point0` (нужно после новых/переименованных точек) |
| `bun run types`                              | `tsc --noEmit` — единственная «проверка кода» в проекте                      |
| `bun run build` / `bun run start`            | production-сборка / запуск собранного сервера                                |
| `bun run setup`                              | применить миграции (deploy) + генерация + seed (первый запуск или сброс БД)  |
| `bun run prisma:migrate:dev -- --name <имя>` | новая миграция после правки схемы                                            |
| `bun run prisma:generate`                    | перегенерировать Prisma-клиент                                               |
| `bun run seed`                               | пересоздать демо-данные (`src/lib/seed.ts`)                                  |
| `bun run prisma:reset`                       | снести и заново применить миграции                                           |

## Карта проекта

| Путь                                                  | Роль                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/engine.ts`                                       | конфиг Point0: SSR, порты, пути кодогенерации, список клиентских env-переменных                        |
| `src/index.server.ts` → `src/app.server.ts`           | серверный вход: preload → `serverEnv.validate()` → `engine.serve()`                                    |
| `src/index.client.tsx` → `src/app.client.tsx`         | клиентский вход: провайдеры (react-query, unhead), роутер, `mount()`                                   |
| `src/lib/root.tsx`                                    | корневая точка: transformer, класс ошибок, prefetch, loading/error UI, middleware, OpenAPI             |
| `src/layouts/general.tsx`                             | общий layout: шапка, навигация, контейнер                                                              |
| `src/pages/home.tsx`                                  | главная вики `/`: карточки разделов дерева                                                             |
| `src/pages/about.mdx`                                 | страница `/about` в MDX                                                                                |
| `src/lib/navigation.ts`                               | типизированные `Link` / `NavLink` / `navigate` над сгенерированными роутами                            |
| `src/lib/prisma.ts`                                   | Prisma-клиент через `PrismaPg` (Postgres) — только сервер                                              |
| `src/lib/auth/server.ts`                              | `authServer`: better-auth + Prisma-адаптер, admin-плагин, секрет; `getMe` — единственное чтение сессии |
| `src/lib/auth/api.ts`                                 | `getMeQuery` — клиентский `me`, `staleTime: Infinity`, обновляется вручную после входа/выхода          |
| `src/lib/auth/client.ts`                              | `authClient` (только браузер, только мутации) и `signOut()`                                            |
| `src/lib/auth/plugins.ts`                             | гейты: `mePlugin`, `authorizedOnlyPlugin`, `redirectUnauthorizedPlugin`, `adminOnlyPlugin`             |
| `src/lib/auth/init.ts`                                | создание/повышение первого админа из `ADMIN_CREDENTIALS` при старте                                    |
| `src/pages/sign-in.tsx`, `sign-up.tsx`                | формы входа и регистрации (better-auth, cookie)                                                        |
| `src/pages/profile.tsx`                               | пример страницы под гейтом `redirectUnauthorizedPlugin`                                                |
| `src/pages/admin/layout.tsx`, `home.tsx`, `users.tsx` | каркас админки (префикс `/admin` + гейт), обзор, управление пользователями                             |
| `src/lib/admin/users.ts`                              | админские query/mutation: список, роли, бан (каждый под `adminOnlyPlugin`)                             |
| `src/layouts/wiki.tsx`                                | каркас вики: залипающее дерево слева + статья справа                                                   |
| `src/lib/wiki/tree.ts`                                | чистые хелперы: `buildTree`, `flattenTree`, `pathTo`, `slugify` (транслит кириллицы)                   |
| `src/lib/wiki/api.ts`                                 | `wikiTreeQuery`, админский список/страница, CRUD-мутации; Prisma — только внутри loader'ов             |
| `src/lib/wiki/upload.ts`                              | мутация загрузки картинки + action `GET /uploads/*`                                                    |
| `src/lib/wiki/storage.ts`                             | серверное хранение файлов (`server-only`): `<UPLOADS_DIR>/<app>/<год>/<месяц>/`                        |
| `src/pages/wiki/page.tsx`                             | статья `/wiki/:slug`: хлебные крошки, TOC, markdown                                                    |
| `src/pages/admin/wiki/`                               | список страниц, создание, редактор (`/admin/wiki`, `/admin/wiki/new`, `/admin/wiki/:id`)               |
| `src/ui/wiki/`                                        | `sidebar`, `markdown`, `toc`, `editor` (MDXEditor)                                                     |
| `src/ui/form.tsx`                                     | `TextField` / `FormError` / `SubmitButton` — общие примитивы форм                                      |
| `src/lib/env/`                                        | zod-схемы env и ленивая валидация                                                                      |
| `src/lib/error.ts`                                    | `AppError` (Error0 + плагины status/code/meta/redirect)                                                |
| `src/lib/query-client.ts`                             | общий `QueryClient`                                                                                    |
| `src/styles/index.css`                                | Tailwind v4 + typography                                                                               |
| `src/ui/`                                             | переиспользуемые компоненты (сейчас `ErrorBoundary`)                                                   |
| `prisma/schema.prisma`, `prisma/migrations/`          | схема и миграции Postgres                                                                              |
| `docker-compose.yml`                                  | `db` (Postgres 17) + `app` (образ приложения); тома `jarvis_db`, `jarvis_uploads`                      |
| `src/generated/**`                                    | кодогенерация Point0 и Prisma — **не править руками**                                                  |

## Point0 за десять строк

- **Точка (point)** — всё: страница, layout, query, mutation, action, component. Одна и та же цепочка, которая
  открывается `.lets.<тип>(...)` и закрывается тем же словом: `root.lets.page('/x') … .page(component)`.
- **Имя точки выводится из имени переменной** (`ideaListQuery` → `ideaList`). Имена переменных — часть контракта:
  по ним строятся id точек и имена роутов (`route="home"` в ссылках). Переименовал точку — перегенерируй.
- **`.loader` и `.ctx` выполняются только на сервере**: компилятор вырезает их тела и импорты из клиентского бандла.
  Поэтому Prisma можно импортировать только в серверных методах и модулях — никогда в теле React-компонента.
- **Сервер и клиент в одном файле.** Один `.tsx` может содержать и загрузчик с БД, и компонент; разделять их руками
  не нужно.
- **`src/generated/point0/`** (`meta.ts`, `points.*.ts`, `routes.ts`, `assets.d.ts`) создаёт компилятор.
- Роутинг, SSR, prefetch, loading/error — наследуются от `root` и `generalLayout`; вручную их обычно не настраивают.

## Авторизация (better-auth)

- Модели `User` / `Session` / `Account` / `Verification` — это **схема better-auth**, а не наша. Переименовывать поля
  нельзя; менять — только вместе с конфигом в `src/lib/auth/server.ts` и с проверкой реального входа.
- Весь `/api/auth/*` (регистрация, вход, выход, get-session) отдаёт better-auth через один middleware в
  `src/lib/root.tsx`. Свои эндпоинты для входа писать не нужно и нельзя.
- `authServer` — серверный модуль (`@point0/core/server-only`). В клиентский бандл он не попадает: проверка —
  `bunx point0 compile src/lib/root.tsx --side client` не должна содержать `authServer` и `/api/auth`.
- **Сессия живёт в `HttpOnly`-cookie** `better-auth.session_token` (`HttpOnly; SameSite=Lax; Path=/; Max-Age=7 дней`;
  `Secure` включается сам, когда `baseURL` — https). JS её не видит и не должен: `document.cookie` для авторизации
  не читаем, токен не кладём в `localStorage` и не передаём в URL. Единственные две точки чтения сессии —
  `getMe()` на сервере и `getMeQuery` на клиенте.
- **Не возвращай сырую сессию из loader'а.** Всё, что вернул loader или `.with`, сериализуется в HTML для гидрации,
  и `HttpOnly` перестаёт защищать токен. Поэтому `getMe` вырезает `session.token`; если пишешь свой загрузчик с
  сессией — делай так же (на этом уже один раз утёк токен в `/profile`).
- `authClient` — только браузер и только мутации (вход, регистрация, выход). Чтение — через `getMeQuery`, чтобы у всех
  потребителей был один кэш и одно состояние.
- **Гейтить страницы и мутации — плагинами, а не middleware** (middleware серверный и не защищает клиентскую
  навигацию). Готовые гейты в `src/lib/auth/plugins.ts`:

  | Плагин                       | Для чего                                                   |
  | ---------------------------- | ---------------------------------------------------------- |
  | `redirectUnauthorizedPlugin` | страница только для своих; аноним → редирект на `signIn`   |
  | `authorizedOnlyPlugin`       | то же, но аноним получает `UNAUTHORIZED` вместо редиректа  |
  | `redirectAuthorizedPlugin`   | не пускать уже вошедших на `signIn` / `signUp`             |
  | `adminOnlyPlugin`            | только `role === 'admin'`, иначе `FORBIDDEN` (для админки) |

  Пример — `src/pages/profile.tsx`: `.use(redirectUnauthorizedPlugin)` и дальше `me` в `props`.

- Первый админ: `ADMIN_CREDENTIALS=email:password` в `.env`; `ensureInitialAdmin()` создаёт пользователя (пароль
  хэширует сам better-auth, в `Account.password`) или повышает роль существующего. Пароль — от 8 символов.
  Если пользователь уже есть, новый пароль из env **не применится** — только роль. Полный сброс в разработке:
  `docker compose down -v` (стирает том Postgres) → `docker compose up -d db` → `bun run setup`.
- Формы собираем из `src/ui/form.tsx` (`TextField`, `FormError`, `SubmitButton`): своего form-стека в проекте нет,
  и тянуть библиотеку ради двух полей не надо. Образец — `src/pages/sign-in.tsx`.
- Проверка вручную без браузера: вход — `POST /api/auth/sign-in/email`, затем `GET /profile` с cookie; анонимный
  `GET /profile` обязан ответить `302` на `/sign-in`.

## Админка

- Раздел растёт от `generalLayout` через `adminLayout` (`src/pages/admin/layout.tsx`): layout владеет префиксом
  `/admin` и гейтом, поэтому шапка сайта остаётся на месте. Новая страница — `adminLayout.lets.page('/x')` **плюс**
  `.use(adminOnlyPlugin)` на самой странице: не оставляй защиту только на layout.
- Страницы: `home.tsx` (`/admin`), `users.tsx` (`/admin/users`).
- Запросы и мутации раздела — `src/lib/admin/users.ts`. **Каждый** query/mutation повторяет `.use(adminOnlyPlugin)`:
  layout гейтит рендер, а эндпоинт запроса — отдельный HTTP-путь, который иначе открыт любому.
- Роли меняем обычным Prisma-апдейтом, а бан — через `authServer.api.banUser` / `unbanUser`: он же отзывает живые
  сессии, иначе забаненный остаётся в системе до истечения cookie. Мутации запрещают трогать себя самого —
  иначе админ запирает панель (своего «супер-админа» в модели нет).
- Правка профиля (`adminUserUpdateMutation`) меняет `name` и `email`. Email уникален в схеме: конфликт приходит
  как Prisma `P2002` и превращается в `CONFLICT` → 409, а не в 500 с текстом базы.
- Список пользователей выбирает поля явно (`select`) и никогда не тянет `Account.password` — пароль лежит в другой
  таблице, её админка не читает.
- **Коды ошибок = HTTP-статусы.** `AppError` собран на `codeStatusPlugin` (`src/lib/error.ts`): `UNAUTHORIZED` → 401,
  `FORBIDDEN` → 403, `CONFLICT` → 409. Новый код добавляй в карту там же, иначе он станет 500.
- Статусы видно и снаружи: аноним на `/admin` получает **403**, а не пустую страницу; чужая мутация — тоже 403.

## Вики

- Модель `WikiPage` (`prisma/schema.prisma`): `slug` (публичный URL `/wiki/<slug>`, уникальный), `title`, `content`
  (markdown), `parentId` (дерево), `position` (порядок соседей). Удалить страницу с детьми нельзя: внешний ключ
  объявлен с `Restrict`, БД вернёт `P2003`, а мутация превратит его в `CONFLICT` → 409.
- Публичная часть: `/` — главная вики (карточки разделов), `/wiki/:slug` — статья. Каркас — `src/layouts/wiki.tsx`:
  залипающее дерево слева (`src/ui/wiki/sidebar.tsx`) и статья справа с хлебными крошками и TOC.
- Дерево строится из плоского списка (`buildTree`), ветка с открытой статьёй раскрывается сама; порядок соседей —
  `position`, затем заголовок. Slug генерируется транслитом (`slugify`), но его можно править руками — это URL.
- **Статья грузится своим `.loader`, а не `.with(query)`**: только так SSR реально ждёт данные, иначе страница
  отдаёт «Please wait» и догружается на клиенте. Оглавление считается на сервере тем же `github-slugger`, чьи id
  ставит `rehype-slug`.
- Markdown: `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-highlight`; raw HTML намеренно выключен.
  Подсветка кода — тема `github-dark` из `highlight.js`, подключена в `src/styles/index.css`.
- **Редактор** — `@mdxeditor/editor`: WYSIWYG с переключением в markdown-исходник и вставкой картинки из тулбара.
  Он браузерный, поэтому страницы `/admin/wiki/new` и `/admin/wiki/:id` помечены `.clientOnly()` — импорт редактора
  вырезается из серверного бандла. Не возвращай `lazy(() => import(...))`: с ним ломался `point0 build`
  («Multiple files share the same output path ./index.server.js»).
- **Загрузка картинок — универсальная.** Мутация `wikiImageUploadMutation` (`z.file()`) вызывает
  `saveUpload(app, file)`, а тот кладёт файл в `<UPLOADS_DIR>/<app>/<YYYY>/<MM>/<uuid>.<ext>` и возвращает
  `/uploads/<app>/...`. Сейчас `app` = `wiki`; новому разделу достаточно вызвать `saveUpload('blog', file)`.
- **Отдача файлов** — action `GET /uploads/*` (`src/lib/wiki/upload.ts` → `serveUpload`): проверяет, что путь остался
  внутри `UPLOADS_DIR` (иначе 404), отдаёт `content-type` и `immutable`-кэш. Рантайм-файлы нельзя держать в
  `public/` — сборка копирует его один раз, и загруженное после сборки просто не попадёт в раздачу.
- Ограничения загрузки: только растр (png/jpeg/webp/gif/avif; SVG отклоняется — это same-origin XSS), до 10 МБ.
- В Docker `UPLOADS_DIR=/data/uploads` и том `jarvis_uploads`, иначе картинки исчезнут при пересборке образа.
- **Главная ловушка сборки:** серверный код должен жить внутри тел loader'ов. Модульный хелпер, который трогает
  `prisma` или `node:fs`, из клиента не вырезается и тянет `pg` в браузер — build падает на
  «Browser build cannot require() Node.js builtin: dns/tls». Поэтому хранилище — отдельный `server-only` модуль
  `src/lib/wiki/storage.ts`, который подтягивается динамическим `import()` внутри loader'а и action'а.

## База данных (Postgres в Docker)

- База — **Postgres 17** в контейнере: `docker compose up -d db`. Креды по умолчанию `jarvis` / `jarvis` / `jarvis`,
  порт `5432`, данные в томе `jarvis_db`. `docker compose down -v` стирает данные.
- `DATABASE_URL=postgresql://jarvis:jarvis@localhost:5432/jarvis` — в `.env` и `env.example`, других мест нет.
  Приложение ходит в базу через `PrismaPg` (`src/lib/prisma.ts`), better-auth — через `provider: 'postgresql'`.
- SQLite больше нет: `dev.db` удалён, `@prisma/adapter-libsql` снят с зависимостей, старые SQLite-миграции удалены.
  Не возвращай их «для простоты» — схема и миграции теперь Postgres-only.
- Миграции: `bun run prisma:migrate:dev -- --name <имя>` пишет новую миграцию и применяет её; для чистой базы —
  `bun run prisma:migrate:deploy` (это же делает `bun run setup`). После миграции — `bun run prisma:generate`.
- Идентификаторы — uuid, генерируются клиентом (`@default(uuid())`). У пользователя есть ещё `sn` — короткий
  номер из последовательности Postgres (`#1`, `#2`, …): он объявлен в better-auth `user.additionalFields`
  (`input: false`), иначе `me.user.sn` не появится в сессии. Показываем его в админке и профиле; ключом он не
  становится — снаружи везде uuid.
- **Приложение в Docker.** `Dockerfile` — две стадии: `build` (bun install → `prisma:generate` → `point0 build`) и
  `runner` (только production-зависимости + `dist/` + `prisma/`). Entrypoint: `prisma migrate deploy`, затем
  `dist/server/index.server.js`. Сервис `app` ждёт `db` до `service_healthy`, поэтому миграции всегда идут в
  готовую базу.
- Хост-порт приложения настраивается: `APP_PORT` (по умолчанию 3000) и `APP_URL` (по умолчанию
  `http://localhost:3000`) — чтобы контейнер жил рядом с локальным `bun run dev`:
  `APP_PORT=3100 APP_URL=http://localhost:3100 docker compose up -d --build app`.
- В образ секреты не запекаются: на этапе сборки стоят заглушки (`ENV` в стадии `build`), реальные
  `BETTER_AUTH_SECRET` / `ADMIN_CREDENTIALS` приходят из твоего `.env` через подстановку compose; `.env` в образ
  не копируется (`.dockerignore`).

## Правила: как добавлять код

1. **Новая страница** — файл `src/pages/<имя>.tsx`, default export точки, открытой от `generalLayout` (а не от `root`),
   чтобы страница получила общий каркас. После этого — `bun run generate` (dev-сервер делает это сам).

   ```tsx
   import { generalLayout } from '@/layouts/general'

   export default generalLayout
     .lets('page', 'ideas', '/ideas')
     .head('Ideas')
     .page(() => <div className="space-y-6" />)
   ```

2. **Данные страницы** — либо свой `.loader`, либо отдельный `root.lets.query()` и подключение через
   `.with(query, ({ params }) => ({ … }))`. Query/mutation держи рядом со страницей; выноси в `src/lib/<домен>.ts`,
   только когда он нужен нескольким страницам.
3. **Мутации** — `root.lets.mutation().input(z.object({…})).loader(…).mutation({ onSuccess })`, после успеха —
   `void someQuery.invalidateQuery(true)` (пример — `src/pages/home.tsx`).
4. **Ссылки** — только через `@/lib/navigation` и по имени роута: `<Link route="about">`, `navigate('home')`.
   Хардкодить `href="/about"` не нужно и не надо.
5. **Серверный код** — только через `@/lib/prisma`. Модуль, который не должен попасть в браузер, начинается с
   `import '@point0/core/server-only'` (см. `src/lib/prisma.ts`).
6. **Env** — переменную сначала добавляешь в zod-схему в `src/lib/env/` (`shared.ts` — общее, `server.ts` — секреты,
   `client.ts` — публичное), потом в `.env` и `env.example`. В коде читаешь через `serverEnv` / `clientEnv`, не через
   `process.env`. Секреты в `sharedEnvShape`/`clientEnvShape` попадают в браузер — никогда.
   `env.example` намеренно без точки в начале: `.gitignore` игнорирует `.env*`.
7. **Схема БД** — правишь `prisma/schema.prisma` → `bun run prisma:migrate:dev -- --name <что_изменил>` →
   `bun run prisma:generate`. Миграции руками не редактируем.
8. **Стили** — Tailwind-утилиты прямо в JSX; для текста из MDX — `prose`. Глобальные стили только в
   `src/styles/index.css`.
9. **TypeScript** — strict, алиас `@/*` → `src/*`, zod как `import * as z from 'zod'`. Без `any` и `@ts-ignore`:
   если тип не сходится — чини причину.
10. **Комментарии** — по-английски и про «почему», как в существующих файлах. **Форматирование** — Prettier
    (`.prettierrc`): без точек с запятой, одинарные кавычки, 120 колонок. Перед сдачей:
    `bunx prettier --write <изменённые файлы>`.
11. **Язык** — с пользователем общайся по-русски, код, комментарии и названия — по-английски. Тексты интерфейса
    массово не переводи и не переписывай без запроса.

## Определение готовности

- `bun run types` проходит — это обязательный минимум, без него «готово» не бывает.
- Менял точки или роуты → выполнил `bun run generate` (или dev уже перегенерировал).
- Менял схему → миграция создана и применена, `bun run prisma:generate` выполнен.
- Трогал базу → `docker compose ps` показывает `db` в статусе healthy, миграции применены
  (`bun run prisma:migrate:deploy`), а приложение подключается по `DATABASE_URL` из `.env`.
- Трогал вход/сессии → `curl http://localhost:3000/api/auth/ok` отвечает `{"ok":true}`, `POST /api/auth/sign-in/email`
  возвращает пользователя, анонимный `GET /profile` отдаёт `302` на `/sign-in`, а с cookie — профиль.
- Токен сессии не должен появляться в HTML-пейлоаде: `curl -s http://localhost:3001/profile | Select-String 'session_token='`
  не должен ничего находить.
- Трогал админку → анонимный `GET /admin` отдаёт **403**, админ видит список на `/admin/users`, а роль и бан
  сохраняются (повторный запрос списка показывает новое состояние; бан вдобавок убивает сессии пользователя).
- Трогал вики → `GET /wiki/<slug>` отдаёт 200 с отрендеренным markdown (`<h2`, `hljs`, `<table>`), несуществующий
  slug — **404**, анонимный `GET /admin/wiki` — **403**. Загрузка: `curl -F "file=@x.png" …/wiki-image-upload`
  возвращает `/uploads/wiki/<год>/<месяц>/…`, и этот URL открывается как `image/*`.
- Менял UI → `bun run dev` и открыл `http://localhost:3001`: страница рендерится, в консоли браузера нет ошибок.
- Не заявляй об успехе, если не запускал проверку.

## Нельзя без явного разрешения

- править `src/generated/**`, `prisma/migrations/**`; коммитить `.env` и данные БД (том Docker);
- менять версии и состав зависимостей в `package.json`;
- переименовывать существующие точки/роуты, менять дизайн-систему или тексты интерфейса;
- переписывать стадии в `Dockerfile` без нужды: `build` держит заглушки env только для кодогенерации, а `runner`
  не должен получать `.env` или секреты внутрь образа;
- запускать `bun run dev` в фоне через `&`: `bunfig.toml` включает `noOrphans = true`, и процесс умрёт вместе
  с одноразовой оболочкой. Для долгого запуска — управляемый background job.

## Git

- Репозиторий — `https://github.com/ram0973/jarvis-web`, ветка `main`, автор коммитов
  `ram0973 <ram0973@gmail.com>`. Коммит — короткий императив по-английски, тело объясняет «почему».
- `.env`, `node_modules/`, `dist/`, `src/generated/` и данные БД не коммитятся (`.gitignore`); окончания строк в
  репозитории — LF (`.gitattributes`), потому что приложение собирается и живёт в Linux-контейнере.

## Известные проблемы и долги

- **Имя приложения рассогласовано:** `package.json` → `my-app`, `<title>` в `src/index.html` → `IdeaNick`,
  head в `src/lib/root.tsx` → «My App».
- **Вики пока без поиска, истории версий и редиректа при смене slug**: переименовали slug — старая ссылка даёт 404.
  Картинки вставляются без подписей (`figure`/`figcaption`), а `about.mdx` остался от стартера.
- **Авторизация недоделана (по плану):** нет сброса пароля и подтверждения почты (`emailVerified` всегда `false` —
  нет почтового сервиса), в админке нет удаления пользователя и просмотра его сессий.
- **Нет тестов и линтера** (eslint не установлен, хотя в `src/index.client.tsx` остался `eslint-disable`-комментарий).
