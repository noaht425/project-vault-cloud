import { useEffect, useState } from "react";
import { npcFrontmatterSchema } from "@/lib/noteTypes/npc";
import { pcFrontmatterSchema } from "@/lib/noteTypes/pc";
import { abilityModifier } from "@/lib/noteTypes/creatureStats";
import type { NewCombatantInput } from "@/lib/initiative";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

const DEBOUNCE_MS = 200;

interface TitleMatch {
  id: string;
  name: string;
  kind: "pc" | "npc";
}

interface Preview {
  ac: number;
  maxHp: number;
  startingHp: number;
  initiativeBonus: number;
}

function formatBonus(bonus: number): string {
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}

// Adapted from the Electron app's AddCombatantPanel.tsx — searches
// /api/notes?type=pc|npc instead of window.vaultApi.searchTitles, reads the
// full note via GET /api/notes/[id] instead of an IPC call. Same two modes
// (from a PC/NPC note, or ad-hoc) and quantity shortcut.
export function AddCombatantPanel({ onAdd }: { onAdd: (input: NewCombatantInput) => void }) {
  const [mode, setMode] = useState<"note" | "adhoc">("note");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TitleMatch[]>([]);
  const [selected, setSelected] = useState<TitleMatch | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [count, setCount] = useState(1);

  const [adhocName, setAdhocName] = useState("");
  const [adhocAc, setAdhocAc] = useState(10);
  const [adhocHp, setAdhocHp] = useState(10);
  const [adhocBonus, setAdhocBonus] = useState(0);
  const [adhocIsPc, setAdhocIsPc] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    // No setState here for the empty case — rendering below already treats
    // an empty query as "no matches" via `visibleMatches`, so clearing
    // `matches` synchronously in the effect body isn't needed and would
    // trip react-hooks/set-state-in-effect (cascading-render risk), same
    // pitfall the search page's own fetch effect already avoids.
    if (!trimmed) return;
    const timer = setTimeout(() => {
      void Promise.all([
        fetch(`/api/notes?type=pc&q=${encodeURIComponent(trimmed)}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/notes?type=npc&q=${encodeURIComponent(trimmed)}`).then((r) => (r.ok ? r.json() : [])),
      ]).then(([pcs, npcs]: [{ id: string; name: string }[], { id: string; name: string }[]]) => {
        setMatches([
          ...pcs.map((m) => ({ ...m, kind: "pc" as const })),
          ...npcs.map((m) => ({ ...m, kind: "npc" as const })),
        ]);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const selectMatch = async (match: TitleMatch): Promise<void> => {
    setSelected(match);
    setMatches([]);
    setQuery(match.name);
    setPreview(null);
    setPreviewError(false);
    try {
      const res = await fetch(`/api/notes/${match.id}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const note = await res.json();
      const data = match.kind === "npc" ? npcFrontmatterSchema.parse(note.frontmatter) : pcFrontmatterSchema.parse(note.frontmatter);
      setPreview({
        ac: data.ac,
        maxHp: data.maxHp,
        startingHp: data.hp,
        initiativeBonus: abilityModifier(data.stats.dex),
      });
    } catch (err) {
      console.error("Failed to load combatant preview:", err);
      setPreviewError(true);
    }
  };

  const resetNoteForm = (): void => {
    setQuery("");
    setMatches([]);
    setSelected(null);
    setPreview(null);
    setCount(1);
  };

  const addFromNote = (): void => {
    if (!selected || !preview) return;
    onAdd({
      name: selected.name,
      sourceNoteTitle: selected.name,
      ac: preview.ac,
      maxHp: preview.maxHp,
      startingHp: preview.startingHp,
      initiativeBonus: preview.initiativeBonus,
      isPc: selected.kind === "pc",
      count,
    });
    resetNoteForm();
  };

  const addAdhoc = (): void => {
    if (!adhocName.trim()) return;
    onAdd({
      name: adhocName.trim(),
      sourceNoteTitle: null,
      ac: adhocAc,
      maxHp: adhocHp,
      initiativeBonus: adhocBonus,
      isPc: adhocIsPc,
      count,
    });
    setAdhocName("");
    setAdhocAc(10);
    setAdhocHp(10);
    setAdhocBonus(0);
    setAdhocIsPc(false);
    setCount(1);
  };

  return (
    <div className="flex flex-col gap-2 p-3 border border-border rounded-lg">
      <div className="flex gap-2">
        <Button variant={mode === "note" ? "primary" : "default"} className="flex-1" onClick={() => setMode("note")}>
          From PC/NPC note
        </Button>
        <Button variant={mode === "adhoc" ? "primary" : "default"} className="flex-1" onClick={() => setMode("adhoc")}>
          Ad-hoc
        </Button>
      </div>

      {mode === "note" ? (
        <div className="flex flex-col gap-2">
          <TextField
            label="Search PC/NPC notes"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setPreview(null);
            }}
          />
          {!selected && query.trim() && matches.length > 0 && (
            <div className="flex flex-col gap-1">
              {matches.map((m) => (
                <button
                  key={`${m.kind}-${m.id}`}
                  className="text-left p-2 rounded-lg hover:bg-hover border-0 bg-transparent text-sm"
                  onClick={() => void selectMatch(m)}
                >
                  {m.name} <span className="text-xs text-muted">{m.kind}</span>
                </button>
              ))}
            </div>
          )}
          {selected && previewError && <span className="text-sm text-danger">Couldn&apos;t load {selected.name}.</span>}
          {selected && preview && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted">
                AC {preview.ac} · HP {preview.startingHp}/{preview.maxHp} · Init {formatBonus(preview.initiativeBonus)}
              </span>
              <TextField
                label="Copies"
                type="number"
                min={1}
                className="w-16"
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
              />
              <Button variant="primary" onClick={addFromNote}>
                Add
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <TextField label="Name" value={adhocName} onChange={(e) => setAdhocName(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            <TextField label="AC" type="number" className="w-16" value={adhocAc} onChange={(e) => setAdhocAc(Number(e.target.value))} />
            <TextField label="HP" type="number" className="w-16" value={adhocHp} onChange={(e) => setAdhocHp(Number(e.target.value))} />
            <TextField
              label="Init bonus"
              type="number"
              className="w-16"
              value={adhocBonus}
              onChange={(e) => setAdhocBonus(Number(e.target.value))}
            />
            <TextField label="Copies" type="number" min={1} className="w-16" value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={adhocIsPc} onChange={(e) => setAdhocIsPc(e.target.checked)} />
            PC
          </label>
          <Button variant="primary" onClick={addAdhoc}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
