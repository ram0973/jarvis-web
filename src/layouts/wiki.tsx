import { generalLayout } from '@/layouts/general'
import { wikiTreeQuery } from '@/lib/wiki/api'
import { WikiSidebar } from '@/ui/wiki/sidebar'

/**
 * The wiki shell: a sticky tree on the left, the article on the right. It grows from `generalLayout`, so the site
 * header (brand, Profile, Sign out) stays on every wiki page.
 *
 * @tags wiki, layout
 */
export const wikiLayout = generalLayout.lets.layout().layout(({ children }) => {
  const tree = wikiTreeQuery.useQuery().data?.tree ?? []
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8 xl:gap-10">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        <WikiSidebar tree={tree} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
})
