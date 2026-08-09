"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addRelationshipEdge,
  checkRelationshipPlausibility,
  familyTreeFrontmatterSchema,
  parseRelationships,
  removeRelationshipEdge,
  RELATION_DISPLAY_PHRASE,
  RELATION_PHRASES,
  type RelationPhrase,
  type RelationshipEdge,
} from "@/lib/noteTypes/familyTree";
import { npcFrontmatterSchema } from "@/lib/noteTypes/npc";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { FamilyTreeDiagram } from "./FamilyTreeDiagram";

interface NoteSummary {
  id: string;
  name: string;
}

interface FullNote {
  id: string;
  frontmatter: Record<string, unknown>;
}

// Matches NoteEditor's own AUTOSAVE_DELAY_MS — no reason for the age lookup
// to outrun the point at which typing has actually settled.
const AGE_LOOKUP_DEBOUNCE_MS = 1500;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Adapted from the Electron app's FamilyTreeSheet.tsx. Person fields are
// plain text with no autocomplete — same "no autocomplete/Open button yet"
// precedent already set by LocationForm's climateNoteTitle and EventForm's
// location, since a name doesn't need a matching note to exist to appear in
// the diagram anyway. Unlike those, this form DOES write to the note body
// (the "## Relationships" bullets), so it needs onBodyChange in addition to
// the usual frontmatter-patch onChange.
export function FamilyTreeForm({
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
  const router = useRouter();
  const data = useMemo(() => familyTreeFrontmatterSchema.parse(frontmatter), [frontmatter]);
  const edges = useMemo(() => parseRelationships(body), [body]);
  const [ageByTitle, setAgeByTitle] = useState<Map<string, number>>(new Map());
  const [newA, setNewA] = useState("");
  const [newB, setNewB] = useState("");
  const [newPhrase, setNewPhrase] = useState<RelationPhrase>("parent of");

  const addRelationship = () => {
    const a = newA.trim();
    const b = newB.trim();
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) return;
    onBodyChange(addRelationshipEdge(body, a, newPhrase, b));
    setNewA("");
    setNewB("");
  };

  const removeRelationship = (edge: RelationshipEdge) => onBodyChange(removeRelationshipEdge(body, edge));

  const openPerson = async (name: string) => {
    const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(name)}`).catch(() => []);
    const id = resolveWikiLinkTitle(matches, name);
    if (id) router.push(`/notes/${id}`);
  };

  // Ages live on real npc notes (npcFrontmatterSchema's optional `age`
  // field), not on this family-tree note itself. A name with no matching
  // npc note (a PC, or no note at all yet) just never gets an entry, and
  // checkRelationshipPlausibility silently skips any pair missing an age —
  // same "harmless when data's missing" pattern as everywhere else.
  useEffect(() => {
    // No early setState([]) when names is empty — checkRelationshipPlausibility
    // loops over `edges` itself, and names is derived from edges, so an
    // empty names list already means edges is empty and warnings will be []
    // regardless of whatever's left in ageByTitle. Skipping the reset avoids
    // a synchronous setState in the effect body (react-hooks/set-state-in-effect).
    const names = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
    if (names.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all(
        names.map(async (name): Promise<readonly [string, number] | null> => {
          const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(name)}&type=npc`).catch(() => []);
          const id = resolveWikiLinkTitle(matches, name);
          if (!id) return null;
          const note = await fetchJson<FullNote>(`/api/notes/${id}`).catch(() => null);
          if (!note) return null;
          const age = npcFrontmatterSchema.parse(note.frontmatter).age;
          return age === null ? null : ([name, age] as const);
        })
      ).then((results) => {
        if (cancelled) return;
        setAgeByTitle(new Map(results.filter((r): r is readonly [string, number] => r !== null)));
      });
    }, AGE_LOOKUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [edges]);

  const warnings = useMemo(() => checkRelationshipPlausibility(edges, ageByTitle), [edges, ageByTitle]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border">
      <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />

      {edges.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Relationships</span>
          {edges.map((edge, i) => (
            <div key={`${edge.relation}-${edge.a}-${edge.b}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 text-sm">
                {edge.a} <span className="text-muted">{RELATION_DISPLAY_PHRASE[edge.relation]}</span> {edge.b}
              </span>
              <button
                className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1"
                onClick={() => removeRelationship(edge)}
                aria-label={`Remove ${edge.a} ${RELATION_DISPLAY_PHRASE[edge.relation]} ${edge.b}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <TextField label="Person" placeholder="e.g. Alice" className="w-32" value={newA} onChange={(e) => setNewA(e.target.value)} />
        <SelectField label="Relation" className="w-40" value={newPhrase} onChange={(e) => setNewPhrase(e.target.value as RelationPhrase)}>
          {RELATION_PHRASES.map((phrase) => (
            <option key={phrase} value={phrase}>
              {phrase}
            </option>
          ))}
        </SelectField>
        <TextField label="Person" placeholder="e.g. Bob" className="w-32" value={newB} onChange={(e) => setNewB(e.target.value)} />
        <Button variant="primary" onClick={addRelationship} disabled={!newA.trim() || !newB.trim()}>
          + Add relationship
        </Button>
      </div>
      <p className="text-sm text-muted">
        Either person can be typed fresh — a name doesn&apos;t need a note yet to appear in the diagram. Family/
        marriage ties (parent/child/spouse/sibling) render solid; social ties (friend/rival/enemy/romantic partner)
        render dotted, in their own color. You can also hand-edit the &quot;## Relationships&quot; section in the raw
        body below instead of using these controls.
      </p>

      <FamilyTreeDiagram body={body} onOpenPerson={(name) => void openPerson(name)} />

      {warnings.length > 0 && (
        <div>
          <p className="text-sm text-muted">Worth double-checking (set each person&apos;s Age on their npc note to enable this):</p>
          <ul className="text-sm text-muted my-1 pl-4.5">
            {warnings.map((w) => (
              <li key={`${w.relation}-${w.a}-${w.b}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
