import { describe, it, expect } from "vitest";
import { arrayMove } from "../src/lib/arrayMove";

describe("arrayMove", () => {
  it("swaps an item with its upward neighbor", () => {
    expect(arrayMove(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("swaps an item with its downward neighbor", () => {
    expect(arrayMove(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op moving the first item up", () => {
    expect(arrayMove(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
  });

  it("is a no-op moving the last item down", () => {
    expect(arrayMove(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the original array", () => {
    const original = ["a", "b", "c"];
    arrayMove(original, 0, "down");
    expect(original).toEqual(["a", "b", "c"]);
  });
});
