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

# Source maps are for debugging in dev — ~45 MB of nothing in the image. Stripped here, in the build stage, so the
# layers of the runner never contain them; only a trailing `sourceMappingURL` comment is dropped (a minified chunk is
# one line, so line-based editing would cut the code), otherwise Bun warns on start that it cannot decode the map.
RUN find dist -name '*.map' -delete && bun -e "const fs = require('node:fs'); for (const file of new Bun.Glob('dist/**/*.js').scanSync('.')) { const text = fs.readFileSync(file, 'utf8'); const stripped = text.replace(/\/\/# sourceMappingURL=\S+\s*$/, ''); if (stripped !== text) fs.writeFileSync(file, stripped) }"

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# `prisma migrate deploy` runs from the entrypoint, so the Prisma CLI (a production dependency) and the migrations have
# to travel with the image. Everything else in `dist/` is already bundled. `bun install` still drags in packages that
# only the CLI's own tooling (Studio, a local dev database) and the build need — they are removed in the same layer, so
# they never reach the image, and the app is verified to boot and serve without them. The install cache is dropped here
# too — it is ~450 MB of tarballs nobody needs at runtime.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && rm -rf /root/.bun/install/cache \
      node_modules/@electric-sql \
      node_modules/lowlight \
      node_modules/@typescript \
      node_modules/@babel

COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run ./dist/server/index.server.js"]
