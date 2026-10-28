# jarvis-web

Personal wiki built on Point0 — SSR, Markdown articles, Postgres, type-safe routing, all in TypeScript.
Sign-in and registration come from better-auth (`HttpOnly` session cookie); the admin panel covers users and articles.

## Run

```bash
bun install
docker compose up -d db   # Postgres 17 on localhost:5432 (user/password/db: jarvis)
bun run setup             # apply migrations, generate Prisma + point0 code, seed demo pages
bun run dev               # server :3000, client :3001 — open http://localhost:3001
```

Run `bun run setup` again after a fresh clone, or whenever you reset the database.
`docker compose down` stops the database; add `-v` to wipe its volume as well.

`src/generated/` (the Prisma client and point0's points/routes/assets) is gitignored — `bun run setup`
(or `point0 generate`) produces it. Without it typecheck fails and the app won't run.

The first admin comes from `ADMIN_CREDENTIALS` in `.env` and is created on startup, so there is a way in
before anyone signs up.

## Wiki

- `/` — wiki home: the section tree on the left, cards for top-level sections.
- `/wiki/<slug>` — an article: breadcrumbs, "On this page", Markdown with syntax highlighting and images.
- **Sections are pages with children** — there is no separate category entity. A page with subpages shows
  "Раздел · N" and lists them under its own text; a leaf is an article. So `Windows → Server → Установка` is just
  three pages, one inside another.

Editing lives in the admin panel:

- `/admin/wiki` — page list, indented by tree, with edit/view/delete;
- `/admin/wiki/new` and `/admin/wiki/:id` — the editor. It is [MDXEditor](https://mdxeditor.dev): WYSIWYG with a
  Markdown-source toggle, toolbar, tables, code blocks, and an image button that uploads straight into the post.

The article bodies are Markdown, rendered with `react-markdown` + GFM, heading anchors and `highlight.js`.

## Images

A single generic upload API: a `File` input on a point0 mutation, stored by `saveUpload(app, file)` under

```
<UPLOADS_DIR>/<app>/<year>/<month>/<uuid>.<ext>     # UPLOADS_DIR defaults to ./uploads
```

and served by `GET /uploads/*` with a long immutable cache. Today the app is `wiki`; a future section just calls
`saveUpload('blog', file)`. Only raster images (png/jpeg/webp/gif/avif) up to 10 MB are accepted — SVG is rejected
because it is same-origin active content.

## Admin

`/admin` — overview with counters; `/admin/users` — search, edit name/email, change roles, ban/unban
(a ban also revokes the user's sessions). Everything under `/admin` is gated by `role: 'admin'`.

## Production build

```bash
bun run build
bun run start
```

Or the whole stack in Docker (database + app):

```bash
docker compose up --build -d   # db + app on http://localhost:3000
docker compose logs -f app     # watch the app
docker compose down            # stop (add -v to wipe the database volume)
```

The image is multi-stage — `bun install` + `prisma generate` + `point0 build`, then a runtime image with production
dependencies and `dist/`. Its entrypoint applies `prisma migrate deploy` before starting the server, so a fresh
database is migrated on first boot. Uploaded images live on the `jarvis_uploads` volume, so rebuilding the image
does not lose them.

To run the container next to a local `bun run dev` (which already owns :3000), give it another host port:

```bash
APP_PORT=3100 APP_URL=http://localhost:3100 docker compose up -d --build app
```

## Deploy to a server

Two layers, so one VPS can host several projects:

- **edge** — a single Caddy (`deploy/edge/`) that owns `:80`/`:443`, gets Let's Encrypt certificates and proxies each
  domain to a container name on the shared `edge` network;
- **project** — this repo's `deploy/docker-compose.prod.yml`: its own Postgres and app, no published ports at all.

```bash
# once per VPS
cp deploy/edge/env.example deploy/edge/.env            # ACME email
docker compose -f deploy/edge/docker-compose.yml up -d

# per project
cp deploy/env.example deploy/.env                       # secrets + public URLs
chmod 600 deploy/.env
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

Adding another project is a new `deploy/edge/sites/<name>.caddy` plus a unique network alias in that project's compose.
The full runbook — DNS, firewall, backups, updates, the host-Postgres variant and when to use
[Coolify](https://coolify.io) instead — is in [docs/deploy.md](./docs/deploy.md).

## For a real app

For a fuller foundation — auth, admin, billing, and more — see [FOR_A_REAL_APP.md](./FOR_A_REAL_APP.md).
