"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ABILITIES,
  BUILDER_CONDITIONS,
  DAMAGE_TYPES,
  defaultSetup,
  draftToCombatant,
  emptyDraft,
  exportCustomMonsters,
  FEAT_OPTIONS,
  ITEM_OPTIONS,
  loadCustomMonsters,
  loadoutSummary,
  monsterOptions,
  RACE_OPTIONS,
  npcNoteToMonster,
  parseStatblock,
  pcNoteToCombatant,
  SIZES,
  standardParty,
  suggestedPb,
  SWEEP_DIMS,
  TEMPLATE_IDS,
  type BuilderDraft,
  type Combatant,
  type DamageType,
  type DmgDefense,
  type MonsterOption,
  type SimResult,
  type SimSetup,
  type SweepDim,
  type SweepOut,
} from "@/lib/sim/ui";
import { runSimAsync, runSweepAsync, runBattleAsync, runDayAsync } from "@/lib/sim/runner";
import { aoePreview, autoPlace, rosterForSetup, starterBattleMap } from "@/lib/sim/ui";
import type { AwaitAction, AwaitingInput, BattleDecision, BattleMapDef, BattleRun, DayRun, RestKind, RosterEntry, UnitSnap } from "@/lib/sim/ui";

const SETUP_KEY = "fightSimSetup";
const TRIAL_CHOICES = [100, 250, 500, 1000];

// localStorage only — a scenario is scratch, not campaign canon (same call the
// Initiative tracker made). It won't follow you between devices.
function loadSetup(): SimSetup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return defaultSetup();
    const parsed = JSON.parse(raw) as SimSetup;
    if (!Array.isArray(parsed.party) || !Array.isArray(parsed.enemies)) return defaultSetup();
    // re-parse the stored custom pack so a stale / edited entry can't break every run
    const customMonsters = Array.isArray(parsed.customMonsters)
      ? loadCustomMonsters(parsed.customMonsters).monsters
      : [];
    return { ...parsed, customMonsters };
  } catch {
    return defaultSetup();
  }
}

type Mode = "single" | "sweep" | "battle" | "day";

