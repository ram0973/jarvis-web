export type TocItem = { id: string; text: string; level: number }

/** "On this page" box. Rendered only when the article has more than one heading worth linking to. */
export const WikiToc = ({ items }: { items: TocItem[] }) => {
  if (items.length < 2) {
    return null
  }

  return (
    <nav aria-label="On this page" className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'pl-4' : undefined}>
            <a href={`#${item.id}`} className="text-slate-600 hover:text-blue-700">
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
