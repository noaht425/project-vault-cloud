import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseWordEntries } from "@/lib/noteTypes/language";

// Adapted from the Electron app's WordDictionaryPanel.tsx — the drag-to-
// resize handle is dropped (a mouse-only interaction) in favor of a fixed
// max-height scrollable list, more appropriate for touch.
export function WordDictionaryPanel({ body }: { body: string }) {
  const entries = parseWordEntries(body);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted">
        Dictionary ({entries.length} word{entries.length === 1 ? "" : "s"})
      </h3>
      <div className="flex flex-col gap-3 max-h-60 overflow-y-auto">
        {entries.map((entry) => (
          <div key={entry.word} className="border-t border-border pt-2">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{entry.word}</span>
              {entry.partOfSpeech && <span className="text-xs text-muted italic">{entry.partOfSpeech}</span>}
              {entry.gender && <span className="text-xs text-muted italic">{entry.gender}</span>}
            </div>
            {entry.meaning && <div className="text-sm text-muted">{entry.meaning}</div>}
            {entry.content && (
              <div className="prose-note text-sm mt-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
