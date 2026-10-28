import { adminLayout } from '@/pages/admin/layout'
import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { Link } from '@/lib/navigation'
import { adminWikiListQuery, wikiPageDeleteMutation } from '@/lib/wiki/api'
import { buildTree, flattenTree } from '@/lib/wiki/tree'
import { FormError } from '@/ui/form'
import { useState } from 'react'

export default adminLayout
  .lets('page', 'adminWiki', '/wiki')
  .head('Wiki')
  .use(adminOnlyPlugin)
  .page(() => {
    const list = adminWikiListQuery.useQuery()
    const remove = wikiPageDeleteMutation.useMutation()
    const [error, setError] = useState<string | null>(null)

    const rows = list.data ? flattenTree(buildTree(list.data.pages)) : []
    // A page with children is a section (category); a leaf is an article. Same rows, different label.
    const childCounts = new Map<string, number>()
    for (const page of list.data?.pages ?? []) {
      if (page.parentId) {
        childCounts.set(page.parentId, (childCounts.get(page.parentId) ?? 0) + 1)
      }
    }

    const destroy = async (id: string) => {
      if (!window.confirm('Delete this page? Child pages must be removed first.')) {
        return
      }
      setError(null)
      try {
        await remove.mutateAsync({ id })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not delete the page')
      }
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Wiki pages</h1>
            <p className="text-sm text-slate-600">
              {rows.length === 0 ? 'Пока пусто — создай первую страницу.' : `${rows.length} страниц(ы) в дереве.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              route="home"
            >
              Открыть вики
            </Link>
            <Link
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              route="adminWikiNew"
            >
              New page
            </Link>
          </div>
        </div>

        <FormError message={error} />

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              ) : list.error ? (
                <tr>
                  <td className="px-4 py-6 text-red-600" colSpan={5}>
                    {list.error.message}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    Nothing here yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ node, depth }) => (
                  <tr key={node.id}>
                    <td className="px-4 py-3">
                      <span style={{ paddingLeft: `${depth * 16}px` }} className="font-medium text-slate-900">
                        {depth > 0 ? '— ' : ''}
                        {node.title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {childCounts.get(node.id) ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          раздел · {childCounts.get(node.id)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          статья
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">/wiki/{node.slug}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(node.updatedAt).toLocaleDateString('ru-RU')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          route="adminWikiPage"
                          input={{ id: node.id }}
                        >
                          Edit
                        </Link>
                        <Link
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          route="wikiPage"
                          input={{ slug: node.slug }}
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => {
                            void destroy(node.id)
                          }}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  })
