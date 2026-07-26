// Ported from Project Vault's src/common/wikiLinks.ts (separate repo, no
// shared package) — keep the two in sync if the link syntax ever changes.
// Matches [[Title]], [[Title|Alias]], and [[Title#Heading]] (heading/alias
// are captured but only the title is used for link resolution).
const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

export function extractWikiLinkTitles(content: string): string[] {
  const titles: string[] = [];
  for (const match of content.matchAll(WIKI_LINK_RE)) {
    const title = match[1].trim();
    if (title) titles.push(title);
  }
  return titles;
}
