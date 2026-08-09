// Partial port of the Electron app's src/common/noteTypes/familyTree.ts —
// only parseRelationships and its dependencies, needed by the
// contradiction checker to read parent/child pairs out of a family-tree
// note's body. The full note type (frontmatter schema, diagram UI,
// button-based relationship editor) isn't ported yet — see the "Port
// Family Tree sheet" task — but the body text convention it reads is
// freeform markdown either way, so a family-tree note created in Electron
// can already be read (not yet edited) from here.
export type RelationKind = "parent" | "spouse" | "sibling" | "friend" | "rival" | "enemy" | "romantic";

export interface RelationshipEdge {
  a: string;
  b: string;
  relation: RelationKind;
}

const HEADING_RE = /^##\s*(.*)$/gim;
const RELATIONSHIPS_HEADING_RE = /^Relationships$/i;
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
