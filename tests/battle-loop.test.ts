import { describe, expect, it } from "vitest";
import { runBattle } from "../src/lib/sim/battle";
import { makeGrid, setTerrain } from "../src/lib/sim/battle/grid";
import { standardParty } from "../src/lib/sim/engine/scenario";

describe("battle mode — full grid fight", () => {
  it("runs a party vs a boss and returns a result + a frame stream", () => {
    const out = runBattle({
      party: standardParty(14),
      enemies: ["gladiator"],
      seed: 7,
    });
    expect(["party", "monster", "draw"]).toContain(out.result.winner);
    expect(out.result.rounds).toBeGreaterThan(0);
    expect(out.frames.length).toBeGreaterThan(5);
    // first frame carries the terrain; frames are sequential
    expect(out.frames[0].kind).toBe("start");
    expect(out.frames[0].terrain).toBeDefined();
    expect(out.frames.at(-1)!.kind).toBe("end");
    for (let i = 1; i < out.frames.length; i++) {
      expect(out.frames[i].seq).toBe(out.frames[i - 1].seq + 1);
    }
  });

  it("every unit snapshot stays inside the grid", () => {
    const out = runBattle({ party: standardParty(12), enemies: ["ogre", "ogre"], seed: 3 });
    const { width, height } = out.grid;
    for (const f of out.frames) {
      for (const u of f.units) {
        expect(u.x).toBeGreaterThanOrEqual(0);
        expect(u.y).toBeGreaterThanOrEqual(0);
        expect(u.x + u.fp).toBeLessThanOrEqual(width);
        expect(u.y + u.fp).toBeLessThanOrEqual(height);
      }
    }
  });

  it("melee combatants actually close the distance", () => {
    const out = runBattle({ party: standardParty(16), enemies: ["adult-red-dragon"], seed: 1 });
    // find a party fighter's start and its position a few frames later
    const fighterId = out.frames[0].units.find((u) => u.side === "party" && u.glyph === "B")!.id;
    const start = out.frames[0].units.find((u) => u.id === fighterId)!;
    const moveFrames = out.frames.filter((f) => f.kind === "move" && f.actorId === fighterId);
    expect(moveFrames.length).toBeGreaterThan(0); // it moved at least once
    // by end of round 1 it should be nearer the dragon than it started
    const dragonStart = out.frames[0].units.find((u) => u.side === "monster")!;
    const later = out.frames
      .filter((f) => f.round <= 2)
      .flatMap((f) => f.units.filter((u) => u.id === fighterId))
      .at(-1)!;
    const d0 = Math.hypot(start.x - dragonStart.x, start.y - dragonStart.y);
    const d1 = Math.hypot(later.x - dragonStart.x, later.y - dragonStart.y);
    expect(d1).toBeLessThan(d0);
  });

  it("the result winner is consistent with the final frame", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const out = runBattle({ party: standardParty(13), enemies: ["young-gold-dragon"], seed });
      expect(out.frames.at(-1)!.text).toContain(out.result.winner);
    }
  });

  it("a wall down the middle still lets the fight resolve (pathing around it)", () => {
    const grid = makeGrid(20, 16, "floor");
    for (let y = 0; y < 12; y++) setTerrain(grid, 10, y, "wall"); // wall with a gap at the bottom
    const out = runBattle({ party: standardParty(15), enemies: ["gladiator", "gladiator"], seed: 9, grid });
    expect(["party", "monster", "draw"]).toContain(out.result.winner);
    expect(out.result.rounds).toBeGreaterThanOrEqual(1);
  });

  it("honours fixed placements", () => {
    const out = runBattle({
      party: standardParty(12),
      enemies: ["ogre"],
      seed: 2,
      placements: { "pc-1-vengeance-paladin": { x: 2, y: 2 } },
    });
    const pal = out.frames[0].units.find((u) => u.id === "pc-1-vengeance-paladin");
    expect(pal).toBeDefined();
    expect({ x: pal!.x, y: pal!.y }).toEqual({ x: 2, y: 2 });
  });
});