export default function SimulatorPage() {
  const [setup, setSetup] = useState<SimSetup>(() =>
    typeof window === "undefined" ? defaultSetup() : loadSetup(),
  );
  const [mode, setMode] = useState<Mode>("single");
  const [result, setResult] = useState<SimResult | null>(null);
  const [sweep, setSweep] = useState<SweepOut | null>(null);
  const [day, setDay] = useState<DayRun | null>(null);
  const [battleStarted, setBattleStarted] = useState(false);
  const [sweepDim, setSweepDim] = useState<SweepDim>("level");
  const [running, setRunning] = useState(false);
  const [battleNonce, setBattleNonce] = useState(0);
  const [editingMap, setEditingMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const options = useMemo(() => monsterOptions(setup.customMonsters), [setup.customMonsters]);

  const persist = useCallback((next: SimSetup) => {
    setSetup(next);
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      if (mode === "single") {
        setResult(await runSimAsync(setup));
        setSweep(null);
        setDay(null);
      } else if (mode === "sweep") {
        setSweep(await runSweepAsync(setup, sweepDim));
        setResult(null);
        setDay(null);
      } else if (mode === "day") {
        setDay(await runDayAsync(setup));
        setResult(null);
        setSweep(null);
      } else {
        // Battle mode is interactive — <BattleMap> owns the run loop.
        // A "Run battle" just (re)mounts it fresh.
        setBattleStarted(true);
        setBattleNonce((n) => n + 1);
        setResult(null);
        setSweep(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
      setSweep(null);
      setDay(null);
    } finally {
      setRunning(false);
    }
  }, [setup, running, mode, sweepDim]);

  const busy =
    running ||
    setup.party.length === 0 ||
    (mode === "day" ? (setup.day?.encounters.length ?? 0) === 0 : setup.enemies.length === 0);

  return (
    <div className="p-4 sm:p-6 max-w-3xl w-full flex flex-col gap-5">
      <header className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-lg font-serif">Fight Simulator</h1>
        <span className="text-sm text-muted">
          Monte-Carlo a party against a stat block — win rate, TPK risk, where it breaks
        </span>
      </header>

      {mode === "day" ? (
        <DayEditor
          options={options}
          day={setup.day}
          onChange={(d) => persist({ ...setup, day: d })}
        />
      ) : (
        <EnemyEditor
          options={options}
          enemies={setup.enemies}
          onChange={(enemies) => persist({ ...setup, enemies })}
          customMonsters={setup.customMonsters}
          onCustomChange={(customMonsters) => persist({ ...setup, customMonsters })}
        />
      )}

      <PartyEditor party={setup.party} onChange={(party) => persist({ ...setup, party })} />

      <section className="flex flex-col gap-3">
        <div className="inline-flex self-start rounded border border-border overflow-hidden text-sm">
          {(["single", "sweep", "battle", "day"] as Mode[]).map((m) => (
            <button
              key={m}
              className={`px-3 py-1.5 ${mode === m ? "bg-active text-normal" : "bg-panel text-muted hover:bg-hover"}`}
              onClick={() => setMode(m)}
            >
              {m === "single" ? "Single fight" : m === "sweep" ? "What-if sweep" : m === "battle" ? "Battle map" : "Adventuring day"}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-4 flex-wrap">
          {mode === "sweep" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Vary</span>
              <select value={sweepDim} onChange={(e) => setSweepDim(e.target.value as SweepDim)} className="min-w-40">
                {SWEEP_DIMS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode !== "battle" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Trials{mode === "sweep" ? " / point" : ""}</span>
              <select
                className="min-w-24"
                value={setup.trials}
                onChange={(e) => persist({ ...setup, trials: Number(e.target.value) })}
              >
                {TRIAL_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Seed</span>
            <input
              type="number"
              className="w-24"
              value={setup.seed}
              onChange={(e) => persist({ ...setup, seed: Number(e.target.value) || 1 })}
            />
          </label>
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {running
              ? "Running…"
              : mode === "single"
                ? "Run simulation"
                : mode === "sweep"
                  ? "Run sweep"
                  : mode === "battle"
                    ? "Run battle"
                    : "Run the day"}
          </Button>
        </div>
        {mode === "sweep" && (
          <p className="text-xs text-muted">
            {SWEEP_DIMS.find((d) => d.id === sweepDim)!.values.map((v) => SWEEP_DIMS.find((d) => d.id === sweepDim)!.fmt(v)).join(" · ")}
          </p>
        )}
        {mode === "battle" && (
          <>
            <ControlPicker
              setup={setup}
              onChange={(battleControl) => persist({ ...setup, battleControl })}
            />
            <MapSetup
              setup={setup}
              open={editingMap}
              onToggle={() => setEditingMap((v) => !v)}
              onChange={(battleMap) => persist({ ...setup, battleMap })}
              onReset={() => { persist({ ...setup, battleMap: undefined }); setEditingMap(false); }}
            />
          </>
        )}
      </section>

      {error && (
        <p className="text-sm text-danger border border-danger/40 rounded px-3 py-2">{error}</p>
      )}

      {result && !running && mode === "single" && (
        <Results result={result} showLog={showLog} onToggleLog={() => setShowLog((v) => !v)} />
      )}
      {sweep && !running && mode === "sweep" && <SweepResults out={sweep} />}
      {day && !running && mode === "day" && <DayResults day={day} />}
      {mode === "day" && !day && !running && (
        <p className="text-xs text-muted">
          Runs your encounter list in sequence with HP, spell slots and 1/day powers carried forward and a short or long
          rest between each. Single-fight win rates over-value going nova — this shows where the party actually runs dry.
        </p>
      )}
      {mode === "battle" && battleStarted && (
        <BattleMap key={`${battleNonce}:${(setup.battleControl ?? []).join(",")}`} setup={setup} />
      )}
      {mode === "battle" && !battleStarted && (
        <p className="text-xs text-muted">
          A single fight on a 5-ft grid — watch the AI move, take cover, and trade blows turn by turn, or check a party
          member above to run their turns yourself. Diagonals use the PHB 5-10-5 rule.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- battle map

const TERRAIN_CLASS: Record<string, string> = {
  "#": "text-muted/70",
  "~": "text-emerald-600/60 dark:text-emerald-400/50",
  "!": "text-danger/60",
  o: "text-amber-600/60 dark:text-amber-400/50",
};

const TERRAIN_LEGEND: { g: string; label: string }[] = [
  { g: "·", label: "floor" },
  { g: "#", label: "wall — blocks movement & sight" },
  { g: "~", label: "difficult — costs double to enter" },
  { g: "o", label: "cover — blocks movement, grants +AC" },
  { g: "!", label: "hazard — damages anything standing in it" },
];

/** a 10-cell block bar: "██████░░░░" */
function hpBlocks(hp: number, max: number): { fill: string; empty: string } {
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  let n = Math.round(frac * 10);
  if (hp > 0 && n === 0) n = 1;
  return { fill: "█".repeat(n), empty: "░".repeat(10 - n) };
}
const SPARK = "▁▂▃▄▅▆▇█";
function sparkline(values: number[], max: number): string {
  if (!values.length) return "";
  return values.map((v) => SPARK[Math.max(0, Math.min(7, Math.round((v / max) * 7)))]).join("");
}

function RosterRow({ u, actor }: { u: UnitSnap; actor: boolean }) {
  const b = hpBlocks(u.hp, u.maxHp);
  const dim = !u.alive ? "opacity-40 line-through" : u.downed ? "opacity-60" : "";
  return (
    <div className={`flex items-center gap-2 font-mono text-xs leading-tight ${dim} ${actor ? "font-bold" : ""}`}>
      <span className="w-3 text-center">{actor ? "▸" : ""}</span>
      <span className={`w-3 text-center ${u.side === "party" ? "text-accent" : "text-danger"}`}>{u.glyph}</span>
      <span className="w-14 truncate">{u.name}</span>
      <span className="tracking-tighter">
        <span className={u.side === "party" ? "text-accent" : "text-danger"}>{b.fill}</span>
        <span className="text-muted/30">{b.empty}</span>
      </span>
      <span className="tabular-nums text-muted w-14 text-right">
        {u.downed ? "DOWN" : `${u.hp}/${u.maxHp}`}
      </span>
      {u.conditions.length > 0 && <span className="text-warning">[{u.conditions.join(",")}]</span>}
    </div>
  );
}

function TerrainLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {TERRAIN_LEGEND.map((t) => (
        <span key={t.g} className="flex items-center gap-1">
          <span className={`font-mono w-3 text-center ${TERRAIN_CLASS[t.g === "·" ? "." : t.g] ?? "text-muted/30"}`}>{t.g}</span>
          {t.label}
        </span>
      ))}
    </div>
  );
}

function ControlPicker({ setup, onChange }: { setup: SimSetup; onChange: (ids: string[]) => void }) {
  const party = useMemo(() => {
    try {
      return rosterForSetup(setup).filter((r) => r.side === "party");
    } catch {
      return [] as RosterEntry[];
    }
  }, [setup]);
  const control = new Set(setup.battleControl ?? []);
  const toggle = (id: string) => {
    const next = new Set(control);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
      <span className="text-muted">Control</span>
      {party.map((r) => (
        <label key={r.id} className="flex items-center gap-1.5">
          <input type="checkbox" checked={control.has(r.id)} onChange={() => toggle(r.id)} />
          <span className={control.has(r.id) ? "text-accent" : ""}>{r.name}</span>
        </label>
      ))}
      {party.length > 0 && (
        <>
          <button className="text-accent hover:underline" onClick={() => onChange(party.map((r) => r.id))}>all</button>
          <button className="text-muted hover:text-normal" onClick={() => onChange([])}>none</button>
        </>
      )}
      {control.size > 0 && <span className="text-muted opacity-70">— you&apos;ll run these turns; the rest play themselves</span>}
    </div>
  );
}

interface Wizard {
  move: { x: number; y: number } | null;
  action: string | null;
  target: string | null;
  origin: { x: number; y: number } | null;
  bonusAction: string | null;
  bonusTarget: string | null;
}
const EMPTY_WIZ: Wizard = { move: null, action: null, target: null, origin: null, bonusAction: null, bonusTarget: null };

function BattleMap({ setup }: { setup: SimSetup }) {
  const [decisions, setDecisions] = useState<BattleDecision[]>([]);
  const [run, setRun] = useState<BattleRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoAi, setAutoAi] = useState(false);
  const [wiz, setWiz] = useState<Wizard>(EMPTY_WIZ);
  const started = useRef(false);

  const fetchRun = useCallback(
    (ds: BattleDecision[], ai: boolean) => {
      setLoading(true);
      setWiz(EMPTY_WIZ);
      const s = ai ? { ...setup, battleControl: [] as string[] } : setup;
      runBattleAsync(s, setup.seed, ds).then((r) => {
        setRun(r);
        setLoading(false);
      });
    },
    [setup],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchRun([], false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (ds: BattleDecision[]) => {
    setDecisions(ds);
    fetchRun(ds, autoAi);
  };
  const commit = (d: BattleDecision) => push([...decisions, d]);
  const undoTurn = () => push(decisions.slice(0, -1));
  const finishWithAi = () => {
    setAutoAi(true);
    setDecisions(decisions);
    fetchRun(decisions, true);
  };

  if (!run) return <p className="text-xs text-muted">Setting up the battle…</p>;

  const aw = run.awaiting;
  return (
    <Replay
      key={run.frames.length + (aw ? ":await" : ":done")}
      run={run}
      awaiting={aw}
      loading={loading}
      wiz={wiz}
      setWiz={setWiz}
      canUndo={decisions.length > 0}
      onCommit={commit}
      onAi={() => aw && commit({ round: aw.round, unitId: aw.unitId, auto: true })}
      onUndo={undoTurn}
      onFinishAi={finishWithAi}
      onReplay={() => push([])}
    />
  );
}

function Replay({
  run,
  awaiting,
  loading,
  wiz,
  setWiz,
  canUndo,
  onCommit,
  onAi,
  onUndo,
  onFinishAi,
  onReplay,
}: {
  run: BattleRun;
  awaiting?: AwaitingInput;
  loading: boolean;
  wiz: Wizard;
  setWiz: (w: Wizard) => void;
  canUndo: boolean;
  onCommit: (d: BattleDecision) => void;
  onAi: () => void;
  onUndo: () => void;
  onFinishAi: () => void;
  onReplay: () => void;
}) {
  const frames = run.frames;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(450);
  const [hoverOrigin, setHoverOrigin] = useState<{ x: number; y: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const last = frames.length - 1;
  const atEnd = idx >= last;
  // while awaiting input, always show the paused (final) frame
  const shownIdx = awaiting ? last : Math.min(idx, last);

  useEffect(() => {
    if (!playing || atEnd) return;
    const t = setTimeout(() => setIdx((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, idx, speed, atEnd]);

  const frame = frames[shownIdx];
  const dims = frames[0].terrain!;
  const terrain = dims.tiles;

  const unitAt = useMemo(() => {
    const m = new Map<string, UnitSnap>();
    for (const u of frame.units) {
      if (!u.alive) continue;
      for (let dy = 0; dy < u.fp; dy++) for (let dx = 0; dx < u.fp; dx++) m.set(`${u.x + dx},${u.y + dy}`, u);
    }
    return m;
  }, [frame]);
  const templateSet = useMemo(() => new Set(frame.templateCells ?? []), [frame]);
  const pathSet = useMemo(() => new Set((frame.path ?? []).slice(0, -1).map(([x, y]) => `${x},${y}`)), [frame]);

  const logLines = useMemo(
    () => frames.slice(0, shownIdx + 1).filter((f) => f.text).map((f) => ({ seq: f.seq, round: f.round, text: f.text! })),
    [frames, shownIdx],
  );
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLines.length]);

  const roster = frame.units; // flat list for name lookups in the turn panel
  // roster in initiative order, party block then a divider then monsters
  const byId = useMemo(() => new Map(frame.units.map((u) => [u.id, u])), [frame]);
  const initOrder = run.initiative.length ? run.initiative : frame.units.map((u) => ({ id: u.id, name: u.name, glyph: u.glyph, side: u.side }));
  const rosterParty = initOrder.filter((i) => i.side === "party").map((i) => byId.get(i.id)).filter((u): u is UnitSnap => !!u);
  const rosterMon = initOrder.filter((i) => i.side === "monster").map((i) => byId.get(i.id)).filter((u): u is UnitSnap => !!u);

  // per-round total HP for the two sides (the play-by-play sparkline)
  const hpCurve = useMemo(() => {
    const rounds = new Map<number, { p: number; m: number }>();
    for (const f of frames) {
      let p = 0;
      let m = 0;
      for (const u of f.units) {
        if (u.side === "party") p += Math.max(0, u.hp);
        else m += Math.max(0, u.hp);
      }
      rounds.set(f.round, { p, m });
    }
    const rows = [...rounds.entries()].sort((a, b) => a[0] - b[0]);
    const pMax = Math.max(1, ...rows.map((r) => r[1].p));
    const mMax = Math.max(1, ...rows.map((r) => r[1].m));
    return { rows, pMax, mMax };
  }, [frames]);

  // keyboard transport (space = play/pause, arrows = step, home/end)
  useEffect(() => {
    if (awaiting) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => (atEnd ? (setIdx(0), true) : !p)); }
      else if (e.key === "ArrowRight") { setPlaying(false); setIdx((i) => Math.min(last, i + 1)); }
      else if (e.key === "ArrowLeft") { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === "Home") { setPlaying(false); setIdx(0); }
      else if (e.key === "End") { setPlaying(false); setIdx(last); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awaiting, atEnd, last]);

  // ---- control-mode board interactions ----
  const reachSet = useMemo(() => new Set(awaiting?.reachable ?? []), [awaiting]);
  const selAction: AwaitAction | undefined = awaiting?.actions.find((a) => a.id === wiz.action);
  const aimOrigin = wiz.origin ?? hoverOrigin;
  const aoePrev = useMemo(() => {
    if (!awaiting || !selAction?.aoe || !aimOrigin) return new Set<string>();
    const from = wiz.move ?? awaiting.pos;
    return new Set(aoePreview(selAction.aoe.shape, from, aimOrigin, selAction.aoe.sizeFt, dims));
  }, [awaiting, selAction, aimOrigin, wiz.move, dims]);

  const targetsEnemy = !!selAction && !selAction.friendly && !selAction.aoe;
  const needsOrigin = !!selAction?.aoe;
  // rough 5-10-5 feet from a 1x1 square to a footprint box (just for the "out of reach" hint)
  const roughFt = (mx: number, my: number, b: { x0: number; y0: number; x1: number; y1: number }) => {
    const gx = Math.max(0, mx - b.x1, b.x0 - mx);
    const gy = Math.max(0, my - b.y1, b.y0 - my);
    const diag = Math.min(gx, gy);
    return (Math.max(gx, gy) + diag) * 5 + Math.floor(diag / 2) * 5;
  };
  const meleeGap =
    awaiting && selAction?.needsMelee && wiz.target
      ? (() => {
          const from = wiz.move ?? awaiting.pos;
          const tb = awaiting.units.find((u) => u.id === wiz.target)?.box;
          return tb ? roughFt(from.x, from.y, tb) : 0;
        })()
      : 0;
  const outOfReach = !!awaiting && !!wiz.target && !!selAction?.needsMelee && meleeGap > awaiting.reachFt + 0.001;
  const bonusSel: AwaitAction | undefined = awaiting?.bonusActions.find((a) => a.id === wiz.bonusAction);
  const bonusNeedsTarget = !!bonusSel && !bonusSel.friendly && !bonusSel.aoe;
  const step: "move" | "target" | "origin" | "bonusTarget" | "ready" = !awaiting
    ? "ready"
    : targetsEnemy && !wiz.target
      ? "target"
      : needsOrigin && !wiz.origin
        ? "origin"
        : bonusNeedsTarget && !wiz.bonusTarget
          ? "bonusTarget"
          : "move";

  const clickCell = (x: number, y: number, u?: UnitSnap) => {
    if (!awaiting) return;
    if (step === "target") {
      if (u && u.side === "monster" && u.alive) setWiz({ ...wiz, target: u.id });
      return;
    }
    if (step === "bonusTarget") {
      if (u && u.side === "monster" && u.alive) setWiz({ ...wiz, bonusTarget: u.id });
      return;
    }
    if (step === "origin") {
      setWiz({ ...wiz, origin: { x, y } });
      return;
    }
    // move step
    if (reachSet.has(`${x},${y}`)) setWiz({ ...wiz, move: { x, y } });
  };

  const confirm = () => {
    if (!awaiting) return;
    onCommit({
      round: awaiting.round,
      unitId: awaiting.unitId,
      move: wiz.move ?? undefined,
      actionId: wiz.action ?? undefined,
      targetId: wiz.target ?? undefined,
      aoeOrigin: wiz.origin ?? undefined,
      bonusActionId: wiz.bonusAction ?? undefined,
      bonusTargetId: wiz.bonusTarget ?? undefined,
    });
  };

  return (
    <section className="flex flex-col gap-3">
      {awaiting ? (
        <div className="flex flex-col gap-2 border border-accent/40 bg-accent/5 rounded p-3 text-sm">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-accent">Your turn — {awaiting.unitName}</span>
            <span className="text-xs text-muted">round {awaiting.round} · speed {awaiting.speedFt} ft</span>
            {loading && <span className="text-xs text-muted">resolving…</span>}
          </div>
          <p className="text-xs text-muted">
            {step === "move" && "Click a highlighted square to move there (or leave it to stay put), then pick an action."}
            {step === "target" && "Click an enemy to target."}
            {step === "bonusTarget" && "Click an enemy for the bonus action."}
            {step === "origin" && "Click a square to aim the area effect."}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted">Move:</span>
            <span className="text-xs">{wiz.move ? `(${wiz.move.x}, ${wiz.move.y})` : "stay"}</span>
            {wiz.move && (
              <button className="text-xs text-muted hover:text-normal" onClick={() => setWiz({ ...wiz, move: null })}>
                reset
              </button>
            )}
          </div>
          <div className="flex items-start gap-1.5 flex-wrap max-h-28 overflow-y-auto">
            <span className="text-xs text-muted pt-1">Action:</span>
            {awaiting.actions.length === 0 && <span className="text-xs text-muted pt-1">— none available —</span>}
            {awaiting.actions.map((a) => (
              <button
                key={a.id}
                onClick={() => setWiz({ ...wiz, action: wiz.action === a.id ? null : a.id, target: null, origin: null })}
                className={`text-xs px-2 py-1 rounded border ${
                  wiz.action === a.id ? "border-accent bg-accent/10 text-normal" : "border-border text-muted hover:text-normal"
                }`}
                title={a.needsMelee ? "melee" : a.friendly ? "self / ally" : a.aoe ? `${a.aoe.shape} ${a.aoe.sizeFt} ft` : "ranged"}
              >
                {a.name}
              </button>
            ))}
            {wiz.action && (
              <button className="text-xs text-muted hover:text-normal" onClick={() => setWiz({ ...wiz, action: null, target: null, origin: null })}>
                skip action
              </button>
            )}
          </div>
          {targetsEnemy && (
            <div className="text-xs text-muted">
              Target: {wiz.target ? roster.find((u) => u.id === wiz.target)?.name ?? wiz.target : "—"}
              {outOfReach && (
                <span className="text-warning ml-2">⚠ ~{meleeGap} ft away — move closer or the strike whiffs</span>
              )}
            </div>
          )}
          {needsOrigin && (
            <div className="text-xs text-muted">Aim point: {wiz.origin ? `(${wiz.origin.x}, ${wiz.origin.y})` : "hover the map"}</div>
          )}
          {awaiting.bonusActions.length > 0 && (
            <div className="flex items-start gap-1.5 flex-wrap max-h-20 overflow-y-auto">
              <span className="text-xs text-muted pt-1">Bonus:</span>
              {awaiting.bonusActions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setWiz({ ...wiz, bonusAction: wiz.bonusAction === a.id ? null : a.id, bonusTarget: null })}
                  className={`text-xs px-2 py-1 rounded border ${
                    wiz.bonusAction === a.id ? "border-accent bg-accent/10 text-normal" : "border-border text-muted hover:text-normal"
                  }`}
                  title={a.needsMelee ? "melee" : a.friendly ? "self / ally" : "ranged"}
                >
                  {a.name}
                </button>
              ))}
              {wiz.bonusAction && (
                <button className="text-xs text-muted hover:text-normal" onClick={() => setWiz({ ...wiz, bonusAction: null, bonusTarget: null })}>
                  none
                </button>
              )}
              {bonusNeedsTarget && (
                <span className="text-xs pt-1">→ {wiz.bonusTarget ? roster.find((u) => u.id === wiz.bonusTarget)?.name ?? "" : "pick an enemy"}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button
              variant="primary"
              onClick={confirm}
              disabled={loading || (targetsEnemy && !wiz.target) || (needsOrigin && !wiz.origin) || (bonusNeedsTarget && !wiz.bonusTarget)}
            >
              Confirm turn
            </Button>
            <button className="text-xs text-accent hover:underline" onClick={onAi} disabled={loading}>
              let the AI take this turn
            </button>
            {canUndo && (
              <button className="text-xs text-muted hover:text-normal" onClick={onUndo} disabled={loading}>
                undo last turn
              </button>
            )}
            <button className="text-xs text-muted hover:text-normal" onClick={onFinishAi} disabled={loading}>
              finish with AI
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <div className="inline-flex rounded border border-border overflow-hidden">
              <TBtn onClick={() => { setPlaying(false); setIdx(0); }} label="⏮" />
              <TBtn onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} label="◀" />
              <TBtn
                onClick={() => {
                  if (atEnd) { setIdx(0); setPlaying(true); } else setPlaying((p) => !p);
                }}
                label={playing && !atEnd ? "⏸" : "▶"}
                wide
              />
              <TBtn onClick={() => { setPlaying(false); setIdx((i) => Math.min(last, i + 1)); }} label="▶▶" />
              <TBtn onClick={() => { setPlaying(false); setIdx(last); }} label="⏭" />
            </div>
            <select className="text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={900}>0.5×</option>
              <option value={450}>1×</option>
              <option value={220}>2×</option>
              <option value={110}>4×</option>
            </select>
            <input
              type="range"
              min={0}
              max={last}
              value={shownIdx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
              className="flex-1 min-w-40"
            />
            <span className="text-xs text-muted tabular-nums whitespace-nowrap">R{frame.round} · {shownIdx + 1}/{frames.length}</span>
            <button className="text-xs text-accent hover:underline" onClick={onReplay}>replay</button>
            <span className="text-xs text-muted/60 hidden sm:inline">space · ← → · home/end</span>
          </div>
        </>
      )}

      {/* round header + initiative order */}
      <div className="flex items-baseline gap-4 flex-wrap font-mono text-xs">
        <span className="tracking-[0.35em] text-normal uppercase">Round {frame.round}</span>
        <span className="text-muted truncate">
          init: {initOrder.map((i) => i.name).join(" › ")}
        </span>
      </div>

      {/* current event line, mockup-style */}
      <p className="font-mono text-xs min-h-4">
        <span className="text-muted">R{frame.round}:</span>{" "}
        <span className="text-normal">{frame.text ?? (frame.kind === "start" ? "the battle begins" : frame.kind === "end" ? "" : "…")}</span>
      </p>

      <div className="flex gap-5 flex-wrap items-start">
        <div className="overflow-x-auto">
          <div
            className={`inline-grid font-mono leading-none select-none text-muted/40 ${awaiting ? "cursor-pointer" : ""}`}
            style={{ gridTemplateColumns: `2.5ch 1ch repeat(${dims.width}, 1ch) 1ch`, fontSize: "13px" }}
          >
            {Array.from({ length: dims.height + 2 }, (_, ry) => {
              const y = ry - 1; // -1 = top border, H = bottom border
              if (y < 0 || y >= dims.height) {
                const cornerL = y < 0 ? "┌" : "└";
                const cornerR = y < 0 ? "┐" : "┘";
                return (
                  <div key={ry} className="contents">
                    <span />
                    <span className="text-center">{cornerL}</span>
                    <span className="text-muted/40" style={{ gridColumn: `span ${dims.width}` }}>{"─".repeat(dims.width)}</span>
                    <span className="text-center">{cornerR}</span>
                  </div>
                );
              }
              return (
                <div key={ry} className="contents">
                  <span className="text-right pr-1 tabular-nums" style={{ height: "1.15em" }}>{y + 1}</span>
                  <span className="text-center">│</span>
                  {Array.from({ length: dims.width }, (_, x) => {
                    const key = `${x},${y}`;
                    const u = unitAt.get(key);
                    const t = terrain[y * dims.width + x] ?? ".";
                    let ch = t === "." ? "·" : t;
                    let cls = TERRAIN_CLASS[t] ?? "text-muted/25";
                    if (u) {
                      ch = u.glyph;
                      cls = u.side === "party" ? "text-accent font-semibold" : "text-danger font-semibold";
                      if (u.downed) cls = "text-muted/50 line-through";
                    } else if (pathSet.has(key)) {
                      ch = "•";
                      cls = "text-accent/40";
                    }
                    let bg = "";
                    if (awaiting) {
                      if (wiz.move && wiz.move.x === x && wiz.move.y === y) bg = "bg-accent/50 rounded-sm ring-1 ring-accent";
                      else if (aimOrigin && aimOrigin.x === x && aimOrigin.y === y) bg = "bg-warning/50 rounded-sm";
                      else if (aoePrev.has(key)) bg = "bg-warning/30";
                      else if (step === "move" && reachSet.has(key) && !u) bg = "bg-accent/25";
                      else if ((step === "target" || step === "bonusTarget") && u?.side === "monster") bg = "bg-danger/30 rounded-sm";
                      else if ((wiz.target === u?.id || wiz.bonusTarget === u?.id) && u) bg = "bg-danger/50 rounded-sm ring-1 ring-danger";
                    }
                    if (!bg && u?.isActor) bg = "bg-accent/20 rounded-sm";
                    else if (!bg && templateSet.has(key)) bg = "bg-warning/20";
                    const distTip =
                      awaiting && step === "move" && !u
                        ? `${roughFt(awaiting.pos.x, awaiting.pos.y, { x0: x, y0: y, x1: x, y1: y })} ft`
                        : undefined;
                    return (
                      <span
                        key={x}
                        className={`text-center ${cls} ${bg}`}
                        style={{ height: "1.15em" }}
                        onClick={awaiting ? () => clickCell(x, y, u) : undefined}
                        onMouseEnter={awaiting && step === "origin" ? () => setHoverOrigin({ x, y }) : undefined}
                        onMouseLeave={awaiting && step === "origin" ? () => setHoverOrigin(null) : undefined}
                        title={
                          u
                            ? `${u.name} — ${u.hp}/${u.maxHp}${u.conditions.length ? " [" + u.conditions.join(",") + "]" : ""}`
                            : distTip
                        }
                      >
                        {ch}
                      </span>
                    );
                  })}
                  <span className="text-center">│</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2">
            <TerrainLegend />
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-56 flex-1">
          <div className="flex flex-col gap-0.5">
            {rosterParty.map((u) => (
              <RosterRow key={u.id} u={u} actor={u.isActor || u.id === awaiting?.unitId} />
            ))}
            {rosterMon.length > 0 && <div className="text-muted/40 font-mono text-xs my-0.5">──────────────</div>}
            {rosterMon.map((u) => (
              <RosterRow key={u.id} u={u} actor={u.isActor || u.id === awaiting?.unitId} />
            ))}
          </div>

          {hpCurve.rows.length > 1 && (
            <div className="font-mono text-xs text-muted flex flex-col gap-0.5">
              <div><span className="text-accent">party </span>{sparkline(hpCurve.rows.map((r) => r[1].p), hpCurve.pMax)}</div>
              <div><span className="text-danger">foes  </span>{sparkline(hpCurve.rows.map((r) => r[1].m), hpCurve.mMax)}</div>
              <div className="text-muted/50">rounds 1–{hpCurve.rows[hpCurve.rows.length - 1][0]}</div>
            </div>
          )}

          <div ref={logRef} className="text-xs text-muted bg-panel border border-border rounded p-2 max-h-44 overflow-y-auto flex flex-col gap-0.5 font-mono">
            {logLines.map((l) => (
              <div key={l.seq}>
                <span className="opacity-50">R{l.round}</span> {l.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TBtn({ onClick, label, wide }: { onClick: () => void; label: string; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${wide ? "px-3" : "px-2"} py-1 bg-panel text-muted hover:bg-hover hover:text-normal`}
    >
      {label}
    </button>
  );
}

// -------------------------------------------------------------- map editor

const FP: Record<string, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

const MAP_TOOLS: { kind: string; glyph: string; label: string }[] = [
  { kind: "floor", glyph: "·", label: "Floor / erase" },
  { kind: "wall", glyph: "#", label: "Wall" },
  { kind: "difficult", glyph: "~", label: "Difficult" },
  { kind: "cover", glyph: "o", label: "Cover" },
  { kind: "hazard", glyph: "!", label: "Hazard" },
];
const GLYPH: Record<string, string> = { floor: ".", wall: "#", difficult: "~", cover: "o", hazard: "!" };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAP_PRESETS: Record<string, (w: number, h: number) => string> = {
  "Open field": (w, h) => ".".repeat(w * h),
  Pillars: (w, h) => {
    const t = Array<string>(w * h).fill(".");
    const rng = mulberry(w * 131 + h * 17 + 7);
    const n = Math.round(4 + rng() * 4);
    for (let k = 0; k < n; k++) {
      const px = 2 + Math.floor(rng() * (w - 5));
      const py = 3 + Math.floor(rng() * (h - 7));
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (px + dx < w && py + dy < h) t[(py + dy) * w + px + dx] = "#";
    }
    return t.join("");
  },
  Chokepoint: (w, h) => {
    const t = Array<string>(w * h).fill(".");
    const mid = h >> 1;
    for (let x = 0; x < w; x++) t[mid * w + x] = "#";
    const gap = (w >> 1) - 1;
    for (let g = 0; g < 3; g++) t[mid * w + gap + g] = ".";
    return t.join("");
  },
  Corridor: (w, h) => {
    const t = Array<string>(w * h).fill(".");
    for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) t[y * w + x] = "#";
    return t.join("");
  },
  "Scattered cover": (w, h) => {
    const t = Array<string>(w * h).fill(".");
    const rng = mulberry(w * 51 + h * 91 + 3);
    for (let k = 0; k < Math.round(w * 0.9); k++) {
      const x = Math.floor(rng() * w);
      const y = 2 + Math.floor(rng() * (h - 4));
      t[y * w + x] = rng() < 0.7 ? "o" : "~";
    }
    return t.join("");
  },
  "Lava vein": (w, h) => {
    const t = Array<string>(w * h).fill(".");
    const rng = mulberry(w * 7 + h * 43 + 11);
    let y = h >> 1;
    for (let x = 0; x < w; x++) {
      t[y * w + x] = "!";
      if (rng() < 0.45) y += rng() < 0.5 ? 1 : -1;
      y = Math.max(1, Math.min(h - 2, y));
    }
    return t.join("");
  },
};

function tileAt(def: BattleMapDef, x: number, y: number): string {
  return def.tiles[y * def.width + x] ?? ".";
}

/** can `id` (footprint from roster) stand anchored at (x,y) on this def? */
function tokenFits(def: BattleMapDef, roster: RosterEntry[], id: string, x: number, y: number): boolean {
  const fp = FP[roster.find((r) => r.id === id)?.size ?? "medium"] ?? 1;
  const otherCells = new Set<string>();
  for (const [oid, p] of Object.entries(def.placements)) {
    if (oid === id) continue;
    const ofp = FP[roster.find((r) => r.id === oid)?.size ?? "medium"] ?? 1;
    for (let dy = 0; dy < ofp; dy++) for (let dx = 0; dx < ofp; dx++) otherCells.add(`${p.x + dx},${p.y + dy}`);
  }
  for (let dy = 0; dy < fp; dy++) {
    for (let dx = 0; dx < fp; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= def.width || cy >= def.height) return false;
      const t = tileAt(def, cx, cy);
      if (t === "#" || t === "o") return false;
      if (otherCells.has(`${cx},${cy}`)) return false;
    }
  }
  return true;
}

const MAPS_KEY = "fightSimMaps";
const readMaps = (): Record<string, BattleMapDef> => {
  try {
    return JSON.parse(localStorage.getItem(MAPS_KEY) ?? "{}");
  } catch {
    return {};
  }
};

function MapSetup({
  setup,
  open,
  onToggle,
  onChange,
  onReset,
}: {
  setup: SimSetup;
  open: boolean;
  onToggle: () => void;
  onChange: (def: BattleMapDef) => void;
  onReset: () => void;
}) {
  const roster = useMemo(() => {
    try {
      return rosterForSetup(setup);
    } catch {
      return [] as RosterEntry[];
    }
  }, [setup]);

  const def = setup.battleMap ?? null;
  const placed = def ? Object.keys(def.placements).filter((id) => roster.some((r) => r.id === id)).length : 0;
  const custom = def ? [...def.tiles].some((c) => c !== "." && c !== " ") : false;

  return (
    <div className="flex flex-col gap-2 border border-border rounded bg-panel/50 p-2">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <button
          className="text-accent hover:underline"
          onClick={() => {
            if (!open && !setup.battleMap) onChange(starterBattleMap(setup));
            onToggle();
          }}
        >
          {open ? "▾ hide map setup" : "▸ set up the map"}
        </button>
        <span className="text-muted">
          {def
            ? `${def.width}×${def.height}${custom ? " · custom terrain" : " · open field"} · ${placed}/${roster.length} placed`
            : "auto: open room, sides apart"}
        </span>
        {def && (
          <button className="text-muted hover:text-danger" onClick={() => onReset()}>
            reset to auto
          </button>
        )}
      </div>
      {open && <MapEditor setup={setup} roster={roster} onChange={onChange} />}
    </div>
  );
}

function MapEditor({
  setup,
  roster,
  onChange,
}: {
  setup: SimSetup;
  roster: RosterEntry[];
  onChange: (def: BattleMapDef) => void;
}) {
  const [def, setDef] = useState<BattleMapDef>(() => setup.battleMap ?? starterBattleMap(setup));
  const defRef = useRef(def);
  const [tool, setTool] = useState("wall");
  const brushRef = useRef(1);
  const [brush, setBrushState] = useState(1);
  const toolRef = useRef("wall");
  const painting = useRef(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [savedMaps, setSavedMaps] = useState<Record<string, BattleMapDef>>(() => readMaps());
  const fileRef = useRef<HTMLInputElement>(null);

  const setBrush = (n: number) => {
    brushRef.current = n;
    setBrushState(n);
  };
  const pickTool = (t: string) => {
    toolRef.current = t;
    setTool(t);
  };

  /** update local state (and the ref that handlers read to dodge stale closures) */
  const commit = useCallback((next: BattleMapDef) => {
    defRef.current = next;
    setDef(next);
  }, []);
  const emit = useCallback(
    (next: BattleMapDef) => {
      commit(next);
      onChange(next);
    },
    [commit, onChange],
  );

  const paint = (x: number, y: number) => {
    const cur = defRef.current;
    const r = brushRef.current - 1;
    const tiles = cur.tiles.split("");
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= cur.width || cy >= cur.height) continue;
        tiles[cy * cur.width + cx] = GLYPH[toolRef.current];
      }
    }
    const placements = { ...cur.placements };
    const next = { ...cur, tiles: tiles.join(""), placements };
    for (const [id, p] of Object.entries(placements)) {
      if (!tokenFits(next, roster, id, p.x, p.y)) delete placements[id];
    }
    commit(next);
  };

  const resize = (w: number, h: number) => {
    const width = Math.max(8, Math.min(40, w));
    const height = Math.max(8, Math.min(30, h));
    const tiles = Array<string>(width * height).fill(".");
    for (let y = 0; y < Math.min(height, def.height); y++)
      for (let x = 0; x < Math.min(width, def.width); x++) tiles[y * width + x] = tileAt(def, x, y);
    const placements: BattleMapDef["placements"] = {};
    for (const [id, p] of Object.entries(def.placements)) if (p.x < width && p.y < height) placements[id] = p;
    emit({ width, height, tiles: tiles.join(""), placements });
  };

  const applyPreset = (name: string) => {
    const tiles = MAP_PRESETS[name](def.width, def.height);
    const next = { ...def, tiles };
    for (const [id, p] of Object.entries(next.placements)) if (!tokenFits(next, roster, id, p.x, p.y)) delete next.placements[id];
    emit(next);
  };

  const placeToken = (id: string, x: number, y: number) => {
    if (!roster.some((r) => r.id === id)) return;
    if (!tokenFits(def, roster, id, x, y)) return;
    emit({ ...def, placements: { ...def.placements, [id]: { x, y } } });
  };
  const unplace = (id: string) => {
    const placements = { ...def.placements };
    delete placements[id];
    emit({ ...def, placements });
  };

  const cellToken = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    for (const [id, p] of Object.entries(def.placements)) {
      const e = roster.find((r) => r.id === id);
      if (!e) continue;
      const fp = FP[e.size] ?? 1;
      for (let dy = 0; dy < fp; dy++) for (let dx = 0; dx < fp; dx++) m.set(`${p.x + dx},${p.y + dy}`, e);
    }
    return m;
  }, [def.placements, roster]);

  const unplaced = roster.filter((r) => !def.placements[r.id]);

  const saveMap = () => {
    const name = saveName.trim();
    if (!name) return;
    const store = { ...readMaps(), [name]: def };
    localStorage.setItem(MAPS_KEY, JSON.stringify(store));
    setSavedMaps(store);
    setSaveName("");
  };
  const loadMap = (name: string) => {
    const m = readMaps()[name];
    if (m) emit(m);
  };
  const deleteMap = (name: string) => {
    const store = readMaps();
    delete store[name];
    localStorage.setItem(MAPS_KEY, JSON.stringify(store));
    setSavedMaps(store);
  };
  const exportMap = () => {
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "battle-map.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importMap = (file: File) => {
    file.text().then((txt) => {
      try {
        const m = JSON.parse(txt) as BattleMapDef;
        if (typeof m.width === "number" && typeof m.height === "number" && typeof m.tiles === "string" && m.placements) {
          emit({ width: m.width, height: m.height, tiles: m.tiles, placements: m.placements });
        }
      } catch {
        /* ignore a bad file */
      }
    });
  };

  return (
    <div
      className="flex flex-col gap-2 text-xs"
      onPointerUp={() => {
        if (painting.current) {
          painting.current = false;
          onChange(defRef.current);
        }
      }}
      onPointerLeave={() => {
        if (painting.current) {
          painting.current = false;
          onChange(defRef.current);
        }
      }}
    >
      {/* toolbar */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
        <span className="flex items-center gap-1">
          size
          <Stepper value={def.width} min={8} max={40} onChange={(w) => resize(w, def.height)} />
          ×
          <Stepper value={def.height} min={8} max={30} onChange={(h) => resize(def.width, h)} />
        </span>
        <select
          className="text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value) applyPreset(e.target.value);
          }}
        >
          <option value="">preset…</option>
          {Object.keys(MAP_PRESETS).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="inline-flex rounded border border-border overflow-hidden">
          {MAP_TOOLS.map((t) => (
            <button
              key={t.kind}
              title={t.label}
              onClick={() => pickTool(t.kind)}
              className={`px-2 py-1 font-mono ${tool === t.kind ? "bg-active text-normal" : "bg-panel text-muted hover:bg-hover"}`}
            >
              {t.glyph}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          brush
          <Stepper value={brush} min={1} max={4} onChange={setBrush} />
        </span>
        <button className="text-accent hover:underline" onClick={() => emit({ ...def, placements: autoPlace(def, roster) })}>
          auto-place tokens
        </button>
        <button className="text-muted hover:text-normal" onClick={() => emit({ ...def, tiles: ".".repeat(def.width * def.height) })}>
          clear terrain
        </button>
      </div>

      <TerrainLegend />

      {/* board + tray */}
      <div className="flex gap-4 flex-wrap items-start">
        <div className="overflow-x-auto">
          <div
            className="inline-grid font-mono leading-none select-none bg-panel border border-border rounded p-2 touch-none"
            style={{ gridTemplateColumns: `repeat(${def.width}, 1ch)`, fontSize: "13px" }}
          >
            {Array.from({ length: def.width * def.height }, (_, i) => {
              const x = i % def.width;
              const y = Math.floor(i / def.width);
              const key = `${x},${y}`;
              const tok = cellToken.get(key);
              const t = def.tiles[i] ?? ".";
              const glyph = tok ? tok.glyph : t === "." ? "·" : t;
              const cls = tok
                ? tok.side === "party"
                  ? "text-accent font-semibold"
                  : "text-danger font-semibold"
                : t === "#"
                  ? "text-muted/70"
                  : t === "."
                    ? "text-muted/20"
                    : "text-muted/50";
              return (
                <span
                  key={i}
                  className={`text-center cursor-crosshair ${cls}`}
                  style={{ height: "1.15em" }}
                  draggable={!!tok}
                  onDragStart={(e) => {
                    if (!tok) return;
                    e.dataTransfer.setData("text/plain", tok.id);
                    setDrag(tok.id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain") || drag;
                    if (id) placeToken(id, x, y);
                    setDrag(null);
                  }}
                  onPointerDown={() => {
                    if (tok) return;
                    painting.current = true;
                    paint(x, y);
                  }}
                  onPointerEnter={() => painting.current && paint(x, y)}
                >
                  {glyph}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-44">
          <div
            className="border border-dashed border-border rounded p-2 flex flex-wrap gap-1.5 min-h-12"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain") || drag;
              if (id) unplace(id);
              setDrag(null);
            }}
          >
            {unplaced.length === 0 && <span className="text-muted">all tokens placed — drag one here to pull it back</span>}
            {unplaced.map((r) => (
              <button
                key={r.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", r.id);
                  setDrag(r.id);
                }}
                className={`px-1.5 py-0.5 rounded bg-hover flex items-center gap-1 ${r.side === "party" ? "text-accent" : "text-danger"}`}
                title={r.name}
              >
                <span className="font-mono font-semibold">{r.glyph}</span>
                <span className="text-normal max-w-24 truncate">{r.name}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 text-muted">
            <div className="flex items-center gap-1.5">
              <input
                className="flex-1 min-w-0"
                placeholder="map name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <button className="text-accent hover:underline" onClick={saveMap}>save</button>
            </div>
            {Object.keys(savedMaps).length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  className="flex-1 text-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) loadMap(e.target.value);
                  }}
                >
                  <option value="">load…</option>
                  {Object.keys(savedMaps).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <select
                  className="text-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) deleteMap(e.target.value);
                  }}
                >
                  <option value="">delete…</option>
                  {Object.keys(savedMaps).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button className="text-accent hover:underline" onClick={exportMap}>export JSON</button>
              <button className="text-accent hover:underline" onClick={() => fileRef.current?.click()}>import JSON</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importMap(e.target.files[0])}
              />
            </div>
          </div>
        </div>
      </div>
      <p className="text-muted">Click-drag to paint terrain. Drag a token onto a square to place it; drag it to the tray to remove it. Unplaced tokens get auto-positioned when you run.</p>
    </div>
  );
}

// ------------------------------------------------------------------- enemies

function EnemyEditor({
  options,
  enemies,
  onChange,
  customMonsters,
  onCustomChange,
}: {
  options: MonsterOption[];
  enemies: SimSetup["enemies"];
  onChange: (e: SimSetup["enemies"]) => void;
  customMonsters: Combatant[];
  onCustomChange: (c: Combatant[]) => void;
}) {
  const [pick, setPick] = useState("");
  const [customMsg, setCustomMsg] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [seed, setSeed] = useState<{ draft: BuilderDraft; warnings: string[] } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => Object.fromEntries(options.map((o) => [o.id, o])), [options]);

  const addCustom = (c: Combatant) => {
    onCustomChange([...customMonsters.filter((m) => m.id !== c.id), c]);
    setCustomMsg(`Added “${c.name}” to the custom list.`);
    setShowBuilder(false);
    setSeed(null);
  };

  const openBuilder = (s: { draft: BuilderDraft; warnings: string[] } | null) => {
    setSeed(s);
    setShowBuilder(true);
    setPasteOpen(false);
  };

  const parsePaste = () => {
    setPasteErr(null);
    const r = parseStatblock(pasteText);
    if (r.draft) openBuilder({ draft: r.draft, warnings: r.warnings });
    else setPasteErr(r.error ?? "couldn't parse that");
  };

  const importFromNpcNotes = async () => {
    setImporting(true);
    setCustomMsg(null);
    try {
      const list: { id: string; name: string }[] = await fetch("/api/notes?type=npc")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
      if (!list.length) {
        setCustomMsg("No NPC notes found in this workspace.");
        return;
      }
      const notes = await Promise.all(
        list.slice(0, 40).map((n) =>
          fetch(`/api/notes/${n.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      );
      let fromBlock = 0;
      let fromFm = 0;
      let failed = 0;
      const built: Combatant[] = [];
      for (const n of notes) {
        if (!n || (n.frontmatter as { type?: string })?.type !== "npc") continue;
        const res = npcNoteToMonster({ title: n.name, body: n.body ?? "", frontmatter: n.frontmatter });
        if (res.combatant) {
          built.push(res.combatant);
          if (res.warnings.some((w) => /no "## Stat Block"/.test(w))) fromFm++;
          else fromBlock++;
        } else failed++;
      }
      if (built.length) {
        const merged = [...customMonsters.filter((m) => !built.some((b) => b.id === m.id)), ...built];
        onCustomChange(merged);
      }
      setCustomMsg(
        `Imported ${built.length} NPC${built.length === 1 ? "" : "s"} — ${fromBlock} from a stat block, ${fromFm} from frontmatter + a generic attack${failed ? `, ${failed} failed` : ""}.`,
      );
    } finally {
      setImporting(false);
    }
  };

  const add = () => {
    if (!pick) return;
    onChange([...enemies, { id: pick, count: 1 }]);
    setPick("");
  };

  const onFile = async (file: File) => {
    setCustomMsg(null);
    const text = await file.text();
    const { monsters, errors } = loadCustomMonsters(text);
    if (monsters.length) {
      // merge: new ids win, existing custom entries kept
      const merged = [...customMonsters.filter((m) => !monsters.some((n) => n.id === m.id)), ...monsters];
      onCustomChange(merged);
    }
    const parts = [
      monsters.length ? `Loaded ${monsters.length} stat block${monsters.length === 1 ? "" : "s"}` : "Nothing loaded",
      errors.length ? `${errors.length} skipped: ${errors.slice(0, 2).join("; ")}${errors.length > 2 ? " …" : ""}` : "",
    ].filter(Boolean);
    setCustomMsg(parts.join(" · "));
  };

  const exportPack = () => {
    const blob = new Blob([exportCustomMonsters(customMonsters)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-monsters.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Enemies</h2>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <button className="text-xs text-accent hover:underline" onClick={() => fileRef.current?.click()}>
          load JSON
        </button>
        <button
          className={`text-xs hover:underline ${showBuilder ? "text-normal" : "text-accent"}`}
          onClick={() => (showBuilder ? (setShowBuilder(false), setSeed(null)) : openBuilder(null))}
        >
          {showBuilder ? "close builder" : "make a monster"}
        </button>
        <button
          className={`text-xs hover:underline ${pasteOpen ? "text-normal" : "text-accent"}`}
          onClick={() => setPasteOpen((v) => !v)}
        >
          paste a statblock
        </button>
        <button
          className="text-xs text-accent hover:underline disabled:opacity-50"
          onClick={() => void importFromNpcNotes()}
          disabled={importing}
        >
          {importing ? "importing…" : "import from NPC notes"}
        </button>
        {customMonsters.length > 0 && (
          <>
            <span className="text-xs text-muted">{customMonsters.length} custom loaded</span>
            <button className="text-xs text-accent hover:underline" onClick={exportPack}>
              export
            </button>
            <button
              className="text-xs text-muted hover:text-danger"
              onClick={() => {
                onCustomChange([]);
                setCustomMsg(null);
              }}
            >
              clear
            </button>
          </>
        )}
      </div>
      {customMsg && <p className="text-xs text-muted">{customMsg}</p>}
      {pasteOpen && (
        <div className="flex flex-col gap-1.5 bg-panel border border-border rounded p-3">
          <span className="text-xs text-muted">
            Paste a stat block — markdown (5e.tools “Get as Markdown”, D&D Beyond, homebrewery) or 5e.tools bestiary JSON.
            Only paste content you have the rights to use; nothing is fetched.
          </span>
          <textarea
            className="w-full h-40 text-xs font-mono"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"## Adult Red Dragon\n**Armor Class** 19\n**Hit Points** 256 (19d12 + 133)\n…"}
          />
          {pasteErr && <span className="text-xs text-danger">{pasteErr}</span>}
          <div className="flex gap-2">
            <Button onClick={parsePaste} disabled={!pasteText.trim()}>
              Parse into builder
            </Button>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {showBuilder && (
        <MonsterBuilder
          key={seed ? seed.draft.name + (seed.draft.cr ?? "") : "blank"}
          initial={seed?.draft}
          initialWarnings={seed?.warnings}
          onSave={addCustom}
          onCancel={() => {
            setShowBuilder(false);
            setSeed(null);
          }}
        />
      )}
      <div className="flex gap-2 flex-wrap">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-52">
          <option value="">Add a monster…</option>
          <optgroup label="Bosses">
            {options.filter((o) => o.kind === "boss").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — CR {o.cr}
              </option>
            ))}
          </optgroup>
          <optgroup label="Monsters">
            {options.filter((o) => o.kind === "monster").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — CR {o.cr}
              </option>
            ))}
          </optgroup>
          <optgroup label="Minions">
            {options.filter((o) => o.kind === "minion").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — CR {o.cr}
              </option>
            ))}
          </optgroup>
        </select>
        <Button onClick={add} disabled={!pick}>
          Add
        </Button>
      </div>
      {enemies.length === 0 ? (
        <p className="text-sm text-muted">No enemies yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {enemies.map((e, i) => (
            <li key={i} className="flex items-center gap-3 bg-panel border border-border rounded px-3 py-2 text-sm">
              <span className="flex-1">
                {byId[e.id]?.name ?? e.id}{" "}
                <span className="text-muted">CR {byId[e.id]?.cr ?? "?"}</span>
              </span>
              <Stepper
                value={e.count}
                min={1}
                max={12}
                onChange={(count) => onChange(enemies.map((x, xi) => (xi === i ? { ...x, count } : x)))}
                suffix="×"
              />
              <button
                className="text-muted hover:text-danger px-1"
                onClick={() => onChange(enemies.filter((_, xi) => xi !== i))}
                aria-label="Remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------- make a monster

const DMG_TONE: Record<DmgDefense, string> = {
  none: "text-muted border-border",
  resist: "text-warning border-warning/50",
  immune: "text-positive border-positive/50",
  vuln: "text-danger border-danger/50",
};

function MonsterBuilder({
  onSave,
  onCancel,
  initial,
  initialWarnings,
}: {
  onSave: (c: Combatant) => void;
  onCancel: () => void;
  initial?: BuilderDraft;
  initialWarnings?: string[];
}) {
  const [draft, setDraft] = useState<BuilderDraft>(() => initial ?? emptyDraft());
  const set = (p: Partial<BuilderDraft>) => setDraft((d) => ({ ...d, ...p }));
  const result = useMemo(() => draftToCombatant(draft), [draft]);

  const patchAttack = (i: number, p: Partial<BuilderDraft["attacks"][number]>) =>
    set({ attacks: draft.attacks.map((x, xi) => (xi === i ? { ...x, ...p } : x)) });
  const cycleDmg = (t: DamageType) => {
    const order: DmgDefense[] = ["none", "resist", "immune", "vuln"];
    set({ damage: { ...draft.damage, [t]: order[(order.indexOf(draft.damage[t]) + 1) % 4] } });
  };
  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="bg-panel border border-border rounded p-3 flex flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">Make a monster</span>
        <span className="text-xs text-muted">attacks + one breath + defenses — the fight-math essentials</span>
      </div>

      {/* identity + defense */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">Name</span>
          <input className="w-44" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Homebrew Horror" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">CR</span>
          <input className="w-14" value={draft.cr} onChange={(e) => set({ cr: e.target.value, pb: suggestedPb(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">Size</span>
          <select value={draft.size} onChange={(e) => set({ size: e.target.value as BuilderDraft["size"] })}>
            {SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">AC</span>
          <input type="number" className="w-14" value={draft.ac} onChange={(e) => set({ ac: Number(e.target.value) || 0 })} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">HP (dice or number)</span>
          <input className="w-32" value={draft.hp} onChange={(e) => set({ hp: e.target.value })} placeholder="18d12+108" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">PB</span>
          <input type="number" className="w-12" value={draft.pb} onChange={(e) => set({ pb: Number(e.target.value) || 1 })} />
        </label>
      </div>

      {/* abilities */}
      <div className="flex flex-wrap gap-2">
        {ABILITIES.map((ab) => (
          <label key={ab} className="flex flex-col items-center">
            <span className="text-[10px] uppercase text-muted">{ab}</span>
            <input
              type="number"
              className="w-12 text-center"
              value={draft.abilities[ab]}
              onChange={(e) => set({ abilities: { ...draft.abilities, [ab]: Number(e.target.value) || 0 } })}
            />
            <button
              type="button"
              className={`text-[10px] mt-0.5 px-1 rounded border ${draft.proficientSaves.includes(ab) ? "border-accent text-accent" : "border-border text-muted"}`}
              onClick={() => set({ proficientSaves: toggle(draft.proficientSaves, ab) })}
            >
              save
            </button>
          </label>
        ))}
      </div>

      {/* damage defenses — click a type to cycle none → resist → immune → vuln */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Damage (click: resist / immune / vuln)</span>
        <div className="flex flex-wrap gap-1">
          {DAMAGE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`text-[11px] px-1.5 py-0.5 rounded border ${DMG_TONE[draft.damage[t]]}`}
              onClick={() => cycleDmg(t)}
            >
              {t}
              {draft.damage[t] !== "none" && ` ·${draft.damage[t][0]}`}
            </button>
          ))}
        </div>
      </div>

      {/* condition immunities */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Condition immunities</span>
        <div className="flex flex-wrap gap-1">
          {BUILDER_CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              className={`text-[11px] px-1.5 py-0.5 rounded border ${draft.conditionImmunities.includes(c) ? "border-positive/50 text-positive" : "border-border text-muted"}`}
              onClick={() => set({ conditionImmunities: toggle(draft.conditionImmunities, c) })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* attacks */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Attacks (a Multiattack is generated automatically)</span>
        {draft.attacks.map((a, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <input className="w-28" value={a.name} onChange={(e) => patchAttack(i, { name: e.target.value })} placeholder="Claw" />
            <span className="text-xs text-muted">+</span>
            <input type="number" className="w-12" value={a.toHit} onChange={(e) => patchAttack(i, { toHit: Number(e.target.value) || 0 })} />
            <input className="w-24" value={a.dice} onChange={(e) => patchAttack(i, { dice: e.target.value })} placeholder="2d6+4" />
            <select value={a.type} onChange={(e) => patchAttack(i, { type: e.target.value as DamageType })}>
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Stepper value={a.count} min={1} max={5} onChange={(count) => patchAttack(i, { count })} suffix="×" />
            <button
              className="text-muted hover:text-danger px-1"
              onClick={() => set({ attacks: draft.attacks.filter((_, xi) => xi !== i) })}
              aria-label="Remove attack"
            >
              ✕
            </button>
          </div>
        ))}
        {draft.attacks.length < 6 && (
          <button
            className="text-xs text-accent hover:underline self-start"
            onClick={() => set({ attacks: [...draft.attacks, { name: "", toHit: draft.pb + 3, dice: "1d8+3", type: "bludgeoning", count: 1 }] })}
          >
            + add attack
          </button>
        )}
      </div>

      {/* breath / area */}
      {draft.aoe ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Breath / area effect</span>
            <button className="text-xs text-muted hover:text-danger" onClick={() => set({ aoe: null })}>
              remove
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="w-28" value={draft.aoe.name} onChange={(e) => set({ aoe: { ...draft.aoe!, name: e.target.value } })} placeholder="Fire Breath" />
            <select value={draft.aoe.shape} onChange={(e) => set({ aoe: { ...draft.aoe!, shape: e.target.value as "cone" } })}>
              {["cone", "line", "sphere", "emanation"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input type="number" className="w-14" value={draft.aoe.size} onChange={(e) => set({ aoe: { ...draft.aoe!, size: Number(e.target.value) || 0 } })} />
            <span className="text-xs text-muted">ft ·</span>
            <select value={draft.aoe.ability} onChange={(e) => set({ aoe: { ...draft.aoe!, ability: e.target.value as "dex" } })}>
              {ABILITIES.map((ab) => (
                <option key={ab} value={ab}>{ab}</option>
              ))}
            </select>
            <span className="text-xs text-muted">DC</span>
            <input type="number" className="w-12" value={draft.aoe.dc} onChange={(e) => set({ aoe: { ...draft.aoe!, dc: Number(e.target.value) || 0 } })} />
            <input className="w-24" value={draft.aoe.dice} onChange={(e) => set({ aoe: { ...draft.aoe!, dice: e.target.value } })} placeholder="12d6" />
            <select value={draft.aoe.type} onChange={(e) => set({ aoe: { ...draft.aoe!, type: e.target.value as DamageType } })}>
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={draft.aoe.recharge} onChange={(e) => set({ aoe: { ...draft.aoe!, recharge: e.target.value as "none" } })}>
              <option value="none">at will</option>
              <option value="roll:5-6">Recharge 5–6</option>
              <option value="roll:4-6">Recharge 4–6</option>
            </select>
          </div>
        </div>
      ) : (
        <button
          className="text-xs text-accent hover:underline self-start"
          onClick={() => set({ aoe: { name: "Breath", shape: "cone", size: 30, ability: "dex", dc: 10 + draft.pb + Math.floor((draft.abilities.con - 10) / 2), dice: "10d6", type: "fire", recharge: "roll:5-6" } })}
        >
          + breath / area effect
        </button>
      )}

      {/* legendary + ai */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={draft.legendary} onChange={(e) => set({ legendary: e.target.checked })} />
          Legendary actions
        </label>
        {draft.legendary && (
          <>
            <span className="flex items-center gap-1">
              budget
              <Stepper value={draft.legendaryBudget} min={1} max={5} onChange={(legendaryBudget) => set({ legendaryBudget })} />
            </span>
            {draft.attacks.filter((a) => a.name.trim()).map((a) => (
              <button
                key={a.name}
                type="button"
                className={`px-1.5 py-0.5 rounded border ${draft.legendaryAttacks.includes(a.name) ? "border-accent text-accent" : "border-border text-muted"}`}
                onClick={() => set({ legendaryAttacks: toggle(draft.legendaryAttacks, a.name) })}
              >
                {a.name}
              </button>
            ))}
          </>
        )}
        <label className="flex items-center gap-1.5">
          targets
          <select
            value={draft.ai.targetPriority}
            onChange={(e) => set({ ai: { ...draft.ai, targetPriority: e.target.value as BuilderDraft["ai"]["targetPriority"] } })}
          >
            <option value="highestThreat">highest threat</option>
            <option value="squishiest">squishiest</option>
            <option value="lowestHp">lowest HP</option>
            <option value="nearest">nearest</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={draft.ai.keepDistance} onChange={(e) => set({ ai: { ...draft.ai, keepDistance: e.target.checked } })} />
          ranged / kites
        </label>
      </div>

      {initialWarnings && initialWarnings.length > 0 && (
        <ul className="text-xs text-warning border-t border-border pt-2 flex flex-col gap-0.5">
          {initialWarnings.map((w, i) => (
            <li key={i}>· {w}</li>
          ))}
        </ul>
      )}

      {/* footer */}
      <div className="flex items-center gap-3 flex-wrap border-t border-border pt-2">
        {result.error ? (
          <span className="text-xs text-danger">{result.error}</span>
        ) : result.warnings.length ? (
          <span className="text-xs text-warning">saves with warnings: {result.warnings.slice(0, 2).join("; ")}</span>
        ) : (
          <span className="text-xs text-positive">✓ valid stat block</span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!result.combatant} onClick={() => result.combatant && onSave(result.combatant)}>
          Save to custom list
        </Button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- party

function PartyEditor({
  party,
  onChange,
}: {
  party: SimSetup["party"];
  onChange: (p: SimSetup["party"]) => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const setAllLevels = (level: number) => onChange(party.map((p) => ({ ...p, level })));
  const commonLevel = party.every((p) => p.level === party[0]?.level) ? party[0]?.level ?? 20 : null;

  const importFromNotes = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const list: { id: string; name: string }[] = await fetch("/api/notes?type=pc")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
      if (!list.length) {
        setImportMsg("No PC notes found in this workspace.");
        return;
      }
      const notes = (
        await Promise.all(
          list.slice(0, 8).map((n) => fetch(`/api/notes/${n.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)),
        )
      )
        .filter((n): n is { name: string; body?: string; frontmatter: Record<string, unknown> } => !!n && (n.frontmatter as { type?: string })?.type === "pc")
        .slice(0, 6);

      // resolve the linked class-reference note bodies (frontmatter.classRef is a title)
      const refTitles = new Set(notes.map((n) => String(n.frontmatter.classRef ?? "").trim()).filter(Boolean));
      const refBodies = new Map<string, string>();
      if (refTitles.size) {
        const refList: { id: string; name: string }[] = await fetch("/api/notes?type=class-reference")
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        await Promise.all(
          refList
            .filter((r) => refTitles.has(r.name))
            .map((r) =>
              fetch(`/api/notes/${r.id}`)
                .then((x) => (x.ok ? x.json() : null))
                .catch(() => null)
                .then((full) => {
                  if (full?.body) refBodies.set(r.name, full.body);
                }),
            ),
        );
      }

      const specs: SimSetup["party"] = [];
      let usedRef = 0;
      let fellBack = 0;
      let usedExtras = 0;
      for (const n of notes) {
        const classRefBody = refBodies.get(String(n.frontmatter.classRef ?? "").trim());
        const r = pcNoteToCombatant({ title: n.name, frontmatter: n.frontmatter, body: n.body, classRefBody });
        if (!r.spec) continue;
        specs.push({ template: r.spec.combatant.templateId ?? "gwm-fighter", name: r.spec.name, level: r.spec.level, combatant: r.spec.combatant });
        if (classRefBody && r.warnings.some((w) => w.startsWith("class reference:"))) usedRef++;
        if (r.warnings.some((w) => /unrecognised class/.test(w))) fellBack++;
        if (r.warnings.some((w) => /^(race|feat|item):/.test(w))) usedExtras++;
      }
      if (!specs.length) {
        setImportMsg("PC notes found but none could be built.");
        return;
      }
      onChange(specs);
      setImportMsg(
        `Imported ${specs.length} PC${specs.length === 1 ? "" : "s"} from their notes` +
          (usedRef ? `, ${usedRef} read features from a class reference` : "") +
          (usedExtras ? `, ${usedExtras} picked up a race / feat / item` : "") +
          (fellBack ? `, ${fellBack} fell back to a template` : "") +
          ".",
      );
    } catch {
      setImportMsg("Couldn't reach the notes API.");
    } finally {
      setImporting(false);
    }
  };
  const patch = (i: number, m: Partial<SimSetup["party"][number]>) =>
    onChange(party.map((x, xi) => (xi === i ? { ...x, ...m } : x)));
  const patchLoadout = (i: number, m: Partial<NonNullable<SimSetup["party"][number]["loadout"]>>) => {
    const next = { ...(party[i].loadout ?? {}), ...m } as NonNullable<SimSetup["party"][number]["loadout"]>;
    // drop falsy/zero keys so the summary stays tidy
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (!next[k]) delete next[k];
    patch(i, { loadout: Object.keys(next).length ? next : undefined });
  };
  const togglePick = (i: number, key: "feats" | "items", val: string) => {
    const cur = party[i][key] ?? [];
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    patch(i, { [key]: next.length ? next : undefined });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Party</h2>
        <button
          className="text-xs text-accent hover:underline"
          onClick={() => onChange(standardParty(commonLevel ?? 20))}
        >
          reset to standard 4
        </button>
        <button
          className="text-xs text-accent hover:underline disabled:opacity-50"
          onClick={() => void importFromNotes()}
          disabled={importing}
        >
          {importing ? "importing…" : "import from PC notes"}
        </button>
        {commonLevel !== null && (
          <span className="text-xs text-muted flex items-center gap-1">
            all levels
            <Stepper value={commonLevel} min={1} max={20} onChange={setAllLevels} />
          </span>
        )}
      </div>
      {importMsg && <p className="text-xs text-muted">{importMsg}</p>}
      <ul className="flex flex-col gap-1.5">
        {party.map((p, i) => (
          <li key={i} className="bg-panel border border-border rounded text-sm">
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                className="w-24"
                value={p.name ?? ""}
                placeholder="name"
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              {p.combatant ? (
                <span className="flex-1 min-w-40 text-xs text-muted flex items-center gap-1.5">
                  <span className="text-normal">{p.combatant.templateId ?? "pc"}</span>
                  <span className="opacity-70">· built from note</span>
                  <button
                    className="text-accent hover:underline"
                    onClick={() => patch(i, { combatant: undefined })}
                    title="switch to an editable template"
                  >
                    detach
                  </button>
                </span>
              ) : (
                <select
                  className="flex-1 min-w-40"
                  value={p.template}
                  onChange={(e) => patch(i, { template: e.target.value })}
                >
                  {TEMPLATE_IDS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-muted text-xs">lvl</span>
              {p.combatant ? (
                <span className="text-sm w-8 text-center tabular-nums">{p.level}</span>
              ) : (
                <Stepper value={p.level} min={1} max={20} onChange={(level) => patch(i, { level })} />
              )}
              <button
                className={`text-xs px-1 ${open.has(i) ? "text-accent" : "text-muted hover:text-normal"}`}
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
                aria-label="Loadout"
                title="race, feats & magic items"
              >
                ⚙
                {(() => {
                  const bits = [
                    loadoutSummary(p.loadout),
                    p.race,
                    (p.feats?.length ?? 0) + (p.items?.length ?? 0) > 0
                      ? `${(p.feats?.length ?? 0) + (p.items?.length ?? 0)} pick${(p.feats?.length ?? 0) + (p.items?.length ?? 0) === 1 ? "" : "s"}`
                      : "",
                  ].filter(Boolean);
                  return bits.length ? <span className="ml-1 opacity-70">{bits.join(" · ")}</span> : null;
                })()}
              </button>
              <button
                className="text-muted hover:text-danger px-1"
                onClick={() => onChange(party.filter((_, xi) => xi !== i))}
                aria-label="Remove"
                disabled={party.length <= 1}
              >
                ✕
              </button>
            </div>
            {open.has(i) && (
              <div className="flex flex-col gap-2 px-3 pb-3 pt-1 text-xs border-t border-border">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <LoadoutStepper label="Weapon +" value={p.loadout?.weaponBonus ?? 0} onChange={(weaponBonus) => patchLoadout(i, { weaponBonus: (weaponBonus || undefined) as 1 | 2 | 3 | undefined })} />
                  <LoadoutStepper label="AC +" value={p.loadout?.acItem ?? 0} onChange={(acItem) => patchLoadout(i, { acItem: (acItem || undefined) as 1 | 2 | 3 | undefined })} />
                  <LoadoutStepper label="Saves +" value={p.loadout?.saveItem ?? 0} onChange={(saveItem) => patchLoadout(i, { saveItem: (saveItem || undefined) as 1 | 2 | 3 | undefined })} />
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!!p.loadout?.resilientCon} onChange={(e) => patchLoadout(i, { resilientCon: e.target.checked || undefined })} />
                    Resilient (Con)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!!p.loadout?.toughHp} onChange={(e) => patchLoadout(i, { toughHp: e.target.checked || undefined })} />
                    Tough (+2 HP/lvl)
                  </label>
                </div>
                <div className="flex flex-wrap items-start gap-x-5 gap-y-2 pt-1.5 border-t border-border/60">
                  <label className="flex items-center gap-1.5">
                    <span className="text-muted">Race</span>
                    <select className="text-xs" value={p.race ?? ""} onChange={(e) => patch(i, { race: e.target.value || undefined })}>
                      <option value="">—</option>
                      {RACE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <PickList label="Feats" options={FEAT_OPTIONS} chosen={p.feats ?? []} onToggle={(v) => togglePick(i, "feats", v)} />
                  <PickList label="Items" options={ITEM_OPTIONS} chosen={p.items ?? []} onToggle={(v) => togglePick(i, "items", v)} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {party.length < 6 && (
        <button
          className="text-xs text-accent hover:underline self-start"
          onClick={() => onChange([...party, { template: TEMPLATE_IDS[0], name: `PC ${party.length + 1}`, level: commonLevel ?? 20 }])}
        >
          + add PC
        </button>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- results

function Results({
  result,
  showLog,
  onToggleLog,
}: {
  result: SimResult;
  showLog: boolean;
  onToggleLog: () => void;
}) {
  const { mc, sample, budget } = result;
  const win = mc.partyWinRate;
  const verdict =
    win >= 0.85 ? { label: "Party favoured", tone: "text-positive" }
      : win >= 0.5 ? { label: "Party favoured but bloodied", tone: "text-warning" }
        : win >= 0.15 ? { label: "Party in trouble", tone: "text-warning" }
          : { label: "Near-certain wipe", tone: "text-danger" };

  return (
    <section className="flex flex-col gap-4">
      <div className="bg-panel border border-border rounded p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className={`font-serif text-base ${verdict.tone}`}>{verdict.label}</span>
          <span className="text-xs text-muted">
            {mc.trials} trials · {mc.vsParty}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Party win" value={pct(mc.partyWinRate)} big />
          <Stat label="TPK" value={pct(mc.tpkRate)} big tone={mc.tpkRate > 0.4 ? "text-danger" : undefined} />
          <Stat label="Rounds" value={`${mc.avgRounds}`} sub={`${mc.roundsP10}–${mc.roundsP90}`} big />
          <Stat label="Party HP on win" value={`${mc.avgPartyHpPctOnWin}%`} sub={`${mc.avgSurvivorsOnWin} up`} big />
        </div>
        <div className="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Encounter budget: <span className="text-normal font-medium">{budget.rating.toUpperCase()}</span>{" "}
            ({budget.deadlyRatio}× the party&apos;s Deadly budget · {budget.adjustedXp.toLocaleString()} adj XP)
          </span>
          {mc.firstToFall && (
            <span>
              First to fall: <span className="text-normal">{mc.firstToFall.name}</span>
              {mc.firstDownRoundP50 != null && ` around round ${mc.firstDownRoundP50}`} ({pct(mc.firstToFall.rate)} of fights)
            </span>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <DamageList title="Party output" rows={mc.partyDamage} />
        <DamageList title="Enemy output" rows={mc.monsterDamage} />
      </div>

      <div className="bg-panel border border-border rounded">
        <button
          className="w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-hover"
          onClick={onToggleLog}
        >
          <span className="font-medium">
            Narrated fight <span className="text-muted">(seed {result.seed})</span>
          </span>
          <span className="text-muted">{showLog ? "▾" : "▸"}</span>
        </button>
        {showLog && (
          <pre className="px-4 pb-4 pt-1 text-xs leading-relaxed text-muted whitespace-pre-wrap max-h-[28rem] overflow-y-auto font-mono">
            {sample.log.join("\n")}
          </pre>
        )}
      </div>
    </section>
  );
}

function DamageList({ title, rows }: { title: string; rows: { name: string; avgDealt: number; pctOfSide: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.avgDealt));
  return (
    <div className="bg-panel border border-border rounded p-3 flex flex-col gap-2">
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{title}</span>
      {rows.length === 0 ? (
        <span className="text-xs text-muted">—</span>
      ) : (
        rows.slice(0, 6).map((r) => (
          <div key={r.name} className="flex flex-col gap-0.5 text-xs">
            <div className="flex justify-between">
              <span>{r.name}</span>
              <span className="text-muted">
                {r.avgDealt} <span className="opacity-60">({Math.round(r.pctOfSide * 100)}%)</span>
              </span>
            </div>
            <div className="h-1.5 bg-app rounded overflow-hidden">
              <div className="h-full bg-accent/70" style={{ width: `${(r.avgDealt / max) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// --------------------------------------------------------------- sweep table

// ------------------------------------------------------------- adventuring day

const REST_LABEL: Record<RestKind, string> = { none: "no rest", short: "short rest", long: "long rest" };

function DayEditor({
  options,
  day,
  onChange,
}: {
  options: MonsterOption[];
  day: SimSetup["day"];
  onChange: (d: SimSetup["day"]) => void;
}) {
  const encounters = day?.encounters ?? [];
  const rests = day?.rests ?? [];
  const [pick, setPick] = useState<Record<number, string>>({});

  const set = (encs: SimSetup["day"]) => onChange(encs);
  const addEncounter = () =>
    set({ encounters: [...encounters, []], rests: [...rests, encounters.length ? "short" : "none"] });
  const removeEncounter = (i: number) =>
    set({ encounters: encounters.filter((_, x) => x !== i), rests: rests.filter((_, x) => x !== i) });
  const addMonster = (i: number, id: string) => {
    if (!id) return;
    const next = encounters.map((enc, x) => {
      if (x !== i) return enc;
      const existing = enc.find((e) => e.id === id);
      return existing ? enc.map((e) => (e.id === id ? { ...e, count: e.count + 1 } : e)) : [...enc, { id, count: 1 }];
    });
    set({ encounters: next, rests });
  };
  const bumpMonster = (i: number, id: string, d: number) => {
    const next = encounters.map((enc, x) =>
      x !== i ? enc : enc.flatMap((e) => (e.id !== id ? [e] : e.count + d <= 0 ? [] : [{ ...e, count: e.count + d }])),
    );
    set({ encounters: next, rests });
  };
  const setRest = (i: number, r: RestKind) => set({ encounters, rests: rests.map((x, k) => (k === i ? r : x)) });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">The day</h2>
        <button className="text-xs text-accent hover:underline" onClick={addEncounter}>+ encounter</button>
      </div>
      {encounters.length === 0 && (
        <p className="text-xs text-muted">Add a few encounters to run in sequence.</p>
      )}
      <ol className="flex flex-col gap-2">
        {encounters.map((enc, i) => (
          <li key={i} className="bg-panel border border-border rounded p-3 flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted w-14">Fight {i + 1}</span>
              <select
                className="min-w-40 text-xs"
                value={pick[i] ?? ""}
                onChange={(e) => {
                  addMonster(i, e.target.value);
                  setPick((p) => ({ ...p, [i]: "" }));
                }}
              >
                <option value="">add a monster…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} — CR {o.cr}</option>
                ))}
              </select>
              <button className="text-xs text-muted hover:text-danger ml-auto" onClick={() => removeEncounter(i)}>remove</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {enc.length === 0 && <span className="text-xs text-muted">empty</span>}
              {enc.map((e) => (
                <span key={e.id} className="text-xs px-1.5 py-0.5 rounded bg-hover flex items-center gap-1">
                  {options.find((o) => o.id === e.id)?.name ?? e.id}
                  <button className="text-muted hover:text-normal" onClick={() => bumpMonster(i, e.id, -1)}>−</button>
                  <span className="tabular-nums">{e.count}</span>
                  <button className="text-muted hover:text-normal" onClick={() => bumpMonster(i, e.id, 1)}>+</button>
                </span>
              ))}
            </div>
            {i < encounters.length - 1 && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                then
                <select className="text-xs" value={rests[i] ?? "short"} onChange={(e) => setRest(i, e.target.value as RestKind)}>
                  {(["none", "short", "long"] as RestKind[]).map((r) => (
                    <option key={r} value={r}>{REST_LABEL[r]}</option>
                  ))}
                </select>
                before the next fight
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DayResults({ day }: { day: DayRun }) {
  const { mc } = day;
  const win = mc.dayWinRate;
  const tone = win >= 0.75 ? "text-positive" : win >= 0.4 ? "text-warning" : "text-danger";
  return (
    <section className="flex flex-col gap-4">
      <div className="bg-panel border border-border rounded p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className={`font-serif text-base ${tone}`}>
            Party survives the full day {pct(win)} of the time
          </span>
          <span className="text-xs text-muted">{mc.trials} days</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Encounters cleared" value={mc.encountersClearedAvg.toFixed(1)} sub={`of ${mc.perEncounter.length}`} big />
          <Stat label="Resources left" value={pct(mc.resourcesLeftPctAvg)} sub="slots & 1/day" big />
          <Stat
            label="The wall"
            value={mc.wallEncounter ? `Fight ${mc.wallEncounter}` : "—"}
            sub={mc.wallEncounter ? "first to slip" : "clears the day"}
            big
            tone={mc.wallEncounter ? "text-warning" : undefined}
          />
          <Stat label="Day win" value={pct(win)} big tone={win < 0.4 ? "text-danger" : undefined} />
        </div>
      </div>

      <div className="bg-panel border border-border rounded p-4">
        <table className="text-sm w-full">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              <th className="py-1">Fight</th>
              <th className="py-1 text-right">Win</th>
              <th className="py-1 text-right">HP after</th>
              <th className="py-1 text-right">Rounds</th>
              <th className="py-1 text-right">Reached</th>
            </tr>
          </thead>
          <tbody>
            {mc.perEncounter.map((e, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5">{i + 1}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(e.winRate)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(e.hpPctAfterAvg)}</td>
                <td className="py-1.5 text-right tabular-nums">{e.roundsAvg.toFixed(1)}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{pct(e.foughtRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SweepResults({ out }: { out: SweepOut }) {
  const label = SWEEP_DIMS.find((d) => d.id === out.dimension)!.label;
  return (
    <section className="bg-panel border border-border rounded p-4 flex flex-col gap-3">
      <span className="text-sm font-medium">
        {label} · win rate across {out.rows.length} points
      </span>
      <table className="text-sm w-full">
        <thead className="text-xs text-muted">
          <tr className="text-left">
            <th className="pb-1.5 font-medium">{label}</th>
            <th className="pb-1.5 font-medium w-1/2">Party win</th>
            <th className="pb-1.5 font-medium text-right">TPK</th>
            <th className="pb-1.5 font-medium text-right">Rounds</th>
            <th className="pb-1.5 font-medium text-right">HP on win</th>
          </tr>
        </thead>
        <tbody>
          {out.rows.map((r) => (
            <tr key={r.value} className={r.value === out.baselineValue ? "text-accent" : ""}>
              <td className="py-1 tabular-nums">
                {r.label}
                {r.value === out.baselineValue && <span className="text-xs text-muted"> · now</span>}
              </td>
              <td className="py-1 pr-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-app rounded overflow-hidden">
                    <div
                      className="h-full bg-accent/70"
                      style={{ width: `${Math.round(r.winRate * 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums w-9 text-right">{Math.round(r.winRate * 100)}%</span>
                </div>
              </td>
              <td className="py-1 text-right tabular-nums text-muted">{Math.round(r.tpkRate * 100)}%</td>
              <td className="py-1 text-right tabular-nums text-muted">{r.avgRounds}</td>
              <td className="py-1 text-right tabular-nums text-muted">{r.hpPctOnWin}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        Each row is a full {out.rows.length ? "Monte-Carlo" : ""} run — the highlighted row is the setup as it stands.
      </p>
    </section>
  );
}

// -------------------------------------------------------------------- bits

function Stat({
  label,
  value,
  sub,
  big,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className={`${big ? "text-lg" : "text-sm"} font-serif ${tone ?? ""}`}>{value}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <button
        className="w-6 h-6 rounded bg-hover hover:bg-active disabled:opacity-40 leading-none"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="decrease"
      >
        −
      </button>
      <span className="w-8 text-center tabular-nums">
        {value}
        {suffix}
      </span>
      <button
        className="w-6 h-6 rounded bg-hover hover:bg-active disabled:opacity-40 leading-none"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="increase"
      >
        +
      </button>
    </span>
  );
}

function LoadoutStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <Stepper value={value} min={0} max={3} onChange={onChange} />
    </span>
  );
}

/** Label + removable chips + an "add" dropdown, for feats / magic items. */
function PickList({
  label,
  options,
  chosen,
  onToggle,
}: {
  label: string;
  options: string[];
  chosen: string[];
  onToggle: (v: string) => void;
}) {
  const available = options.filter((o) => !chosen.includes(o));
  return (
    <div className="flex items-center gap-1.5 flex-wrap max-w-[26rem]">
      <span className="text-muted">{label}</span>
      {chosen.map((c) => (
        <button
          key={c}
          className="px-1.5 py-0.5 rounded bg-hover hover:bg-active text-normal flex items-center gap-1"
          onClick={() => onToggle(c)}
          title="remove"
        >
          {c} <span className="opacity-60">✕</span>
        </button>
      ))}
      {available.length > 0 && (
        <select
          className="text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value) onToggle(e.target.value);
          }}
        >
          <option value="">+ add</option>
          {available.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
