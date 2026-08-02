import { PcForm } from "./PcForm";
import { NpcForm } from "./NpcForm";

// Mirrors the Electron app's SheetView.tsx dispatcher — currently only pc/
// npc are ported, so every other type (including plain "note") falls
// through to null and NoteEditor just shows the plain body editor, exactly
// as it did before this form existed. No regression for unported types.
export function NoteTypeForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const type = typeof frontmatter.type === "string" ? frontmatter.type : undefined;

  switch (type) {
    case "pc":
      return <PcForm frontmatter={frontmatter} onChange={onChange} />;
    case "npc":
      return <NpcForm frontmatter={frontmatter} onChange={onChange} />;
    default:
      return null;
  }
}
