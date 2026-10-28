import Markdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

// `rehype-slug` gives headings the same ids `tableOfContents()` derives on the server, so the TOC anchors land.
// `rehype-highlight` colors fenced code blocks; raw HTML is deliberately not enabled — markdown is rendered as
// markdown, never as markup.
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
      rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={components}
    >
      {content}
    </Markdown>
  </div>
)
