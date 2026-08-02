"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

// Ported from the Electron app's PreviewPane.tsx — rewrites [[Title]] /
// [[Title|Alias]] into ordinary markdown links pointing at a "wikilink:"
// pseudo-URL, which the custom `a` renderer below intercepts instead of
// letting the browser try to navigate to it.
function convertWikiLinksToMarkdown(content: string): string {
  return content.replace(WIKI_LINK_RE, (_match, title: string, alias?: string) => {
    const targetTitle = title.trim();
    const label = (alias ?? targetTitle).trim();
    return `[${label}](wikilink:${encodeURIComponent(targetTitle)})`;
  });
}

function extractWikiLinkTitles(content: string): string[] {
  const titles = new Set<string>();
  for (const match of content.matchAll(WIKI_LINK_RE)) {
    titles.add(match[1].trim());
  }
  return [...titles];
}

export function PreviewPane({ body }: { body: string }) {
  const router = useRouter();
  const markdown = convertWikiLinksToMarkdown(body);
  // title -> resolved note id, or null once confirmed not found. Absent
  // from the map while still resolving — that in-between state renders the
  // same inert way as "not found" (see the `a` override below) so there's
  // no flash of "looks broken" for a link that's actually fine.
  const [resolved, setResolved] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    const titles = extractWikiLinkTitles(body);
    if (titles.length === 0) return;
    let cancelled = false;
    void Promise.all(
      titles.map(async (title): Promise<[string, string | null]> => {
        const res = await fetch(`/api/notes?q=${encodeURIComponent(title)}`);
        const matches = res.ok ? await res.json() : [];
        return [title, resolveWikiLinkTitle(matches, title)];
      })
    ).then((entries) => {
      if (!cancelled) setResolved(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [body]);

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
              const noteId = resolved.get(title);
              if (noteId) {
                return (
                  <span
                    role="link"
                    tabIndex={0}
                    className="text-accent cursor-pointer underline decoration-dotted"
                    onClick={() => router.push(`/notes/${noteId}`)}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/notes/${noteId}`)}
                  >
                    {children}
                  </span>
                );
              }
              return (
                <span
                  className="text-muted cursor-default"
                  title={noteId === null ? "No note with this title yet" : undefined}
                >
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
