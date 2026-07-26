import { describe, it, expect } from "vitest";
import { buildGraph } from "../src/lib/graph";

describe("buildGraph", () => {
  it("builds a node for every note and an edge for every link", () => {
    const notes = [
      { id: "1", name: "Alice", noteType: "npc" },
      { id: "2", name: "Bob", noteType: "npc" },
    ];
    const links = [{ sourceId: "1", targetTitle: "Bob" }];

    const graph = buildGraph(notes, links);
    expect(graph.nodes).toEqual([
      { id: "1", name: "Alice", noteType: "npc" },
      { id: "2", name: "Bob", noteType: "npc" },
    ]);
    expect(graph.edges).toEqual([{ source: "1", target: "2" }]);
  });

  it("resolves a link target by name case-insensitively", () => {
    const notes = [
      { id: "1", name: "Alice", noteType: "npc" },
      { id: "2", name: "Bob", noteType: "npc" },
    ];
    const links = [{ sourceId: "1", targetTitle: "bob" }];
    expect(buildGraph(notes, links).edges).toEqual([{ source: "1", target: "2" }]);
  });

  it("creates a phantom node for a link with no matching note (a redlink)", () => {
    const notes = [{ id: "1", name: "Alice", noteType: "npc" }];
    const links = [{ sourceId: "1", targetTitle: "Ghost" }];

    const graph = buildGraph(notes, links);
    const phantom = graph.nodes.find((n) => n.id === "phantom:ghost");
    expect(phantom).toEqual({ id: "phantom:ghost", name: "Ghost", noteType: null });
    expect(graph.edges).toEqual([{ source: "1", target: "phantom:ghost" }]);
  });

  it("drops a link from a note that no longer exists", () => {
    const notes = [{ id: "2", name: "Bob", noteType: "npc" }];
    const links = [{ sourceId: "1", targetTitle: "Bob" }];
    expect(buildGraph(notes, links).edges).toEqual([]);
  });

  it("skips a note linking to itself", () => {
    const notes = [{ id: "1", name: "Alice", noteType: "npc" }];
    const links = [{ sourceId: "1", targetTitle: "Alice" }];
    expect(buildGraph(notes, links).edges).toEqual([]);
  });

  it("collapses duplicate/bidirectional links between the same pair into one edge", () => {
    const notes = [
      { id: "1", name: "Alice", noteType: "npc" },
      { id: "2", name: "Bob", noteType: "npc" },
    ];
    const links = [
      { sourceId: "1", targetTitle: "Bob" },
      { sourceId: "1", targetTitle: "Bob" },
      { sourceId: "2", targetTitle: "Alice" },
    ];
    expect(buildGraph(notes, links).edges).toHaveLength(1);
  });
});
