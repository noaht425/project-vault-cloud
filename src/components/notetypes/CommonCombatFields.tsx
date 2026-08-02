export function CommonCombatFields({
  ac,
  hp,
  maxHp,
  onChange,
}: {
  ac: number;
  hp: number;
  maxHp: number;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">AC</span>
        <input type="number" className="w-16" value={ac} onChange={(e) => onChange({ ac: Number(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">HP</span>
        <input type="number" className="w-16" value={hp} onChange={(e) => onChange({ hp: Number(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Max HP</span>
        <input
          type="number"
          className="w-16"
          value={maxHp}
          onChange={(e) => onChange({ maxHp: Number(e.target.value) })}
        />
      </label>
    </>
  );
}
