# syntax=docker/dockerfile:1
# Two stages: `build` installs everything and produces dist/, `runner` keeps the runtime and production deps only.

FROM oven/bun:1 AS build
WORKDIR /app

# Codegen and the point0 build read env at build time (Prisma config, `Routes.create({ origin })`), but the real values
# are only known at runtime — these placeholders exist so the build does not need your `.env`. Nothing secret is baked
# into the bundle: the server reads `process.env` when it starts.
ENV SERVER_URL=http://localhost:3000 \
    CLIENT_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-000000000000

# Dependencies first — this layer stays cached until package.json/bun.lock change.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# The point0 build generates its own points/routes; the Prisma client is generated separately and then bundled.
RUN bun run prisma:generate && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production

# `prisma migrate deploy` runs from the entrypoint, so the Prisma CLI (a production dependency) and the migrations have
# to travel with the image. Everything else in `dist/` is already bundled. The install cache is dropped in the same
# layer — it is ~450 MB of tarballs nobody needs at runtime.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache

COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run ./dist/server/index.server.js"]
