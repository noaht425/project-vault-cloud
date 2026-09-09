import { describe, expect, it } from "vitest";
import { runBattle } from "../src/lib/sim/battle";
import type { BattleDecision } from "../src/lib/sim/battle/control";
import { standardParty } from "../src/lib/sim/engine/scenario";

const party = () => standardParty(14);

describe("battle control — pause / resume", () => {
  it("with no controlled units the fight runs straight through (no regression)", () => {
    const a = runBattle({ party: party(), enemies: ["gladiator"], seed: 4 });
    const b = runBattle({ party: party(), enemies: ["gladiator"], seed: 4, controlled: [], decisions: [] });
    expect(a.done).toBe(true);
    expect(b.done).toBe(true);
    expect(a.result.winner).toBe(b.result.winner);
    expect(a.frames.length).toBe(b.frames.length);
  });

  it("pauses when a controlled unit's turn comes up with no decision", () => {
    const out = runBattle({
      party: party(),
      enemies: ["adult-red-dragon"],
      seed: 2,
      controlled: ["pc-1-vengeance-paladin"],
      decisions: [],
    });
    expect(out.done).toBe(false);
    expect(out.awaiting).toBeDefined();
    expect(out.awaiting!.unitId).toBe("pc-1-vengeance-paladin");
    expect(out.awaiting!.round).toBe(1);
    // the pause payload has movement + action options
    expect(out.awaiting!.reachable.length).toBeGreaterThan(3);
    expect(out.awaiting!.actions.some((x) => x.id === "attack" || /attack/i.test(x.name))).toBe(true);
    expect(out.awaiting!.units.some((u) => u.side === "monster")).toBe(true);
    // no "end" frame — it's paused, not over
    expect(out.frames.at(-1)!.kind).not.toBe("end");
  });

  it("a recorded move + attack decision is replayed", () => {
    const setup = {
      party: party(),
      enemies: ["young-gold-dragon"] as string[],
      seed: 2,
      controlled: ["pc-1-vengeance-paladin"],
    };
    const first = runBattle({ ...setup, decisions: [] });
    expect(first.awaiting, "controlled paladin pauses in round 1").toBeDefined();
    const aw = first.awaiting!;
    const foe = aw.units.find((u) => u.side === "monster")!;
    const dest = aw.reachable
      .map((k) => k.split(",").map(Number))
      .map(([x, y]) => ({ x, y, d: Math.abs(x - foe.box.x0) + Math.abs(y - foe.box.y0) }))
      .sort((p, q) => p.d - q.d)[0];
    const d1: BattleDecision = {
      round: 1,
      unitId: "pc-1-vengeance-paladin",
      move: { x: dest.x, y: dest.y },
      actionId: aw.actions.find((x) => x.id === "attack")?.id ?? aw.actions[0].id,
      targetId: foe.id,
    };
    const second = runBattle({ ...setup, decisions: [d1] });
    expect(second.frames.length).toBeGreaterThan(first.frames.length);
    // the paladin's move + action from the decision landed in the stream
    expect(second.frames.some((f) => f.kind === "move" && f.actorId === "pc-1-vengeance-paladin")).toBe(true);
    expect(second.frames.some((f) => f.kind === "action" && /Ada uses/.test(f.text ?? ""))).toBe(true);
    // the paladin moved from where it started
    const palStart = first.frames[0].units.find((u) => u.id === "pc-1-vengeance-paladin")!;
    const palLater = second.frames
      .flatMap((f) => f.units.filter((u) => u.id === "pc-1-vengeance-paladin"))
      .at(-1)!;
    expect(palLater.x !== palStart.x || palLater.y !== palStart.y).toBe(true);
    // it advanced past round 1 — never re-asks for round 1
    if (second.awaiting) expect(second.awaiting.round).toBeGreaterThan(1);
  });

  it("an `auto` decision lets the AI take that turn (still resumes cleanly)", () => {
    const setup = {
      party: party(),
      enemies: ["gladiator"] as string[],
      seed: 7,
      controlled: ["pc-2-gwm-fighter"],
    };
    const auto: BattleDecision[] = [];
    let run = runBattle({ ...setup, decisions: auto });
    let guard = 40;
    while (!run.done && guard-- > 0) {
      auto.push({ round: run.awaiting!.round, unitId: run.awaiting!.unitId, auto: true });
      run = runBattle({ ...setup, decisions: auto });
    }
    expect(run.done).toBe(true);
    expect(["party", "monster", "draw"]).toContain(run.result.winner);
  });

  it("replays are deterministic — same decisions, same frames", () => {
    const setup = {
      party: party(),
      enemies: ["young-gold-dragon"] as string[],
      seed: 3,
      controlled: ["pc-3-blaster-wizard"],
    };
    const decisions: BattleDecision[] = [
      { round: 1, unitId: "pc-3-blaster-wizard", auto: true },
      { round: 2, unitId: "pc-3-blaster-wizard", auto: true },
    ];
    const a = runBattle({ ...setup, decisions });
    const b = runBattle({ ...setup, decisions });
    expect(a.frames.length).toBe(b.frames.length);
    expect(JSON.stringify(a.frames.at(-1))).toBe(JSON.stringify(b.frames.at(-1)));
  });
});
