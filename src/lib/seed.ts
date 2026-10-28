import { prisma } from '@/lib/prisma'

// The wiki starts with a small, real structure: one section plus its articles, and a second top-level section. It is
// meant to be edited — the pages exist to show the tree, the TOC, the code blocks and the image handling, not to be
// preserved.
const pages = [
  {
    slug: 'nachalo-raboty',
    title: 'Начало работы',
    position: 0,
    parent: null,
    content: `Стартовая страница раздела: как устроена вики и с чего начать.

## Что это

Jarvis Wiki — база знаний проекта. Каждая статья — markdown-документ, дерево слева строится по полю «parent»,
а порядок соседей — по полю «position».

## Как добавить статью

1. Войдите админом и откройте **Admin → Wiki**.
2. Нажмите **New page**, задайте заголовок — slug сгенерируется сам (кириллица транслитерируется).
3. Выберите родительскую страницу, чтобы статья встала в нужное место дерева.
4. Пишите прямо в редакторе: картинки вставляются кнопкой в тулбаре и грузятся в \`uploads/wiki/год/месяц\`.

> Подсказка: предпросмотр не нужен — редактор сразу показывает готовый вид. Переключите его в режим
> исходника, если нужно править разметку руками.
`,
  },
  {
    slug: 'ustanovka',
    title: 'Установка',
    position: 0,
    parent: 'nachalo-raboty',
    content: `Локальный запуск — три команды после клонирования.

## Требования

- Bun 1.4+
- Docker (для Postgres)

## Запуск

\`\`\`bash
bun install
docker compose up -d db
bun run setup
bun run dev
\`\`\`

Приложение поднимется на \`http://localhost:3001\` (клиент) и \`http://localhost:3000\` (сервер).

## Если что-то не так

| Симптом | Причина |
| --- | --- |
| \`P1001\` при миграциях | Postgres не запущен |
| Порт занят | уже работает другой \`bun run dev\` |
| Нет админа | не задан \`ADMIN_CREDENTIALS\` в \`.env\` |
`,
  },
  {
    slug: 'pervye-shagi',
    title: 'Первые шаги',
    position: 1,
    parent: 'nachalo-raboty',
    content: `После первого входа стоит сделать три вещи.

## 1. Сменить пароль админа

Пароль приходит из \`ADMIN_CREDENTIALS\`. В разработке сброс — это \`docker compose down -v\`, затем
\`docker compose up -d db\` и \`bun run setup\`.

## 2. Завести структуру

Создайте разделы верхнего уровня (например «Сеть», «Серверы», «Процессы») и уже в них — статьи.

## 3. Проверить загрузку картинок

Вставьте любую картинку в статью — файл появится в \`uploads/wiki/<год>/<месяц>/\`, а в markdown — ссылка вида
\`/uploads/wiki/2026/10/<uuid>.png\`.
`,
  },
  {
    slug: 'set',
    title: 'Сеть',
    position: 1,
    parent: null,
    content: `Раздел про сеть: адресация, VLAN, маршрутизация, диагностика.

## План раздела

- [x] Раздел создан
- [ ] Адресация и подсети
- [ ] VLAN на коммутаторах
- [ ] Диагностика через \`ping\` и \`traceroute\`

Добавляйте статьи через **Admin → Wiki → New page**, выбирая этот раздел как родителя.
`,
  },
] as const

export const seed = async () => {
  await prisma.wikiPage.deleteMany()

  const ids = new Map<string, string>()
  for (const page of pages) {
    if (page.parent) {
      continue
    }
    const created = await prisma.wikiPage.create({
      data: { slug: page.slug, title: page.title, content: page.content, position: page.position },
      select: { id: true },
    })
    ids.set(page.slug, created.id)
  }
  for (const page of pages) {
    if (!page.parent) {
      continue
    }
    const parentId = ids.get(page.parent)
    if (!parentId) {
      throw new Error(`Seed: unknown parent "${page.parent}" for "${page.slug}"`)
    }
    await prisma.wikiPage.create({
      data: {
        slug: page.slug,
        title: page.title,
        content: page.content,
        position: page.position,
        parentId,
      },
    })
  }
}

if (import.meta.main) {
  seed()
    .then(() => {
      console.info(`Seeded ${pages.length} wiki pages.`)
    })
    .catch((error) => {
      console.error('Seed failed.', error)
      process.exitCode = 1
    })
}
