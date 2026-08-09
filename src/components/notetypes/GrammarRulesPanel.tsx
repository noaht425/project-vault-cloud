import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseGrammarRules } from "@/lib/noteTypes/language";

// Adapted from the Electron app's GrammarRulesPanel.tsx — ports directly.
export function GrammarRulesPanel({ body }: { body: string }) {
  const rules = parseGrammarRules(body);
  if (rules.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted">
        Grammar ({rules.length} rule{rules.length === 1 ? "" : "s"})
      </h3>
      {rules.map((rule) => (
        <div key={rule.name} className="border-t border-border pt-2">
          <div className="font-medium">{rule.name}</div>
          {rule.content && (
            <div className="prose-note text-sm mt-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{rule.content}</ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
