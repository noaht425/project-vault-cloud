// Ported verbatim from the Electron app's src/common/noteTypes/familyTree.ts
// (superseding the old partial port at src/lib/familyTreeRelationships.ts,
// which only had parseRelationships for the contradiction checker).
import { z } from "zod";

export const familyTreeFrontmatterSchema = z
  .object({
    type: z.literal("family-tree"),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(""),
  })
  .passthrough();

export type FamilyTreeFrontmatter = z.infer<typeof familyTreeFrontmatterSchema>;

export function defaultFamilyTreeFrontmatter(): FamilyTreeFrontmatter {
  return familyTreeFrontmatterSchema.parse({ type: "family-tree" });
}

// Family/marriage kinds (parent, spouse, sibling) vs. social kinds (friend,
// rival, enemy, romantic) are rendered as two visually distinct groups in
// FamilyTreeDiagram.tsx (blood/marriage ties must stay unambiguous from
// social ties) — but structurally they're handled identically here, since
// friend/rival/enemy/romantic are symmetric/mutual exactly like spouse/
// sibling already are (no hierarchy, no reverse phrasing needed, same
// dedupe-by-unordered-pair treatment).
export type RelationKind = "parent" | "spouse" | "sibling" | "friend" | "rival" | "enemy" | "romantic";

export interface RelationshipEdge {
  a: string;
  b: string;
  relation: RelationKind;
}

