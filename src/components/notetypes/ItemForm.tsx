import { useMemo } from "react";
import { itemFrontmatterSchema } from "@/lib/noteTypes/item";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's ItemSheet.tsx — one field, ports directly.
export function ItemForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => itemFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border">
      <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />
    </div>
  );
}
