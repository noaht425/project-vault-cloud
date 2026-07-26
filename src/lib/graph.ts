// Ported from Project Vault's src/common/graph.ts (separate repo, no shared
// package) — adapted for id-based notes instead of path-based files: a
// cloud note's `id` fills the role the local app's file `path` plays.

export interface GraphNode {
  id: string;
  name: string;
  noteType: string | null; // null for a phantom node (see below)
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * A [[wiki-link]] whose title doesn't match any real note (a "redlink")
 * still gets a node here — synthesized with a "phantom:" id — so a broken
 * link shows up as a visibly unconnected/undeveloped spot in the graph
 * instead of being silently dropped. Multiple links between the same pair
 * of notes collapse into a single edge, and a note linking to itself is
 * skipped.
 */
export function buildGraph(
  notes: { id: string; name: string; noteType: string | null }[],
  links: { sourceId: string; targetTitle: string }[]
): GraphData {
  const nodesById = new Map<string, GraphNode>();
  const idByLowerName = new Map<string, string>();

  for (const note of notes) {
    nodesById.set(note.id, { id: note.id, name: note.name, noteType: note.noteType });
    idByLowerName.set(note.name.toLowerCase(), note.id);
  }

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const link of links) {
    if (!nodesById.has(link.sourceId)) continue; // link from a note that no longer exists

    let targetId = idByLowerName.get(link.targetTitle.toLowerCase());
    if (!targetId) {
      targetId = `phantom:${link.targetTitle.toLowerCase()}`;
      if (!nodesById.has(targetId)) {
        nodesById.set(targetId, { id: targetId, name: link.targetTitle, noteType: null });
      }
    }

    if (targetId === link.sourceId) continue;

    const edgeKey = [link.sourceId, targetId].sort().join(" ");
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({ source: link.sourceId, target: targetId });
  }

  return { nodes: [...nodesById.values()], edges };
}
