// Same "exact case-insensitive title match" logic as the Electron app's
// noteRefApi.ts's findExact — pure, so it's testable without mocking
// fetch. GET /api/notes?q=<title> does a substring match, so this still
// needs to pick out the one exact match from possibly several results.
export function resolveWikiLinkTitle(matches: { id: string; name: string }[], title: string): string | null {
  const exact = matches.find((m) => m.name.toLowerCase() === title.toLowerCase());
  return exact?.id ?? null;
}
