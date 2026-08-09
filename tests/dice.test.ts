import { describe, it, expect } from "vitest";
import { rollDice } from "../src/lib/dice";

// Deterministic RNG returning values from a fixed sequence, cycling — same
// approach as the Electron app's own dice tests.
function fakeRng(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}

describe("rollDice", () => {
  it("rolls a flat modifier-only expression", () => {
    const result = rollDice("5", fakeRng([0]));
    expect(result).toEqual(
      expect.objectContaining({ notation: "5", modifier: 5, total: 5, groups: [] })
    );
  });

  it("rolls a single die and sums with a modifier", () => {
    // rng 0.5 on a d6 -> floor(0.5*6)+1 = 4
    const result = rollDice("1d6+3", fakeRng([0.5]));
    expect(result?.total).toBe(7);
    expect(result?.groups[0].rolls).toEqual([4]);
  });

  it("keeps the highest N dice with kh", () => {
    // rng sequence -> rolls of 1, 4, 6 (kh1 keeps the 6)
    const result = rollDice("3d6kh1", fakeRng([0, 0.5, 0.99]));
    expect(result?.groups[0].kept).toEqual([6]);
    expect(result?.total).toBe(6);
  });

  it("keeps the lowest N dice with kl", () => {
    const result = rollDice("3d6kl1", fakeRng([0, 0.5, 0.99]));
    expect(result?.groups[0].kept).toEqual([1]);
    expect(result?.total).toBe(1);
  });

  it("returns null for unparseable input", () => {
    expect(rollDice("not dice")).toBeNull();
    expect(rollDice("")).toBeNull();
  });

  it("rerolls dice at or below the threshold once and keeps the new result", () => {
    // Both dice roll first (1, 6), then the reroll pass rerolls only the 1
    // (using the sequence's 3rd value) — 3 distinct values so nothing
    // wraps back onto an earlier call.
    const result = rollDice("2d6", fakeRng([0, 0.99, 0.5]), { rerollAtOrBelow: 2 });
    expect(result?.groups[0].rolls).toEqual([4, 6]);
    expect(result?.groups[0].rerolledFrom).toEqual([1, undefined]);
  });

  it("omits rerolledFrom entirely when nothing needed a reroll", () => {
    const result = rollDice("1d6", fakeRng([0.99]), { rerollAtOrBelow: 2 });
    expect(result?.groups[0].rerolledFrom).toBeUndefined();
  });
});
