import { npcFrontmatterSchema } from "@/lib/noteTypes/npc";
import type { AbilityKey } from "@/lib/noteTypes/creatureStats";
import { AbilityScoreGrid } from "./AbilityScoreGrid";
import { CommonCombatFields } from "./CommonCombatFields";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's NpcSheet.tsx — no linked-note lookups at
// all there, so this ports directly with no scope cut.
export function NpcForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = npcFrontmatterSchema.parse(frontmatter);

  const updateStat = (key: AbilityKey, value: number): void => {
    onChange({ stats: { ...data.stats, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border">
      <div className="grid grid-cols-3 gap-3">
        <TextField label="Role" value={data.role} onChange={(e) => onChange({ role: e.target.value })} />
        <TextField label="CR" value={data.cr} onChange={(e) => onChange({ cr: e.target.value })} />
        {/* Blank means "unknown," not 0 — see npc.ts's own comment. Empty
            string in the input maps back to null, not 0, on change. */}
        <TextField
          label="Age"
          type="number"
          placeholder="unknown"
          value={data.age ?? ""}
          onChange={(e) => onChange({ age: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>
      <div className="flex gap-3">
        <CommonCombatFields ac={data.ac} hp={data.hp} maxHp={data.maxHp} onChange={onChange} />
      </div>
      <AbilityScoreGrid stats={data.stats} onChange={updateStat} />
    </div>
  );
}
