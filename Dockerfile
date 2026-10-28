# syntax=docker/dockerfile:1
# Three stages: `build` compiles everything, `migrate` is a one-shot image that applies the database migrations before a
# deploy, and `runner` (the last stage, so a plain `docker build .` gives the app) is the app itself with no
# dependencies on disk.

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

# Migrations live in their own image: a deploy runs it once, and the app image never needs the Prisma CLI.
# Only the CLI and `dotenv` are installed — not this app's dependency tree — hence the empty package.json below. The
# Prisma version is read from the app's package.json (`devDependencies`, because the CLI is a development tool) so the
# two cannot drift.
FROM oven/bun:1-slim AS migrate
WORKDIR /app

COPY package.json /tmp/app-package.json
RUN printf '{"name":"migrate","private":true}\n' > package.json \
    && bun add "prisma@$(bun -e 'console.log(require("/tmp/app-package.json").devDependencies.prisma)')" dotenv \
    && rm -rf /root/.bun/install/cache \
      node_modules/@electric-sql \
      node_modules/react \
      node_modules/react-dom \
      node_modules/@typescript \
      node_modules/bun-plugin-tailwind \
      node_modules/onnxruntime-node \
      node_modules/onnxruntime-web

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

CMD ["bunx", "prisma", "migrate", "deploy"]

# The runtime image: `dist/` only, no packages at all. The point0 engine does not import anything from node_modules at
# run time (the server bundle is self-contained); it only needs a directory named `node_modules` to put its cache in,
# because it resolves `node_modules/.cache/@point0/...` by walking up from the working directory.
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist

# An empty directory is all the engine asks for. Creating it in the image keeps the check happy without installing a
# single package, and the app is verified to boot and serve every page from this image.
RUN mkdir -p /app/node_modules && chmod 1777 /app/node_modules

EXPOSE 3000
CMD ["bun", "run", "./dist/server/index.server.js"]
