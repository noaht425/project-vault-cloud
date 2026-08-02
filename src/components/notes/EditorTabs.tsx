import { Button } from "@/components/ui/Button";

export type EditorMode = "edit" | "preview";

export function EditorTabs({ mode, onChange }: { mode: EditorMode; onChange: (mode: EditorMode) => void }) {
  return (
    <div className="flex gap-2 px-4 py-2 border-b border-border">
      <Button variant={mode === "edit" ? "primary" : "ghost"} onClick={() => onChange("edit")}>
        Edit
      </Button>
      <Button variant={mode === "preview" ? "primary" : "ghost"} onClick={() => onChange("preview")}>
        Preview
      </Button>
    </div>
  );
}
