import { useMemo } from "react";
import { classReferenceFrontmatterSchema } from "@/lib/noteTypes/classReference";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's ClassReferenceSheet.tsx — ports directly,
// the "## Level N" body convention this note type relies on already works
// with the plain body textarea, no special editor needed.
export function ClassReferenceForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => classReferenceFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-3xl md:mx-auto md:w-full">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Class" value={data.class} onChange={(e) => onChange({ class: e.target.value })} />
        <TextField label="Subclass" value={data.subclass} onChange={(e) => onChange({ subclass: e.target.value })} />
      </div>
      <p className="text-sm text-muted">
        Add a &quot;## Level N&quot; heading in the body below for each level, and put that level&apos;s features
        underneath it. Any PC whose Class Reference field matches this note&apos;s title exactly (not case sensitive)
        will show those levels, filtered down to their own current level.
      </p>
    </div>
  );
}
