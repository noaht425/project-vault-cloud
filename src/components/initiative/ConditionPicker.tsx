import { useState } from "react";
import { DEFAULT_CONDITIONS } from "@/lib/conditions";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

// Adapted from the Electron app's ConditionPicker.tsx — a BottomSheet
// instead of a hover popover, same touch-appropriate swap as DiceRoller.
export function ConditionPicker({ onAdd }: { onAdd: (condition: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        + Condition
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
          {DEFAULT_CONDITIONS.map((c) => (
            <button
              key={c.name}
              type="button"
              className="text-left p-2 rounded-lg hover:bg-hover border-0 bg-transparent"
              onClick={() => {
                onAdd(c.name);
                setOpen(false);
              }}
            >
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted">{c.description}</div>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
