import { wikiLayout } from '@/layouts/wiki'
import { getMeQuery } from '@/lib/auth/api'
import { AppError } from '@/lib/error'
import { Link } from '@/lib/navigation'
import { prisma } from '@/lib/prisma'
import { pathTo } from '@/lib/wiki/tree'
import { WikiMarkdown } from '@/ui/wiki/markdown'
import { WikiToc } from '@/ui/wiki/toc'
import GithubSlugger from 'github-slugger'

// Heading ids must match `rehype-slug` on the rendered markdown (both use github-slugger), otherwise TOC anchors miss.
const tableOfContents = (markdown: string) => {
  const slugger = new GithubSlugger()
  const entries: Array<{ id: string; text: string; level: number }> = []
  for (const line of markdown.split('\n')) {
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) {
      continue
    }
    const text = match[2].replace(/[*_`~]/g, '').trim()
    entries.push({ id: slugger.slug(text), text, level: match[1].length })
  }
  return entries
}

export default wikiLayout
  .lets('page', 'wikiPage', '/wiki/:slug')
  .loader(async ({ params }) => {
    const page = await prisma.wikiPage.findUnique({ where: { slug: params.slug } })
    if (!page) {
      throw new AppError('Page not found', { code: 'NOT_FOUND' })
    }

    const pages = await prisma.wikiPage.findMany({
      orderBy: [{ position: 'asc' }, { title: 'asc' }],
      select: { id: true, slug: true, title: true, parentId: true, position: true },
    })
    // `pathTo` walks the flat list the sidebar also uses, so the breadcrumb and the tree never disagree.
    const breadcrumbs = pathTo(pages, { slug: page.slug }).slice(0, -1)

    // A page with children *is* the category: no separate entity, no join table. The list below is what makes it feel
    // like one, instead of an empty article that happens to have subpages.
    const children = pages
      .filter((candidate) => candidate.parentId === page.id)
      .map((child) => ({
        ...child,
        childCount: pages.filter((candidate) => candidate.parentId === child.id).length,
      }))

    return {
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        content: page.content,
        updatedAt: page.updatedAt,
      },
      breadcrumbs,
      children,
      toc: tableOfContents(page.content),
    }
  })
  .head(({ data }) => data.page.title)
  .page(({ data: { page, breadcrumbs, children, toc } }) => {
    const me = getMeQuery.useQuery().data?.me

    return (
      <article className="space-y-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <Link className="hover:text-blue-700" route="home">
            Wiki home
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <span className="text-slate-300">/</span>
              <Link className="hover:text-blue-700" route="wikiPage" input={{ slug: crumb.slug }}>
                {crumb.title}
              </Link>
            </span>
          ))}
        </nav>

        <header className="space-y-3 border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">{page.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            {children.length > 0 ? <span>Раздел · {children.length} внутри</span> : <span>Статья</span>}
            <span className="text-slate-300">·</span>
            <span>Обновлено {new Date(page.updatedAt).toLocaleDateString('ru-RU')}</span>
            {me?.admin ? (
              <>
                <span className="text-slate-300">·</span>
                <Link
                  className="font-medium text-blue-700 hover:text-blue-600"
                  route="adminWikiPage"
                  input={{ id: page.id }}
                >
                  Редактировать
                </Link>
              </>
            ) : null}
          </div>
        </header>

        <WikiToc items={toc} />
        {page.content.trim().length > 0 ? <WikiMarkdown content={page.content} /> : null}

        {children.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">В этом разделе</h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    route="wikiPage"
                    input={{ slug: child.slug }}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{child.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {child.childCount > 0 ? `раздел · ${child.childCount}` : 'статья'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    )
  })
