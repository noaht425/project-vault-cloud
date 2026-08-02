import { ABILITY_KEYS, formatModifier, type AbilityKey, type AbilityScores } from "@/lib/noteTypes/creatureStats";

const LABELS: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

// 3 columns on narrow phones (2 rows of 3), a single row of 6 from sm: up —
// the Electron sheet's own .ability-grid is a single flex row, but 6 boxes
// in one row is tight on a 375px viewport with real touch-sized inputs.
export function AbilityScoreGrid({
  stats,
  onChange,
}: {
  stats: AbilityScores;
  onChange: (key: AbilityKey, value: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {ABILITY_KEYS.map((key) => (
        <label key={key} className="flex flex-col items-center gap-1 bg-panel border border-border rounded-lg py-2">
          <span className="text-xs text-muted">{LABELS[key]}</span>
          <input
            type="number"
            className="w-12 text-center bg-transparent border-0 p-0 text-base"
            value={stats[key]}
            onChange={(e) => onChange(key, Number(e.target.value))}
          />
          <span className="text-xs text-muted">{formatModifier(stats[key])}</span>
        </label>
      ))}
    </div>
  );
}
