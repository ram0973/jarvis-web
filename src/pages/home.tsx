import { wikiLayout } from '@/layouts/wiki'
import { Link } from '@/lib/navigation'
import { wikiTreeQuery } from '@/lib/wiki/api'

export default wikiLayout
  .lets('page', 'home', '/')
  .head({ title: 'Wiki' })
  .page(() => {
    const tree = wikiTreeQuery.useQuery().data?.tree ?? []

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Jarvis Wiki</h1>
          <p className="max-w-2xl text-slate-600">
            Заметки, инструкции и разборы — по разделам слева. Статьи ведутся в markdown и редактируются в админке.
          </p>
        </header>

        {tree.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6">
            <p className="text-sm text-slate-600">
              Пока ни одной страницы. Создай первую в{' '}
              <Link className="font-medium text-blue-700 hover:text-blue-600" route="adminWiki">
                админке вики
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tree.map((section) => (
              <Link
                key={section.id}
                route="wikiPage"
                input={{ slug: section.slug }}
                className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow"
              >
                <h2 className="text-lg font-semibold text-slate-900 group-hover:text-blue-800">{section.title}</h2>
                <p className="text-sm text-slate-500">
                  {section.children.length === 0
                    ? 'Статья'
                    : `${section.children.length} ${section.children.length === 1 ? 'страница' : 'страниц'}`}
                </p>
                {section.children.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">
                    {section.children.slice(0, 4).map((child) => (
                      <li key={child.id}>· {child.title}</li>
                    ))}
                  </ul>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  })
