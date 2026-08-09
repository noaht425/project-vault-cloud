"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { defaultPcFrontmatter } from "@/lib/noteTypes/pc";
import { defaultNpcFrontmatter } from "@/lib/noteTypes/npc";
import { defaultLocationFrontmatter } from "@/lib/noteTypes/location";
import { defaultItemFrontmatter } from "@/lib/noteTypes/item";
import { defaultSessionFrontmatter } from "@/lib/noteTypes/session";
import { defaultEventFrontmatter } from "@/lib/noteTypes/event";
import { defaultFactionFrontmatter } from "@/lib/noteTypes/faction";
import { defaultClassReferenceFrontmatter } from "@/lib/noteTypes/classReference";
import { defaultClimateFrontmatter } from "@/lib/noteTypes/climate";
import { defaultLanguageFrontmatter } from "@/lib/noteTypes/language";
import { defaultCalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { defaultFamilyTreeFrontmatter } from "@/lib/noteTypes/familyTree";
import { defaultSettlementFrontmatter } from "@/lib/noteTypes/settlement";
import { defaultMapFrontmatter } from "@/lib/noteTypes/map";

type Kind = "note" | "folder" | null;
type NoteType =
  | "note"
  | "pc"
  | "npc"
  | "location"
  | "item"
  | "session"
  | "event"
  | "faction"
  | "class-reference"
  | "climate"
  | "language"
  | "calendar"
  | "family-tree"
  | "settlement"
  | "map";

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  note: "Plain note",
  pc: "PC",
  npc: "NPC",
  location: "Location",
  item: "Item",
  session: "Session",
  event: "Event",
  faction: "Faction",
  "class-reference": "Class Reference",
  climate: "Climate",
  language: "Language",
  calendar: "Calendar",
  "family-tree": "Family Tree",
  settlement: "Settlement",
  map: "Map",
};

// Only note types with a mobile form (see NoteTypeForm.tsx) are offered
// here — everything else stays creatable from Electron only, for now.
function defaultFrontmatterFor(noteType: NoteType): Record<string, unknown> {
  switch (noteType) {
    case "pc":
      return defaultPcFrontmatter();
    case "npc":
      return defaultNpcFrontmatter();
    case "location":
      return defaultLocationFrontmatter();
    case "item":
      return defaultItemFrontmatter();
    case "session":
      return defaultSessionFrontmatter();
    case "event":
      return defaultEventFrontmatter();
    case "faction":
      return defaultFactionFrontmatter();
    case "class-reference":
      return defaultClassReferenceFrontmatter();
    case "climate":
      return defaultClimateFrontmatter();
    case "language":
      return defaultLanguageFrontmatter();
    case "calendar":
      return defaultCalendarFrontmatter();
    case "family-tree":
      return defaultFamilyTreeFrontmatter();
    case "settlement":
      return defaultSettlementFrontmatter();
    case "map":
      return defaultMapFrontmatter();
    case "note":
      return { type: "note", tags: [] };
  }
}

export function NewItemSheet({
  folderId,
  open,
  onClose,
}: {
  folderId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { refresh } = useWorkspaceTree();
  const [kind, setKind] = useState<Kind>(null);
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = (): void => {
    onClose();
    setKind(null);
    setNoteType("note");
    setName("");
    setError(null);
  };

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!kind || !trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      if (kind === "folder") {
        const res = await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, parentId: folderId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not create folder");
        await refresh();
        close();
      } else {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, folderId, frontmatter: defaultFrontmatterFor(noteType), body: "" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not create note");
        await refresh();
        close();
        router.push(`/notes/${data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={close}>
      {!kind ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" onClick={() => setKind("note")}>
            New note
          </Button>
          <Button className="w-full" onClick={() => setKind("folder")}>
            New folder
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {kind === "note" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Type</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(NOTE_TYPE_LABELS) as NoteType[]).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={noteType === t ? "primary" : "default"}
                    className="flex-1 min-w-[85px]"
                    onClick={() => setNoteType(t)}
                  >
                    {NOTE_TYPE_LABELS[t]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <TextField
            label={kind === "note" ? "Note name" : "Folder name"}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setKind(null)}>
              Back
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
