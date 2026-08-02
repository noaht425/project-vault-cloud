import { Button } from "@/components/ui/Button";

export interface ConflictNote {
  id: string;
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
  version: number;
}

// On a 409, something else changed this note since we last read it (another
// device, another tab, a future collaborator). Mirrors the Electron Cloud
// editor's conflict UI exactly: never auto-resolve, always make the user
// pick which version wins.
export function ConflictBanner({
  current,
  onKeepMine,
  onDiscardMine,
}: {
  current: ConflictNote;
  onKeepMine: () => void;
  onDiscardMine: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 border-b border-warning bg-warning/10">
      <p className="text-sm">
        This note changed elsewhere while you were editing (now at version {current.version}). Your unsaved
        changes are still here below — choose how to resolve it.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onKeepMine}>
          Save my version anyway
        </Button>
        <Button variant="ghost" onClick={onDiscardMine}>
          Discard my edit, load latest
        </Button>
      </div>
    </div>
  );
}
