import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

// Ported from the Electron app's PreviewPane.tsx — rewrites [[Title]] /
// [[Title|Alias]] into ordinary markdown links pointing at a "wikilink:"
// pseudo-URL, which the custom `a` renderer below intercepts instead of
// letting the browser try to navigate to it. Click-through resolution
// (title -> note id -> router.push) is wired in the next pass; for now
// these render as styled, inert spans.
function convertWikiLinksToMarkdown(content: string): string {
  return content.replace(WIKI_LINK_RE, (_match, title: string, alias?: string) => {
    const targetTitle = title.trim();
    const label = (alias ?? targetTitle).trim();
    return `[${label}](wikilink:${encodeURIComponent(targetTitle)})`;
  });
}

export function PreviewPane({ body }: { body: string }) {
  const markdown = convertWikiLinksToMarkdown(body);

  return (
    <div className="prose-note flex-1 overflow-y-auto p-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // react-markdown sanitizes hrefs by default and would strip our
        // "wikilink:" scheme before it ever reached the `a` override below.
        // Safe here: this markdown comes from the note's own content, not
        // untrusted remote input, and the real href never drives navigation
        // directly — the `a` override always decides what a click does.
        urlTransform={(url) => url}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("wikilink:")) {
              const title = decodeURIComponent(href.slice("wikilink:".length));
              return (
                <span className="text-accent cursor-default underline decoration-dotted" title={title}>
                  {children}
                </span>
              );
            }
            // A real browser tab (unlike Electron's bare BrowserWindow) can
            // just navigate normally — open in a new tab so the workspace
            // itself isn't navigated away from.
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
