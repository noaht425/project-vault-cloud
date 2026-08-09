import { useMemo } from "react";
import { sessionFrontmatterSchema } from "@/lib/noteTypes/session";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's SessionSheet.tsx — ports directly, no cuts.
export function SessionForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => sessionFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Date" type="date" value={data.date} onChange={(e) => onChange({ date: e.target.value })} />
        <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />
      </div>
      <p className="text-sm text-muted">
        Link NPCs and locations with [[wiki-links]] in the body below — they&apos;ll show up on those notes&apos;
        Backlinks panel automatically.
      </p>
    </div>
  );
}
