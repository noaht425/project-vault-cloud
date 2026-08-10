import { useMemo } from "react";
import { pcFrontmatterSchema } from "@/lib/noteTypes/pc";
import type { AbilityKey } from "@/lib/noteTypes/creatureStats";
import { AbilityScoreGrid } from "./AbilityScoreGrid";
import { CommonCombatFields } from "./CommonCombatFields";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's PcSheet.tsx. classRef is kept as a plain
// text field for parity with notes created there, but the linked
// class-reference lookup (datalist autocomplete, "Open" button,
// level-gated ClassFeaturesPanel) isn't ported — class-reference notes
// don't have a mobile form of their own yet either.
export function PcForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  // Same memoization PcSheet.tsx already has — without it, editing the
  // note's unrelated body text re-parses/re-validates frontmatter on every
  // keystroke since NoteEditor re-renders this on every draft change.
  const data = useMemo(() => pcFrontmatterSchema.parse(frontmatter), [frontmatter]);

  const updateStat = (key: AbilityKey, value: number): void => {
    onChange({ stats: { ...data.stats, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-3xl md:mx-auto md:w-full">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Class" value={data.class} onChange={(e) => onChange({ class: e.target.value })} />
        <TextField label="Subclass" value={data.subclass} onChange={(e) => onChange({ subclass: e.target.value })} />
        <TextField
          label="Level"
          type="number"
          value={data.level}
          onChange={(e) => onChange({ level: Number(e.target.value) })}
        />
        <TextField label="Race" value={data.race} onChange={(e) => onChange({ race: e.target.value })} />
      </div>
      <TextField
        label="Class reference"
        placeholder="e.g. Fighter — Champion"
        value={data.classRef}
        onChange={(e) => onChange({ classRef: e.target.value })}
      />
      <div className="flex gap-3">
        <CommonCombatFields ac={data.ac} hp={data.hp} maxHp={data.maxHp} onChange={onChange} />
      </div>
      <AbilityScoreGrid stats={data.stats} onChange={updateStat} />
    </div>
  );
}
