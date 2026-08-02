import { describe, it, expect } from "vitest";
import { findNodeById, getChildrenOf, getPathToNode, type TreeNode } from "../src/lib/workspaceTree";

const tree: TreeNode[] = [
  {
    id: "folder-b",
    name: "B Folder",
    isDirectory: true,
    children: [
      { id: "note-in-b", name: "Note In B", isDirectory: false, noteType: "note", version: 1 },
    ],
  },
  { id: "note-root-a", name: "A Root Note", isDirectory: false, noteType: "note", version: 1 },
  {
    id: "folder-a",
    name: "A Folder",
    isDirectory: true,
    children: [
      {
        id: "folder-a-nested",
        name: "Nested",
        isDirectory: true,
        children: [{ id: "note-deep", name: "Deep Note", isDirectory: false, noteType: "note", version: 1 }],
      },
    ],
  },
];

describe("findNodeById", () => {
  it("finds a top-level node", () => {
    expect(findNodeById(tree, "folder-a")?.name).toBe("A Folder");
  });

  it("finds a deeply nested node", () => {
    expect(findNodeById(tree, "note-deep")?.name).toBe("Deep Note");
  });

  it("returns null for an id that doesn't exist", () => {
    expect(findNodeById(tree, "nope")).toBeNull();
  });
});

describe("getChildrenOf", () => {
  it("returns root children folders-first, then alphabetical within each group", () => {
    const root = getChildrenOf(tree, null);
    expect(root.map((n) => n.id)).toEqual(["folder-a", "folder-b", "note-root-a"]);
  });

  it("returns a subfolder's children", () => {
    expect(getChildrenOf(tree, "folder-b").map((n) => n.id)).toEqual(["note-in-b"]);
  });

  it("returns an empty array for a note id (not a folder)", () => {
    expect(getChildrenOf(tree, "note-root-a")).toEqual([]);
  });

  it("returns an empty array for an unknown folder id", () => {
    expect(getChildrenOf(tree, "nope")).toEqual([]);
  });

  it("returns an empty array for an empty folder", () => {
    expect(getChildrenOf(tree, "folder-a-nested")).toEqual([
      expect.objectContaining({ id: "note-deep" }),
    ]);
  });
});

describe("getPathToNode", () => {
  it("returns the full ancestor chain including the node itself", () => {
    expect(getPathToNode(tree, "note-deep").map((n) => n.id)).toEqual([
      "folder-a",
      "folder-a-nested",
      "note-deep",
    ]);
  });

  it("returns a single-element path for a root-level node", () => {
    expect(getPathToNode(tree, "note-root-a").map((n) => n.id)).toEqual(["note-root-a"]);
  });

  it("returns an empty array for an unknown id", () => {
    expect(getPathToNode(tree, "nope")).toEqual([]);
  });
});
