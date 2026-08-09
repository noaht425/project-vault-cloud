import { PcForm } from "./PcForm";
import { NpcForm } from "./NpcForm";
import { LocationForm } from "./LocationForm";
import { ItemForm } from "./ItemForm";
import { SessionForm } from "./SessionForm";
import { EventForm } from "./EventForm";
import { FactionForm } from "./FactionForm";
import { ClassReferenceForm } from "./ClassReferenceForm";
import { ClimateForm } from "./ClimateForm";
import { LanguageForm } from "./LanguageForm";
import { CalendarForm } from "./CalendarForm";

// Mirrors the Electron app's SheetView.tsx dispatcher — every unported type
// (including plain "note") falls through to null and NoteEditor just shows
// the plain body editor, exactly as it did before this form existed. No
// regression for unported types. `body` is only used by LanguageForm (its
// dictionary/grammar panels read body text) — every other form ignores it.
export function NoteTypeForm({
  frontmatter,
  body,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  body: string;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const type = typeof frontmatter.type === "string" ? frontmatter.type : undefined;

  switch (type) {
    case "pc":
      return <PcForm frontmatter={frontmatter} onChange={onChange} />;
    case "npc":
      return <NpcForm frontmatter={frontmatter} onChange={onChange} />;
    case "location":
      return <LocationForm frontmatter={frontmatter} onChange={onChange} />;
    case "item":
      return <ItemForm frontmatter={frontmatter} onChange={onChange} />;
    case "session":
      return <SessionForm frontmatter={frontmatter} onChange={onChange} />;
    case "event":
      return <EventForm frontmatter={frontmatter} onChange={onChange} />;
    case "faction":
      return <FactionForm frontmatter={frontmatter} onChange={onChange} />;
    case "class-reference":
      return <ClassReferenceForm frontmatter={frontmatter} onChange={onChange} />;
    case "climate":
      return <ClimateForm frontmatter={frontmatter} onChange={onChange} />;
    case "language":
      return <LanguageForm frontmatter={frontmatter} body={body} onChange={onChange} />;
    case "calendar":
      return <CalendarForm frontmatter={frontmatter} onChange={onChange} />;
    default:
      return null;
  }
}
