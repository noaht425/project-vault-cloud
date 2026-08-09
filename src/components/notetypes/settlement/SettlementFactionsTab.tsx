import type { SettlementFrontmatter } from "@/lib/noteTypes/settlement";

// Adapted from the Electron app's SettlementFactionsTab.tsx — read-only view
// of the last Generate's factions output. No pagination/sorting like People/
// Buildings need: factions are inherently few (bounded by FACTION_NAME_POOL
// plus however many custom ones exist), never thousands.
export function SettlementFactionsTab({ data }: { data: SettlementFrontmatter }) {
  if (data.factions.length === 0) {
    return <p className="text-sm text-muted">No factions yet — configure custom/random factions in the Setup tab, then Generate.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {data.factions.map((f) => (
        <div key={f.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
          <span className="font-medium">{f.name}</span>
          <span className="text-sm text-muted">
            {f.memberCount.toLocaleString()} / {f.maxMembers.toLocaleString()} members
          </span>
        </div>
      ))}
    </div>
  );
}
