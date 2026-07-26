// No FTS index on the notes table yet (see 0001_init_schema.sql) — this is
// a naive in-process substring search over whatever rows the caller already
// pulled from the workspace. Fine at prototype scale; revisit with a real
// Postgres text-search index if/when a workspace's note count makes this
// slow.

// Same control character Project Vault's src/common/searchSnippet.ts uses
// to mark matches without needing dangerouslySetInnerHTML on the client.
export const SNIPPET_MATCH_START = "";
export const SNIPPET_MATCH_END = "";

export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Recursively collects every string value anywhere in a frontmatter object
 * into one search-friendly blob — mirrors Project Vault's
 * src/main/index-db/indexer.ts extractSearchableText, so a PC's `class:
 * Fighter` is findable the same way it is in the local app.
 */
export function extractSearchableText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(extractSearchableText);
  if (value && typeof value === "object") return Object.values(value).flatMap(extractSearchableText);
  return [];
}

const SNIPPET_RADIUS = 40;

/**
 * Finds the first token that occurs in `text` and returns a short window
 * around it with match markers, or null if none of the tokens occur here.
 * Only highlights that one occurrence — good enough for "here's roughly
 * where it matched," not a full-text ranking engine.
 */
export function buildSnippet(text: string, tokens: string[]): string | null {
  const lower = text.toLowerCase();
  let bestIndex = -1;
  let bestLength = 0;

  for (const token of tokens) {
    const index = lower.indexOf(token);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestLength = token.length;
    }
  }
  if (bestIndex === -1) return null;

  const start = Math.max(0, bestIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, bestIndex + bestLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";

  return (
    prefix +
    text.slice(start, bestIndex) +
    SNIPPET_MATCH_START +
    text.slice(bestIndex, bestIndex + bestLength) +
    SNIPPET_MATCH_END +
    text.slice(bestIndex + bestLength, end) +
    suffix
  );
}

export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  const lower = haystack.toLowerCase();
  return tokens.every((t) => lower.includes(t));
}
