import { Link } from '@/lib/navigation'
import type { WikiTreeNode } from '@/lib/wiki/tree'
import { useLocation } from '@point0/core/navigation'
import { useEffect, useMemo, useState } from 'react'

const baseItem = 'block rounded-md px-2 py-1.5 text-sm transition-colors'
const idleItem = `${baseItem} text-slate-700 hover:bg-slate-100`
const activeItem = `${baseItem} bg-blue-50 font-medium text-blue-800`

const ancestorsOf = (nodes: WikiTreeNode[], slug: string, trail: string[] = []): string[] => {
  for (const node of nodes) {
    if (node.slug === slug) {
      return trail
    }
    const found = ancestorsOf(node.children, slug, [...trail, node.id])
    if (found.length > 0) {
      return found
    }
  }
  return []
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden="true"
    className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
    fill="currentColor"
  >
    <path d="M7.2 4.6a1 1 0 0 1 1.4 0l4.6 4.7a1 1 0 0 1 0 1.4l-4.6 4.7a1 1 0 1 1-1.4-1.4L11.3 10 7.2 6a1 1 0 0 1 0-1.4Z" />
  </svg>
)

/**
 * The wiki tree. Sections expand on click; the branch that leads to the open article opens by itself, so a deep page
 * is never hidden behind a collapsed parent.
 */
export const WikiSidebar = ({ tree }: { tree: WikiTreeNode[] }) => {
  const location = useLocation()
  const activeSlug = (location.params as { slug?: string } | undefined)?.slug
  const activeTrail = useMemo(() => (activeSlug ? ancestorsOf(tree, activeSlug) : []), [tree, activeSlug])
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeTrail))

  useEffect(() => {
    if (activeTrail.length > 0) {
      setOpen((current) => new Set([...current, ...activeTrail]))
    }
  }, [activeTrail])

  const toggle = (id: string) => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const renderLevel = (nodes: WikiTreeNode[], depth: number) => (
    <ul className={depth === 0 ? 'space-y-0.5' : 'mt-0.5 space-y-0.5 border-l border-slate-200 pl-2'}>
      {nodes.map((node) => {
        const isActive = node.slug === activeSlug
        const hasChildren = node.children.length > 0
        const isOpen = open.has(node.id)
        return (
          <li key={node.id}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={isOpen ? 'Collapse section' : 'Expand section'}
                  aria-expanded={isOpen}
                  onClick={() => {
                    toggle(node.id)
                  }}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Chevron open={isOpen} />
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <Link route="wikiPage" input={{ slug: node.slug }} className={isActive ? activeItem : idleItem}>
                {node.title}
              </Link>
            </div>
            {hasChildren && isOpen ? renderLevel(node.children, depth + 1) : null}
          </li>
        )
      })}
    </ul>
  )

  return (
    <nav aria-label="Wiki navigation" className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-sm">
      <Link
        route="home"
        className="mb-2 block rounded-md px-2 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
      >
        Wiki home
      </Link>
      {tree.length === 0 ? <p className="px-2 py-1.5 text-sm text-slate-500">No pages yet.</p> : renderLevel(tree, 0)}
    </nav>
  )
}