const HEADING_RE = /^##\s*(.*)$/gim;
const RELATIONSHIPS_HEADING_RE = /^Relationships$/i;
// "child of" is stored as the reverse of "parent of" so downstream code only
// ever has to reason about one direction — authors can still write whichever
// phrasing reads naturally for a given line. The 4 social phrases below are
// each single-direction, same as "spouse of"/"sibling of" — being symmetric,
// there's no natural reverse phrasing that isn't just the same word again.
const RELATIONSHIP_LINE_RE =
  /^-\s*\[\[([^\]|#]+)\]\]\s+(parent of|child of|spouse of|sibling of|friend of|rival of|enemy of|romantic partner of)\s+\[\[([^\]|#]+)\]\]\s*$/im;

interface Heading {
  index: number;
  lineEnd: number;
  isRelationships: boolean;
}

function findHeadings(body: string): Heading[] {
  return [...body.matchAll(HEADING_RE)].map((m) => ({
    index: m.index!,
    lineEnd: m.index! + m[0].length,
    isRelationships: RELATIONSHIPS_HEADING_RE.test(m[1].trim()),
  }));
}

// Every phrase the button-based editor's relation dropdown offers, in the
// order shown there — "parent of"/"child of" are the same RelationKind
// ('parent') from two different starting people, matching how
// parseRelationships already treats them as sugar for the same reversed
// edge. Used both for the dropdown itself and (via edgeFromMatch below) for
// parsing/removal.
export const RELATION_PHRASES = [
  "parent of",
  "child of",
  "spouse of",
  "sibling of",
  "friend of",
  "rival of",
  "enemy of",
  "romantic partner of",
] as const;
export type RelationPhrase = (typeof RELATION_PHRASES)[number];

// The canonical phrase for each stored RelationKind — used to display an
// already-parsed edge back as readable text (e.g. in the relationship list's
// remove-button rows). A "child of"-written edge redisplays as "parent of"
// with a/b already swapped, same as it's stored — there's no need to
// remember which of the two synonymous phrasings was originally typed.
export const RELATION_DISPLAY_PHRASE: Record<RelationKind, RelationPhrase> = {
  parent: "parent of",
  spouse: "spouse of",
  sibling: "sibling of",
  friend: "friend of",
  rival: "rival of",
  enemy: "enemy of",
  romantic: "romantic partner of",
};

/** Shared by parseRelationships and removeRelationshipEdge so the phrase→edge mapping lives in exactly one place. */
function edgeFromMatch(first: string, relationPhrase: string, second: string): RelationshipEdge | null {
  const relation = relationPhrase.toLowerCase();
  const a = first.trim();
  const b = second.trim();
  if (!a || !b) return null;

  if (relation === "parent of") return { a, b, relation: "parent" };
  if (relation === "child of") return { a: b, b: a, relation: "parent" };
  if (relation === "spouse of") return { a, b, relation: "spouse" };
  if (relation === "sibling of") return { a, b, relation: "sibling" };
  if (relation === "friend of") return { a, b, relation: "friend" };
  if (relation === "rival of") return { a, b, relation: "rival" };
  if (relation === "enemy of") return { a, b, relation: "enemy" };
  return { a, b, relation: "romantic" };
}

/**
 * Reads every "## Relationships" section in the body (there can be more
 * than one — they're merged) and parses each bullet line into an edge.
 * Lines that don't match the "[[A]] <relation> [[B]]" shape are silently
 * skipped rather than throwing, since this is freeform note content and a
 * typo shouldn't break the whole diagram.
 */
export function parseRelationships(body: string): RelationshipEdge[] {
  const headings = findHeadings(body);
  const edges: RelationshipEdge[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (!heading.isRelationships) continue;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    const section = body.slice(heading.lineEnd, end);

    for (const line of section.split("\n")) {
      const match = line.match(RELATIONSHIP_LINE_RE);
      if (!match) continue;
      const edge = edgeFromMatch(match[1], match[2], match[3]);
      if (edge) edges.push(edge);
    }
  }

  return edges;
}

/**
 * Appends a new relationship bullet to the body's (first) "## Relationships"
 * section, creating that section at the end of the body if none exists yet
 * — the button-based editor's "Add relationship" action. Pure string
 * manipulation, no re-parsing of the rest of the body needed.
 */
export function addRelationshipEdge(body: string, a: string, phrase: RelationPhrase, b: string): string {
  const line = `- [[${a.trim()}]] ${phrase} [[${b.trim()}]]`;
  const headings = findHeadings(body);
  const i = headings.findIndex((h) => h.isRelationships);

  if (i === -1) {
    const trimmed = body.replace(/\s+$/, "");
    return trimmed.length === 0 ? `## Relationships\n${line}\n` : `${trimmed}\n\n## Relationships\n${line}\n`;
  }

  const hasNextHeading = i + 1 < headings.length;
  const sectionEnd = hasNextHeading ? headings[i + 1].index : body.length;
  // Collapse any trailing blank lines within the section down to exactly
  // one newline before the new bullet, then restore a single blank-line
  // separator before whatever heading follows (if any).
  const before = body.slice(0, sectionEnd).replace(/\n*$/, "\n");
  const after = body.slice(sectionEnd);
  return `${before}${line}\n${hasNextHeading ? "\n" : ""}${after}`;
}

/**
 * Removes the first bullet line, across every "## Relationships" section,
 * that parses to an edge structurally equal to `target` — the button-based
 * editor's remove action. Re-parses each candidate line (rather than
 * assuming a canonical serialization) so a line originally written as
 * "X child of Y" is still found and removed when `target` is the resolved
 * `{a: Y, b: X, relation: 'parent'}` edge parseRelationships already
 * produced for it. A no-op (returns body unchanged) if no matching line is
 * found — same "harmless" fallback as everywhere else in this file.
 */
export function removeRelationshipEdge(body: string, target: RelationshipEdge): string {
  const headings = findHeadings(body);

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (!heading.isRelationships) continue;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    const section = body.slice(heading.lineEnd, end);

    let cursor = heading.lineEnd;
    for (const line of section.split("\n")) {
      const lineStart = cursor;
      const lineEnd = cursor + line.length;
      cursor = lineEnd + 1; // '\n' consumed by split(), re-added for the next line's start

      const match = line.match(RELATIONSHIP_LINE_RE);
      if (!match) continue;
      const edge = edgeFromMatch(match[1], match[2], match[3]);
      if (edge && edge.a === target.a && edge.b === target.b && edge.relation === target.relation) {
        const deleteEnd = Math.min(lineEnd + 1, body.length); // also swallow the line's trailing newline
        return body.slice(0, lineStart) + body.slice(deleteEnd);
      }
    }
  }

  return body;
}

export interface FamilyTreeNode {
  name: string;
  generation: number;
  col: number;
}

export type FamilyTreeLineKind = "parent-child" | "spouse" | "sibling" | "friend" | "rival" | "enemy" | "romantic";

export interface FamilyTreeLine {
  kind: FamilyTreeLineKind;
  from: string;
  to: string;
}

export interface FamilyTreeLayout {
  nodes: FamilyTreeNode[];
  lines: FamilyTreeLine[];
}

function unorderedPairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

function dedupePairs(pairs: [string, string][]): [string, string][] {
  const seen = new Map<string, [string, string]>();
  for (const pair of pairs) seen.set(unorderedPairKey(pair[0], pair[1]), pair);
  return [...seen.values()];
}

/**
 * Lays out the family tree in generational rows: a node's generation is 0 if
 * it has no recorded parent, else one more than the deepest of its parents.
 * A `visiting` guard makes a circular "parent of" chain (a typo, not a real
 * family) fall back to generation 0 for the node that would otherwise
 * recurse forever, rather than hanging the renderer.
 */
export function computeFamilyTreeLayout(edges: RelationshipEdge[]): FamilyTreeLayout {
  const orderedNames: string[] = [];
  const seenNames = new Set<string>();
  const addName = (name: string): void => {
    if (!seenNames.has(name)) {
      seenNames.add(name);
      orderedNames.push(name);
    }
  };

  const parentsOf = new Map<string, string[]>();
  const spousePairs: [string, string][] = [];
  const siblingPairs: [string, string][] = [];
  const friendPairs: [string, string][] = [];
  const rivalPairs: [string, string][] = [];
  const enemyPairs: [string, string][] = [];
  const romanticPairs: [string, string][] = [];

  for (const edge of edges) {
    addName(edge.a);
    addName(edge.b);
    switch (edge.relation) {
      case "parent": {
        const parents = parentsOf.get(edge.b) ?? [];
        if (!parents.includes(edge.a)) parents.push(edge.a);
        parentsOf.set(edge.b, parents);
        break;
      }
      case "spouse":
        spousePairs.push([edge.a, edge.b]);
        break;
      case "sibling":
        siblingPairs.push([edge.a, edge.b]);
        break;
      case "friend":
        friendPairs.push([edge.a, edge.b]);
        break;
      case "rival":
        rivalPairs.push([edge.a, edge.b]);
        break;
      case "enemy":
        enemyPairs.push([edge.a, edge.b]);
        break;
      case "romantic":
        romanticPairs.push([edge.a, edge.b]);
        break;
    }
  }

  const dedupedSpousePairs = dedupePairs(spousePairs);
  const dedupedSiblingPairs = dedupePairs(siblingPairs);
  const dedupedFriendPairs = dedupePairs(friendPairs);
  const dedupedRivalPairs = dedupePairs(rivalPairs);
  const dedupedEnemyPairs = dedupePairs(enemyPairs);
  const dedupedRomanticPairs = dedupePairs(romanticPairs);

  const generationOf = new Map<string, number>();
  const visiting = new Set<string>();
  const computeGeneration = (name: string): number => {
    if (generationOf.has(name)) return generationOf.get(name)!;
    if (visiting.has(name)) return 0;
    visiting.add(name);
    const parents = parentsOf.get(name) ?? [];
    const generation = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(computeGeneration));
    visiting.delete(name);
    generationOf.set(name, generation);
    return generation;
  };
  for (const name of orderedNames) computeGeneration(name);

  const rowsByGeneration = new Map<number, string[]>();
  for (const name of orderedNames) {
    const generation = generationOf.get(name)!;
    const row = rowsByGeneration.get(generation) ?? [];
    row.push(name);
    rowsByGeneration.set(generation, row);
  }
  const maxGeneration = Math.max(0, ...rowsByGeneration.keys());

  const colOf = new Map<string, number>();
  const nodes: FamilyTreeNode[] = [];

  for (let generation = 0; generation <= maxGeneration; generation++) {
    let row = rowsByGeneration.get(generation) ?? [];

    if (generation > 0) {
      const withKeys = row.map((name, idx) => {
        const parents = parentsOf.get(name) ?? [];
        const parentCols = parents.map((p) => colOf.get(p)).filter((c): c is number => c !== undefined);
        const key = parentCols.length > 0 ? parentCols.reduce((a, b) => a + b, 0) / parentCols.length : Infinity;
        return { name, key, idx };
      });
      withKeys.sort((p, q) => p.key - q.key || p.idx - q.idx);
      row = withKeys.map((w) => w.name);
    }

    // Pull declared spouse partners adjacent to each other within the row,
    // otherwise a couple placed apart by the parent-average sort above would
    // read as unrelated in the diagram.
    const spouseOf = new Map<string, string>();
    for (const [x, y] of dedupedSpousePairs) {
      if (row.includes(x) && row.includes(y)) {
        if (!spouseOf.has(x)) spouseOf.set(x, y);
        if (!spouseOf.has(y)) spouseOf.set(y, x);
      }
    }
    const placed = new Set<string>();
    const orderedRow: string[] = [];
    for (const name of row) {
      if (placed.has(name)) continue;
      orderedRow.push(name);
      placed.add(name);
      const partner = spouseOf.get(name);
      if (partner && !placed.has(partner) && row.includes(partner)) {
        orderedRow.push(partner);
        placed.add(partner);
      }
    }

    orderedRow.forEach((name, col) => {
      colOf.set(name, col);
      nodes.push({ name, generation, col });
    });
  }

  const lines: FamilyTreeLine[] = [];
  for (const [child, parents] of parentsOf) {
    for (const parent of parents) lines.push({ kind: "parent-child", from: parent, to: child });
  }
  for (const [a, b] of dedupedSpousePairs) lines.push({ kind: "spouse", from: a, to: b });
  for (const [a, b] of dedupedSiblingPairs) {
    const aParents = parentsOf.get(a) ?? [];
    const bParents = parentsOf.get(b) ?? [];
    const sharesParent = aParents.some((p) => bParents.includes(p));
    // A shared-parent pair already reads as siblings via the parent-child
    // lines drawn above — an extra sibling line would just be a redundant
    // overlapping stroke. Only draw it when no shared parent is on record.
    if (!sharesParent) lines.push({ kind: "sibling", from: a, to: b });
  }
  // Social ties (friend/rival/enemy/romantic) have no shared-parent-implies-
  // redundant logic like sibling does — they're independent of family
  // structure, so every deduped pair always gets its own line.
  for (const [a, b] of dedupedFriendPairs) lines.push({ kind: "friend", from: a, to: b });
  for (const [a, b] of dedupedRivalPairs) lines.push({ kind: "rival", from: a, to: b });
  for (const [a, b] of dedupedEnemyPairs) lines.push({ kind: "enemy", from: a, to: b });
  for (const [a, b] of dedupedRomanticPairs) lines.push({ kind: "romantic", from: a, to: b });

  return { nodes, lines };
}

// A parent must be at least this many years older than their recorded child
// — named/tunable near the top of its own section rather than buried inline.
const MIN_PARENT_CHILD_AGE_GAP = 13;
// Spouse/romantic-partner age gaps beyond this are flagged as "worth
// double-checking," never a hard rule — plenty of real (and fantasy — an
// elf and a human, say) pairings genuinely exceed this.
const LARGE_PARTNER_AGE_GAP = 40;

export interface PlausibilityWarning {
  a: string;
  b: string;
  relation: RelationKind;
  message: string;
}

/**
 * A deterministic, non-blocking sanity pass over recorded relationships —
 * NOT an AI critique of the world's content, just the same kind of
 * data-validation a spreadsheet does against structure the app already has.
 * Only checks pairs where BOTH people's ages are known (`ageByTitle`,
 * typically sourced from real npc notes' optional `age` field), missing
 * age data means the pair is silently skipped, same "harmless when data's
 * missing" pattern as a dangling wiki-link or an unmatched calendar note
 * elsewhere in this app.
 */
export function checkRelationshipPlausibility(edges: RelationshipEdge[], ageByTitle: Map<string, number>): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = [];

  for (const edge of edges) {
    const ageA = ageByTitle.get(edge.a);
    const ageB = ageByTitle.get(edge.b);
    if (ageA === undefined || ageB === undefined) continue;

    if (edge.relation === "parent") {
      // edge.a is the parent, edge.b is the child (see parseRelationships).
      const gap = ageA - ageB;
      if (gap <= 0) {
        warnings.push({
          a: edge.a,
          b: edge.b,
          relation: "parent",
          message: `${edge.a} (age ${ageA}) isn't older than ${edge.b} (age ${ageB}) — parent/child ages look swapped or wrong.`,
        });
      } else if (gap < MIN_PARENT_CHILD_AGE_GAP) {
        warnings.push({
          a: edge.a,
          b: edge.b,
          relation: "parent",
          message: `${edge.a} (age ${ageA}) is only ${gap} years older than ${edge.b} (age ${ageB}) — check this parent/child pairing.`,
        });
      }
    } else if (edge.relation === "spouse" || edge.relation === "romantic") {
      const gap = Math.abs(ageA - ageB);
      if (gap > LARGE_PARTNER_AGE_GAP) {
        warnings.push({
          a: edge.a,
          b: edge.b,
          relation: edge.relation,
          message: `${edge.a} (age ${ageA}) and ${edge.b} (age ${ageB}) have a ${gap}-year age gap — worth double-checking.`,
        });
      }
    }
  }

  return warnings;
}
