import { adminLayout } from '@/pages/admin/layout'
import { adminOnlyPlugin } from '@/lib/auth/plugins'
import WikiEditor from '@/ui/wiki/editor'

// The editor is a Lexical-based WYSIWYG: it is browser-only, so the page itself is `.clientOnly()` — point0 cuts this
// body (and the editor import) from the server build. Access is enforced by the mutations and queries behind it, each
// gated by `adminOnlyPlugin`.
export default adminLayout
  .lets('page', 'adminWikiNew', '/wiki/new')
  .head('New page')
  .use(adminOnlyPlugin)
  .clientOnly()
  .page(() => <WikiEditor />)
