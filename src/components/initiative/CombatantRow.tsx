import { useState } from "react";
import type { Combatant } from "@/lib/initiative";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { ConditionPicker } from "./ConditionPicker";
import { Button } from "@/components/ui/Button";

function conditionDescription(name: string): string | undefined {
  return DEFAULT_CONDITIONS.find((c) => c.name === name)?.description;
}

function HpDeltaControl({ onApply }: { onApply: (delta: number) => void }) {
  const [value, setValue] = useState("");

  const submit = (sign: 1 | -1): void => {
    const n = Number(value);
    if (!value.trim() || Number.isNaN(n) || n <= 0) return;
    onApply(sign * n);
    setValue("");
  };

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(-1);
      }}
    >
      <input
        type="number"
        min={0}
        placeholder="amt"
        className="w-16"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" variant="ghost" className="text-xs" title="Apply damage">
        − Dmg
      </Button>
      <Button type="button" variant="ghost" className="text-xs" title="Apply healing" onClick={() => submit(1)}>
        + Heal
      </Button>
    </form>
  );
}

function ConditionInput({ onAdd }: { onAdd: (condition: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <form
      className="flex-1 min-w-[100px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onAdd(value);
          setValue("");
        }
      }}
    >
      <input placeholder="+ custom condition" className="w-full" value={value} onChange={(e) => setValue(e.target.value)} />
    </form>
  );
}

export function CombatantRow({
  combatant,
  active,
  onReroll,
  onSetInitiative,
  onHpDelta,
  onAddCondition,
  onRemoveCondition,
  onRemove,
  onOpenSource,
}: {
  combatant: Combatant;
  active: boolean;
  onReroll: () => void;
  onSetInitiative: (value: number | null) => void;
  onHpDelta: (delta: number) => void;
  onAddCondition: (condition: string) => void;
  onRemoveCondition: (condition: string) => void;
  onRemove: () => void;
  onOpenSource?: () => void;
}) {
  return (
    <div className={`flex flex-col gap-2 p-3 border rounded-lg ${active ? "border-accent" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            className="w-14"
            placeholder="–"
            value={combatant.initiative ?? ""}
            onChange={(e) => onSetInitiative(e.target.value === "" ? null : Number(e.target.value))}
          />
          <Button variant="ghost" className="text-xs" onClick={onReroll} title="Reroll initiative">
            🎲
          </Button>
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="font-medium truncate">{combatant.name}</span>
          {combatant.isPc && <span className="text-xs text-accent shrink-0">PC</span>}
          {onOpenSource && (
            <button
              className="text-xs text-accent underline bg-transparent border-0 p-0 cursor-pointer shrink-0"
              onClick={onOpenSource}
            >
              Open ↗
            </button>
          )}
        </div>
        <Button variant="ghost" className="text-xs shrink-0" onClick={onRemove} title="Remove combatant">
          ✕
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-muted">
          {combatant.currentHp} / {combatant.maxHp} HP · AC {combatant.ac}
        </span>
        <HpDeltaControl onApply={onHpDelta} />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {combatant.conditions.map((cond) => (
          <span
            key={cond}
            className="text-xs bg-hover rounded-full px-2 py-0.5 flex items-center gap-1"
            title={conditionDescription(cond)}
          >
            {cond}
            <button className="bg-transparent border-0 p-0 cursor-pointer" onClick={() => onRemoveCondition(cond)}>
              ×
            </button>
          </span>
        ))}
        <ConditionPicker onAdd={onAddCondition} />
        <ConditionInput onAdd={onAddCondition} />
      </div>
    </div>
  );
}
