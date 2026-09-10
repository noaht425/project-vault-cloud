// Battle mode surfaces a controlled unit's reaction (Shield / Counterspell /
// Uncanny Dodge / Riposte) to the player instead of auto-firing it: the loop
// pauses with `awaitingReaction`, the UI records a yes/no answer keyed to
// `(round, unitId, seq)`, and the fight replays from seed with that answer.

import { describe, expect, it } from "vitest";
import { runBattle } from "../src/lib/sim/battle";
import type { BattleDecision } from "../src/lib/sim/battle/control";
import type { ReactionChoice } from "../src/lib/sim/battle/state";

const party = () => [
  { template: "assassin-rogue", name: "Sly", level: 9 },
  { template: "gwm-fighter", name: "Bront", level: 9 },
];

/** play a fight to the end, taking every turn on auto and answering every
 *  reaction prompt with `take`; returns the finished run + the prompts seen. */
function playOut(seed: number, controlled: string, take: boolean) {
  const setup = { party: party(), enemies: ["adult-red-dragon"] as string[], seed, controlled: [controlled] };
  const decisions: BattleDecision[] = [];
  const reactionChoices: ReactionChoice[] = [];
  const prompts: { kind: string; seq: number; round: number; prompt: string; unitName: string }[] = [];
  let run = runBattle({ ...setup, decisions, reactionChoices });
  let guard = 400;
  while (!run.done && guard-- > 0) {
    if (run.awaitingReaction) {
      const r = run.awaitingReaction;
      prompts.push({ kind: r.kind, seq: r.seq, round: r.round, prompt: r.prompt, unitName: r.unitName });
      reactionChoices.push({ round: r.round, unitId: r.unitId, seq: r.seq, take });
    } else if (run.awaiting) {
      decisions.push({ round: run.awaiting.round, unitId: run.awaiting.unitId, auto: true });
    } else {
      break;
    }
    run = runBattle({ ...setup, decisions, reactionChoices });
  }
  return { run, prompts, decisions, reactionChoices };
}

describe("battle reactions — surfaced to the player", () => {
  it("pauses on a controlled rogue's Uncanny Dodge instead of auto-halving", () => {
    const setup = {
      party: party(),
      enemies: ["adult-red-dragon"] as string[],
      seed: 1,
      controlled: ["pc-1-assassin-rogue"],
      decisions: [{ round: 2, unitId: "pc-1-assassin-rogue", auto: true } as BattleDecision],
    };
    // feed auto turn decisions until the first reaction prompt appears
    const decisions: BattleDecision[] = [];
    let run = runBattle({ ...setup, decisions });
    let guard = 40;
    while (!run.done && !run.awaitingReaction && guard-- > 0) {
      decisions.push({ round: run.awaiting!.round, unitId: run.awaiting!.unitId, auto: true });
      run = runBattle({ ...setup, decisions });
    }
    expect(run.done).toBe(false);
    expect(run.awaiting).toBeUndefined();
    const r = run.awaitingReaction!;
    expect(r).toBeDefined();
    expect(r.kind).toBe("uncannyDodge");
    expect(r.unitName).toBe("Sly");
    expect(r.seq).toBe(0);
    expect(r.prompt.length).toBeGreaterThan(10);
    expect(r.takeLabel).toBeTruthy();
    expect(r.declineLabel).toBeTruthy();
    // it's paused, not over — no "end" frame yet
    expect(run.frames.at(-1)!.kind).not.toBe("end");
  });

  it("a recorded reaction answer is replayed and the fight finishes", () => {
    const taken = playOut(1, "pc-1-assassin-rogue", true);
    const declined = playOut(1, "pc-1-assassin-rogue", false);
    expect(taken.run.done).toBe(true);
    expect(declined.run.done).toBe(true);
    expect(taken.prompts.length).toBeGreaterThan(0);
    expect(taken.prompts.every((p) => p.kind === "uncannyDodge")).toBe(true);
    // the answer is honored: "take" fires Uncanny Dodge, "decline" never does
    const text = (r: typeof taken) => r.run.frames.map((f) => f.text ?? "").join("\n");
    expect(text(taken)).toMatch(/Uncanny Dodge/);
    expect(text(declined)).not.toMatch(/Uncanny Dodge/);
  });

  it("surfaces a controlled fighter's Riposte", () => {
    const out = playOut(5, "pc-2-gwm-fighter", true);
    expect(out.run.done).toBe(true);
    expect(out.prompts.some((p) => p.kind === "riposte")).toBe(true);
    expect(out.prompts.every((p) => p.unitName === "Bront")).toBe(true);
  });

  it("replays are deterministic — same answers, same final frame", () => {
    const a = playOut(7, "pc-1-assassin-rogue", true);
    const b = playOut(7, "pc-1-assassin-rogue", true);
    expect(a.prompts).toEqual(b.prompts);
    expect(a.run.frames.length).toBe(b.run.frames.length);
    expect(JSON.stringify(a.run.frames.at(-1))).toBe(JSON.stringify(b.run.frames.at(-1)));
  });

  it("no seam installed for an AI unit — reactions still auto-fire (no regression)", () => {
    // same fight, rogue NOT controlled: runs straight through, Uncanny Dodge
    // still handled by the engine's own heuristic
    const setup = { party: party(), enemies: ["adult-red-dragon"] as string[], seed: 1 };
    const plain = runBattle(setup);
    const empty = runBattle({ ...setup, controlled: [], decisions: [], reactionChoices: [] });
    expect(plain.done).toBe(true);
    expect(empty.done).toBe(true);
    expect(plain.frames.length).toBe(empty.frames.length);
    expect(plain.result.winner).toBe(empty.result.winner);
  });

  it("`reactionAuto` hands a unit's reactions back to the AI (stops prompting)", () => {
    const setup = {
      party: party(),
      enemies: ["adult-red-dragon"] as string[],
      seed: 1,
      controlled: ["pc-1-assassin-rogue"],
      reactionAuto: ["pc-1-assassin-rogue"],
    };
    const decisions: BattleDecision[] = [];
    let run = runBattle({ ...setup, decisions });
    let guard = 60;
    while (!run.done && guard-- > 0) {
      expect(run.awaitingReaction).toBeUndefined(); // never asked
      decisions.push({ round: run.awaiting!.round, unitId: run.awaiting!.unitId, auto: true });
      run = runBattle({ ...setup, decisions });
    }
    expect(run.done).toBe(true);
  });
});
