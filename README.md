# jarvis-web

A fullstack app built with Point0 — SSR, Prisma + Postgres, Tailwind, type-safe routing, all in TypeScript.
Batteries included so far: better-auth (email + password, `HttpOnly` session cookie) and an admin panel at `/admin`.

## Run

```bash
bun install
docker compose up -d db   # Postgres 17 on localhost:5432 (user/password/db: jarvis)
bun run setup             # apply migrations, generate Prisma + point0 code, seed demo data
bun run dev               # server :3000, client :3001 — open http://localhost:3001
```

Run `bun run setup` again after a fresh clone, or whenever you reset the database.
`docker compose down` stops the database; add `-v` to wipe its volume as well.

`src/generated/` (the Prisma client and point0's points/routes/assets) is gitignored — `bun run setup`
(or `point0 generate`) produces it. Without it typecheck fails and the app won't run.

The first admin comes from `ADMIN_CREDENTIALS` in `.env` and is created on startup, so there is a way in
before anyone signs up.

## Admin

`/admin` — overview with counters; `/admin/users` — search, edit name/email, change roles, ban/unban
(a ban also revokes the user's sessions). Everything under `/admin` is gated by `role: 'admin'`.

## Events, for the record

- `/` — the `Idea` playground: a Prisma model, a query that lists rows, a mutation that adds one.
- `/about` — an MDX page.
- `/sign-in`, `/sign-up`, `/profile` — auth pages; `/profile` is the example of a gated page.

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
database is migrated on first boot.

To run the container next to a local `bun run dev` (which already owns :3000), give it another host port:

```bash
APP_PORT=3100 APP_URL=http://localhost:3100 docker compose up -d --build app
```

## For a real app

For a fuller foundation — auth, admin, billing, and more — see [FOR_A_REAL_APP.md](./FOR_A_REAL_APP.md).
