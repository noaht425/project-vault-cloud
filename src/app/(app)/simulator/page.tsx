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
import { runSimAsync, runSweepAsync, runBattleAsync } from "@/lib/sim/runner";
import type { BattleRun, UnitSnap } from "@/lib/sim/ui";

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

type Mode = "single" | "sweep" | "battle";

export default function SimulatorPage() {
  const [setup, setSetup] = useState<SimSetup>(() =>
    typeof window === "undefined" ? defaultSetup() : loadSetup(),
  );
  const [mode, setMode] = useState<Mode>("single");
  const [result, setResult] = useState<SimResult | null>(null);
  const [sweep, setSweep] = useState<SweepOut | null>(null);
  const [battle, setBattle] = useState<BattleRun | null>(null);
  const [sweepDim, setSweepDim] = useState<SweepDim>("level");
  const [running, setRunning] = useState(false);
  const [battleNonce, setBattleNonce] = useState(0);
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
        setBattle(null);
      } else if (mode === "sweep") {
        setSweep(await runSweepAsync(setup, sweepDim));
        setResult(null);
        setBattle(null);
      } else {
        setBattle(await runBattleAsync(setup, setup.seed));
        setBattleNonce((n) => n + 1);
        setResult(null);
        setSweep(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
      setSweep(null);
      setBattle(null);
    } finally {
      setRunning(false);
    }
  }, [setup, running, mode, sweepDim]);

  const busy = running || setup.enemies.length === 0 || setup.party.length === 0;

  return (
    <div className="p-4 sm:p-6 max-w-3xl w-full flex flex-col gap-5">
      <header className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-lg font-serif">Fight Simulator</h1>
        <span className="text-sm text-muted">
          Monte-Carlo a party against a stat block — win rate, TPK risk, where it breaks
        </span>
      </header>

      <EnemyEditor
        options={options}
        enemies={setup.enemies}
        onChange={(enemies) => persist({ ...setup, enemies })}
        customMonsters={setup.customMonsters}
        onCustomChange={(customMonsters) => persist({ ...setup, customMonsters })}
      />

      <PartyEditor party={setup.party} onChange={(party) => persist({ ...setup, party })} />

      <section className="flex flex-col gap-3">
        <div className="inline-flex self-start rounded border border-border overflow-hidden text-sm">
          {(["single", "sweep", "battle"] as Mode[]).map((m) => (
            <button
              key={m}
              className={`px-3 py-1.5 ${mode === m ? "bg-active text-normal" : "bg-panel text-muted hover:bg-hover"}`}
              onClick={() => setMode(m)}
            >
              {m === "single" ? "Single fight" : m === "sweep" ? "What-if sweep" : "Battle map"}
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
            {running ? "Running…" : mode === "single" ? "Run simulation" : mode === "sweep" ? "Run sweep" : "Run battle"}
          </Button>
        </div>
        {mode === "sweep" && (
          <p className="text-xs text-muted">
            {SWEEP_DIMS.find((d) => d.id === sweepDim)!.values.map((v) => SWEEP_DIMS.find((d) => d.id === sweepDim)!.fmt(v)).join(" · ")}
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm text-danger border border-danger/40 rounded px-3 py-2">{error}</p>
      )}

      {result && !running && mode === "single" && (
        <Results result={result} showLog={showLog} onToggleLog={() => setShowLog((v) => !v)} />
      )}
      {sweep && !running && mode === "sweep" && <SweepResults out={sweep} />}
      {battle && !running && mode === "battle" && <BattleMap key={battleNonce} run={battle} />}
      {mode === "battle" && !battle && !running && (
        <p className="text-xs text-muted">
          A single fight on a 5-ft grid — watch the AI move, take cover, and trade blows turn by turn. Diagonals use the PHB 5-10-5 rule.
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

function BattleMap({ run }: { run: BattleRun }) {
  const frames = run.frames;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(450);
  const logRef = useRef<HTMLDivElement>(null);
  const atEnd = idx >= frames.length - 1;

  useEffect(() => {
    if (!playing || atEnd) return;
    const t = setTimeout(() => setIdx((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, idx, speed, atEnd]);

  const togglePlay = () => {
    if (atEnd) {
      setIdx(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  const frame = frames[Math.min(idx, frames.length - 1)];
  const dims = frames[0].terrain!;
  const terrain = dims.tiles;

  // unit occupying (x,y) in this frame
  const unitAt = useMemo(() => {
    const m = new Map<string, UnitSnap>();
    for (const u of frame.units) {
      if (!u.alive) continue;
      for (let dy = 0; dy < u.fp; dy++) for (let dx = 0; dx < u.fp; dx++) m.set(`${u.x + dx},${u.y + dy}`, u);
    }
    return m;
  }, [frame]);
  const templateSet = useMemo(() => new Set(frame.templateCells ?? []), [frame]);
  const pathSet = useMemo(
    () => new Set((frame.path ?? []).slice(0, -1).map(([x, y]) => `${x},${y}`)),
    [frame],
  );

  const logLines = useMemo(
    () => frames.slice(0, idx + 1).filter((f) => f.text).map((f) => ({ seq: f.seq, round: f.round, text: f.text! })),
    [frames, idx],
  );
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLines.length]);

  const roster = [...frame.units].sort((a, b) => (a.side === b.side ? a.glyph.localeCompare(b.glyph) : a.side === "party" ? -1 : 1));

  return (
    <section className="flex flex-col gap-3">
      {/* transport */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <div className="inline-flex rounded border border-border overflow-hidden">
          <TBtn onClick={() => { setPlaying(false); setIdx(0); }} label="⏮" />
          <TBtn onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} label="◀" />
          <TBtn onClick={togglePlay} label={playing && !atEnd ? "⏸" : "▶"} wide />
          <TBtn onClick={() => { setPlaying(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }} label="▶▶" />
          <TBtn onClick={() => { setPlaying(false); setIdx(frames.length - 1); }} label="⏭" />
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
          max={frames.length - 1}
          value={idx}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
          className="flex-1 min-w-40"
        />
        <span className="text-xs text-muted tabular-nums whitespace-nowrap">
          R{frame.round} · {idx + 1}/{frames.length}
        </span>
      </div>

      <p className="text-xs text-muted min-h-4">
        <span className="uppercase tracking-wide">{frame.kind}</span>
        {frame.text ? ` — ${frame.text}` : ""}
      </p>

      <div className="flex gap-4 flex-wrap items-start">
        {/* the board */}
        <div className="overflow-x-auto">
          <div
            className="inline-grid font-mono leading-none select-none bg-panel border border-border rounded p-2"
            style={{ gridTemplateColumns: `repeat(${dims.width}, 1ch)`, fontSize: "13px" }}
          >
            {Array.from({ length: dims.width * dims.height }, (_, i) => {
              const x = i % dims.width;
              const y = Math.floor(i / dims.width);
              const key = `${x},${y}`;
              const u = unitAt.get(key);
              const t = terrain[i] ?? ".";
              const inTemplate = templateSet.has(key);
              const onPath = pathSet.has(key);
              let ch = t === "." ? "·" : t;
              let cls = TERRAIN_CLASS[t] ?? "text-muted/25";
              if (u) {
                ch = u.glyph;
                cls =
                  u.side === "party"
                    ? "text-accent font-semibold"
                    : "text-danger font-semibold";
                if (u.downed) cls = "text-muted/50";
              } else if (onPath) {
                ch = "•";
                cls = "text-accent/40";
              }
              return (
                <span
                  key={i}
                  className={`text-center ${cls} ${u?.isActor ? "bg-accent/20 rounded-sm" : inTemplate ? "bg-warning/20" : ""}`}
                  style={{ height: "1.15em" }}
                  title={u ? `${u.name} — ${u.hp}/${u.maxHp}${u.conditions.length ? " [" + u.conditions.join(",") + "]" : ""}` : undefined}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        </div>

        {/* roster + log */}
        <div className="flex flex-col gap-3 min-w-52 flex-1">
          <ul className="flex flex-col gap-1 text-xs">
            {roster.map((u) => (
              <li key={u.id} className={`flex items-center gap-2 ${!u.alive ? "opacity-40 line-through" : u.downed ? "opacity-60" : ""} ${u.isActor ? "font-semibold" : ""}`}>
                <span className={`w-4 text-center font-mono ${u.side === "party" ? "text-accent" : "text-danger"}`}>{u.glyph}</span>
                <span className="flex-1 truncate">{u.name}</span>
                <span className="w-14 h-1.5 rounded bg-hover overflow-hidden">
                  <span
                    className={`block h-full ${u.side === "party" ? "bg-accent" : "bg-danger"}`}
                    style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%` }}
                  />
                </span>
                <span className="tabular-nums text-muted w-14 text-right">{u.hp}/{u.maxHp}</span>
                {u.conditions.length > 0 && <span className="text-warning">{u.conditions.join(",")}</span>}
              </li>
            ))}
          </ul>
          <div ref={logRef} className="text-xs text-muted bg-panel border border-border rounded p-2 max-h-40 overflow-y-auto flex flex-col gap-0.5">
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
