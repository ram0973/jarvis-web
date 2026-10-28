import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { adminWikiListQuery, adminWikiPageQuery } from '@/lib/wiki/api'
import { wikiPageCreateMutation, wikiPageDeleteMutation, wikiPageUpdateMutation } from '@/lib/wiki/api'
import { wikiImageUploadMutation } from '@/lib/wiki/upload'
import { buildTree, flattenTree, slugify } from '@/lib/wiki/tree'
import { FormError, TextField } from '@/ui/form'
import { navigate } from '@/lib/navigation'
import { useEffect, useMemo, useState } from 'react'

type WikiEditorProps = { id?: string }

/**
 * The wiki page editor. MDXEditor gives a WYSIWYG surface plus a markdown-source toggle; images uploaded from the
 * toolbar go through `wikiImageUploadMutation` and come back as `/uploads/wiki/…` URLs, which is exactly what the
 * markdown stores.
 */
export default function WikiEditor({ id }: WikiEditorProps) {
  const pageQuery = adminWikiPageQuery.useQuery({ id: id ?? '' })
  const listQuery = adminWikiListQuery.useQuery()
  const create = wikiPageCreateMutation.useMutation()
  const update = wikiPageUpdateMutation.useMutation()
  const remove = wikiPageDeleteMutation.useMutation()
  const upload = wikiImageUploadMutation.useMutation()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [parentId, setParentId] = useState<string>('')
  const [position, setPosition] = useState(0)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const page = pageQuery.data?.page ?? null

  // Load the page into local state once — afterwards the form owns the values (MDXEditor is controlled by `content`).
  useEffect(() => {
    if (!page || loaded) {
      return
    }
    setTitle(page.title)
    setSlug(page.slug)
    setParentId(page.parentId ?? '')
    setPosition(page.position)
    setContent(page.content)
    setLoaded(true)
  }, [page, loaded])

  const parentOptions = useMemo(() => {
    const pages = listQuery.data?.pages ?? []
    const blocked = new Set<string>()
    if (id) {
      blocked.add(id)
      let grew = true
      while (grew) {
        grew = false
        for (const candidate of pages) {
          if (candidate.parentId && blocked.has(candidate.parentId) && !blocked.has(candidate.id)) {
            blocked.add(candidate.id)
            grew = true
          }
        }
      }
    }
    return flattenTree(buildTree(pages)).filter(({ node }) => !blocked.has(node.id))
  }, [listQuery.data, id])

  const busy = create.isPending || update.isPending || remove.isPending

  const save = async () => {
    setError(null)
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      parentId: parentId === '' ? null : parentId,
      content,
      position,
    }
    try {
      if (id) {
        await update.mutateAsync({ id, ...payload })
        await adminWikiPageQuery.refetchQuery({ id })
      } else {
        const result = await create.mutateAsync(payload)
        await navigate('adminWikiPage', { id: result.page.id })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the page')
    }
  }

  const destroy = async () => {
    if (!id || !window.confirm('Delete this page? Child pages must be removed first.')) {
      return
    }
    setError(null)
    try {
      await remove.mutateAsync({ id })
      await navigate('adminWiki')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the page')
    }
  }

  const uploadImage = async (file: File) => {
    const result = await upload.mutateAsync({ file })
    return result.url
  }

  if (pageQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading page…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{id ? 'Edit page' : 'New page'}</h1>
          <p className="text-sm text-slate-600">
            Markdown с живым предпросмотром: справа сверху можно переключиться в режим исходника.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void navigate('adminWiki')
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to list
          </button>
          {id ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void destroy()
              }}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:text-red-300"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !title.trim() || !slug.trim()}
            onClick={() => {
              void save()
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <FormError message={error} />

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <TextField
          label="Title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (!slugTouched) {
              setSlug(slugify(event.target.value))
            }
          }}
        />
        <TextField
          label="Slug (URL)"
          value={slug}
          onChange={(event) => {
            setSlugTouched(true)
            setSlug(event.target.value)
          }}
          placeholder="nastroika-routera"
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Parent page</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            value={parentId}
            onChange={(event) => {
              setParentId(event.target.value)
            }}
          >
            <option value="">— top level —</option>
            {parentOptions.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'— '.repeat(depth)}
                {node.title}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="Position (lower comes first)"
          type="number"
          value={String(position)}
          onChange={(event) => {
            setPosition(Number(event.target.value) || 0)
          }}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <MDXEditor
          markdown={content}
          onChange={(next) => {
            setContent(next)
          }}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            tablePlugin(),
            linkPlugin(),
            codeBlockPlugin({ defaultCodeBlockLanguage: 'bash' }),
            codeMirrorPlugin({
              codeBlockLanguages: {
                bash: 'Bash',
                json: 'JSON',
                js: 'JavaScript',
                ts: 'TypeScript',
                prisma: 'Prisma',
                text: 'Text',
              },
            }),
            imagePlugin({ imageUploadHandler: uploadImage }),
            diffSourcePlugin({ viewMode: 'rich-text' }),
            markdownShortcutPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <DiffSourceToggleWrapper>
                  <UndoRedo />
                  <Separator />
                  <BoldItalicUnderlineToggles />
                  <BlockTypeSelect />
                  <ListsToggle />
                  <CreateLink />
                  <InsertImage />
                  <InsertTable />
                  <InsertThematicBreak />
                  <CodeToggle />
                </DiffSourceToggleWrapper>
              ),
            }),
          ]}
          contentEditableClassName="prose prose-slate max-w-none min-h-[26rem] px-4 py-3"
        />
      </div>
    </div>
  )
}
