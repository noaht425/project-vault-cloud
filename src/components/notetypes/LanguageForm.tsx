import { useMemo } from "react";
import { languageFrontmatterSchema } from "@/lib/noteTypes/language";
import { TextField } from "@/components/ui/TextField";
import { WordDictionaryPanel } from "./WordDictionaryPanel";
import { GrammarRulesPanel } from "./GrammarRulesPanel";

// Adapted from the Electron app's LanguageSheet.tsx. The declension/
// conjugation calculator (DeclensionCalculatorPanel, ~350 lines on desktop)
// is deliberately not ported in this pass — it's a large enough interactive
// tool to warrant its own dedicated pass rather than being folded into this
// one. Dictionary and grammar-rule panels port directly since they're just
// read-only renderers over body text that's already fully editable via the
// plain body textarea, same "## Word:"/"## Grammar:" convention as desktop.
export function LanguageForm({
  frontmatter,
  body,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  body: string;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => languageFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-3xl md:mx-auto md:w-full">
      <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />
      <p className="text-sm text-muted">
        Add a &quot;## Word: word&quot; heading in the body below for each dictionary entry (optional
        &quot;Meaning:&quot;, &quot;POS:&quot;, &quot;Gender:&quot; lines underneath). Add a &quot;## Grammar:
        name&quot; heading for each named grammar rule.
      </p>
      <WordDictionaryPanel body={body} />
      <GrammarRulesPanel body={body} />
    </div>
  );
}
