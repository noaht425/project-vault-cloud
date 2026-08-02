export interface SnippetSegment {
  text: string;
  highlighted: boolean;
}

// Same \x01/\x02 match markers as this repo's own src/lib/search.ts
// (SNIPPET_MATCH_START/END) — splits into renderable segments instead of
// dangerouslySetInnerHTML.
const MATCH_START = "\x01";
const MATCH_END = "\x02";

export function parseSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  let rest = snippet;
  for (;;) {
    const startIdx = rest.indexOf(MATCH_START);
    if (startIdx === -1) {
      if (rest) segments.push({ text: rest, highlighted: false });
      break;
    }
    if (startIdx > 0) segments.push({ text: rest.slice(0, startIdx), highlighted: false });
    const afterStart = rest.slice(startIdx + 1);
    const endIdx = afterStart.indexOf(MATCH_END);
    if (endIdx === -1) {
      // No closing marker (shouldn't happen given buildSnippet's own
      // shape, but don't silently drop the text if it does) — treat the
      // remainder as highlighted rather than losing it.
      segments.push({ text: afterStart, highlighted: true });
      break;
    }
    segments.push({ text: afterStart.slice(0, endIdx), highlighted: true });
    rest = afterStart.slice(endIdx + 1);
  }
  return segments;
}
