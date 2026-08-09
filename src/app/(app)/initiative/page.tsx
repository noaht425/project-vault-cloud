"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  sortedTurnOrder,
  advanceTurn,
  endEncounter,
  applyHpDelta,
  addCondition,
  removeCondition,
  removeCombatant,
  rollInitiativeFor,
  buildCombatants,
  defaultEncounter,
  parseEncounter,
  type Encounter,
  type Combatant,
  type NewCombatantInput,
} from "@/lib/initiative";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { AddCombatantPanel } from "@/components/initiative/AddCombatantPanel";
import { CombatantRow } from "@/components/initiative/CombatantRow";
import { Button } from "@/components/ui/Button";

const ENCOUNTER_KEY = "currentEncounter";

// Kept in browser localStorage, not synced to the workspace — same choice
// the Electron app made (one encounter as JSON in userData, not a note).
// Combat state is ephemeral session scratch, not campaign canon, so this
// doesn't need to follow the note/version-conflict machinery everything
// else in this app does; it does mean an encounter started on one device
// won't show up on another.
function loadEncounter(): Encounter {
  try {
    const raw = localStorage.getItem(ENCOUNTER_KEY);
    return raw ? parseEncounter(JSON.parse(raw)) : defaultEncounter();
  } catch {
    return defaultEncounter();
  }
}

export default function InitiativePage() {
  const router = useRouter();
  const [encounter, setEncounter] = useState<Encounter>(() =>
    typeof window === "undefined" ? defaultEncounter() : loadEncounter()
  );

  const persist = (next: Encounter): void => {
    setEncounter(next);
    try {
      localStorage.setItem(ENCOUNTER_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal — the update still shows for the rest of the session.
    }
  };

  const order = sortedTurnOrder(encounter.combatants);

  const updateCombatant = (id: string, updater: (c: Combatant) => Combatant): void => {
    persist({ ...encounter, combatants: encounter.combatants.map((c) => (c.id === id ? updater(c) : c)) });
  };

  const handleAdd = (input: NewCombatantInput): void => {
    persist({ ...encounter, combatants: [...encounter.combatants, ...buildCombatants(input)] });
  };

  const rollAll = (): void => {
    persist({ ...encounter, combatants: encounter.combatants.map((c) => ({ ...c, initiative: rollInitiativeFor(c) })) });
  };

  const openSource = async (combatant: Combatant): Promise<void> => {
    if (!combatant.sourceNoteTitle) return;
    const kind = combatant.isPc ? "pc" : "npc";
    const matches = await fetch(`/api/notes?type=${kind}&q=${encodeURIComponent(combatant.sourceNoteTitle)}`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    const id = resolveWikiLinkTitle(matches, combatant.sourceNoteTitle);
    if (id) router.push(`/notes/${id}`);
    else window.alert(`No note titled "${combatant.sourceNoteTitle}" yet.`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-2xl flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-serif">Initiative Tracker</h1>
        <span className="text-sm text-muted">Round {encounter.round}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={rollAll} disabled={encounter.combatants.length === 0}>
          Roll All Initiative
        </Button>
        <Button onClick={() => persist(advanceTurn(encounter))} disabled={encounter.combatants.length === 0}>
          Next Turn
        </Button>
        <Button
          variant="danger"
          disabled={encounter.combatants.length === 0}
          onClick={() => {
            if (window.confirm("End this encounter? NPCs/monsters are removed — PCs (and their HP) carry over.")) {
              persist(endEncounter(encounter));
            }
          }}
        >
          End Encounter
        </Button>
      </div>

      <AddCombatantPanel onAdd={handleAdd} />

      {order.length === 0 ? (
        <p className="text-sm text-muted">No combatants yet — add PCs/NPCs above to start tracking a fight.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {order.map((c) => (
            <CombatantRow
              key={c.id}
              combatant={c}
              active={c.id === encounter.activeCombatantId}
              onReroll={() => updateCombatant(c.id, (combatant) => ({ ...combatant, initiative: rollInitiativeFor(combatant) }))}
              onSetInitiative={(value) => updateCombatant(c.id, (combatant) => ({ ...combatant, initiative: value }))}
              onHpDelta={(delta) => updateCombatant(c.id, (combatant) => applyHpDelta(combatant, delta))}
              onAddCondition={(condition) => updateCombatant(c.id, (combatant) => addCondition(combatant, condition))}
              onRemoveCondition={(condition) => updateCombatant(c.id, (combatant) => removeCondition(combatant, condition))}
              onRemove={() => persist(removeCombatant(encounter, c.id))}
              onOpenSource={c.sourceNoteTitle ? () => void openSource(c) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
