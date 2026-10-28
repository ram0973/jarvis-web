import Markdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

// The wiki editor is HTML-aware: an inserted image is serialized as `<img …>` with width/height, not as markdown
// syntax. So raw HTML has to render — through a sanitizer, in this order: parse the HTML, strip everything dangerous,
// and only then add our own ids (`rehype-slug`) and highlight classes (`rehype-highlight`), which are trusted.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Fence languages (`language-bash`) are useful for the highlighter, and classes carry no behaviour.
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
  },
}

const components: Components = {
  img: ({ node: _node, alt, ...props }) => (
    <img {...props} alt={alt ?? ''} loading="lazy" className="rounded-xl border border-slate-200" />
  ),
  a: ({ node: _node, href, children, ...props }) => (
    <a {...props} href={href} {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
      {children}
    </a>
  ),
}

export const WikiMarkdown = ({ content }: { content: string }) => (
  <div className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-pre:rounded-xl prose-img:my-6">
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, schema],
        rehypeSlug,
        [rehypeHighlight, { detect: true, ignoreMissing: true }],
      ]}
      components={components}
    >
      {content}
    </Markdown>
  </div>
)
