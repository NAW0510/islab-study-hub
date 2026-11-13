import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Raw HTML in notes is escaped (no rehype-raw), so rendering is XSS-safe.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, title, children }) =>
            href?.startsWith("/") || href?.startsWith("#") ? (
              <a href={href} title={title}>
                {children}
              </a>
            ) : (
              <a href={href} title={title} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
