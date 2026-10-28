// Pure tree helpers for the wiki sidebar — no Prisma, no React, so they are trivial to reason about and reuse.

export type WikiNodeBase = {
  id: string
  slug: string
  title: string
  parentId: string | null
  position: number
}

export type WikiPageNode = WikiNodeBase

export type WikiTreeNode<T extends WikiNodeBase = WikiNodeBase> = T & { children: WikiTreeNode<T>[] }

const byPosition = (a: WikiNodeBase, b: WikiNodeBase) => a.position - b.position || a.title.localeCompare(b.title, 'ru')

/** Flat rows → nested tree. Roots first, siblings ordered by `position`, then title. */
export const buildTree = <T extends WikiNodeBase>(pages: T[]): WikiTreeNode<T>[] => {
  const nodes = new Map<string, WikiTreeNode<T>>()
  for (const page of pages) {
    nodes.set(page.id, { ...page, children: [] })
  }

  const roots: WikiTreeNode<T>[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortLevel = (level: WikiTreeNode<T>[]) => {
    level.sort(byPosition)
    for (const node of level) {
      sortLevel(node.children)
    }
  }
  sortLevel(roots)
  return roots
}

/** Tree → flat list with depth, for indented admin tables. */
export const flattenTree = <T extends WikiNodeBase>(
  tree: WikiTreeNode<T>[],
  depth = 0,
): Array<{ node: WikiTreeNode<T>; depth: number }> =>
  tree.flatMap((node) => [{ node, depth }, ...flattenTree(node.children, depth + 1)])

/** Root → … → page: the chain that breadcrumbs and the auto-expanded sidebar need. */
export const pathTo = (pages: WikiNodeBase[], target: { id: string } | { slug: string }): WikiNodeBase[] => {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const start = 'id' in target ? byId.get(target.id) : pages.find((page) => page.slug === target.slug)

  const chain: WikiNodeBase[] = []
  let cursor = start
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    chain.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return chain
}

const translit: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

/**
 * Title → URL segment. Cyrillic is transliterated, because a slug is a path people read and paste; the DB keeps it
 * unique, so two pages with the same title need a different slug. The admin UI suggests this value, the server only
 * validates the shape.
 */
export const slugify = (input: string) =>
  input
    .toLowerCase()
    .split('')
    .map((char) => translit[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
