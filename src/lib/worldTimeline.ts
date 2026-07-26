// Ported from Project Vault's src/common/worldTimeline.ts (separate repo,
// no shared package) — pulls dated facts out of ANY note's body, not just
// notes of type "event" — used to build the Events timeline from the whole
// workspace. Two conventions, which can coexist in the same note:
//
// 1. A "## History" section (already the dominant pattern across kingdom/
//    city/NPC notes) with "- <date>: <description>" bullets.
// 2. Bare "Born: <date>" / "Died: <date>" lines, used by a handful of NPC
//    notes that don't have a History section.

export interface WorldTimelineFact {
  date: string;
  description: string;
}

const HISTORY_HEADING_RE = /^##\s*History\s*$/im;
const NEXT_HEADING_RE = /^##/im;
const HISTORY_BULLET_RE = /^-\s+(.+)$/gim;
const BORN_DIED_LINE_RE = /^(Born|Died):\s*([^\n]+)$/gim;

function splitBullet(line: string): WorldTimelineFact | null {
  const idx = line.indexOf(": ");
  if (idx === -1) return null;
  return { date: line.slice(0, idx).trim(), description: line.slice(idx + 2).trim() };
}

export function extractHistoryFacts(body: string): WorldTimelineFact[] {
  const headingMatch = HISTORY_HEADING_RE.exec(body);
  if (!headingMatch) return [];

  const rest = body.slice(headingMatch.index + headingMatch[0].length);
  const nextHeading = rest.search(NEXT_HEADING_RE);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  const facts: WorldTimelineFact[] = [];
  for (const m of section.matchAll(HISTORY_BULLET_RE)) {
    const fact = splitBullet(m[1]);
    if (fact) facts.push(fact);
  }
  return facts;
}

export function extractBornDiedFacts(body: string): WorldTimelineFact[] {
  const facts: WorldTimelineFact[] = [];
  for (const m of body.matchAll(BORN_DIED_LINE_RE)) {
    const label = m[1] as "Born" | "Died";
    const rest = m[2].trim();
    const breakIdx = rest.indexOf(". ");
    const date = (breakIdx === -1 ? rest : rest.slice(0, breakIdx)).replace(/\.$/, "").trim();
    const extra = breakIdx === -1 ? "" : rest.slice(breakIdx + 2).trim();
    facts.push({ date, description: extra ? `${label}: ${extra}` : label });
  }
  return facts;
}
