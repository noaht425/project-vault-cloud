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
import { FamilyTreeForm } from "./FamilyTreeForm";

// Mirrors the Electron app's SheetView.tsx dispatcher — every unported type
// (including plain "note") falls through to null and NoteEditor just shows
// the plain body editor, exactly as it did before this form existed. No
// regression for unported types. `body` is used by LanguageForm (its
// dictionary/grammar panels read body text) and FamilyTreeForm (parses the
// "## Relationships" section) — every other form ignores it. `onBodyChange`
// is only used by FamilyTreeForm, the one form that writes to the body
// (relationship bullets) rather than just frontmatter.
export function NoteTypeForm({
  frontmatter,
  body,
  onChange,
  onBodyChange,
}: {
  frontmatter: Record<string, unknown>;
  body: string;
  onChange: (patch: Record<string, unknown>) => void;
  onBodyChange: (body: string) => void;
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
    case "family-tree":
      return <FamilyTreeForm frontmatter={frontmatter} body={body} onChange={onChange} onBodyChange={onBodyChange} />;
    default:
      return null;
  }
}
