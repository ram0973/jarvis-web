import { adminLayout } from '@/pages/admin/layout'
import { adminOnlyPlugin } from '@/lib/auth/plugins'
import WikiEditor from '@/ui/wiki/editor'

// Client-only for the same reason as `new.tsx`: the editor never renders on the server.
export default adminLayout
  .lets('page', 'adminWikiPage', '/wiki/:id')
  .head('Edit page')
  .use(adminOnlyPlugin)
  .clientOnly()
  .page(({ params }) => <WikiEditor id={params.id} />)
