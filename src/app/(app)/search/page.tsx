"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseSnippet } from "@/lib/searchSnippet";
import { TextField } from "@/components/ui/TextField";

const SEARCH_DEBOUNCE_MS = 300;

interface SearchResult {
  id: string;
  name: string;
  noteType: string;
  snippet: string | null;
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    // setLoading(true) happens inside the timeout callback (a genuine async
    // boundary), not synchronously in the effect body — the latter trips
    // react-hooks/set-state-in-effect (cascading-render risk) and there's
    // no need for it anyway: the render below only shows "Searching…" once
    // there's actually a non-empty trimmed query, which is already true by
    // the time this timer is even scheduled.
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const trimmedQuery = query.trim();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b border-border">
        <TextField
          label="Search"
          autoFocus
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {!trimmedQuery ? (
          <p className="p-6 text-center text-muted text-sm">Search across every note in your workspace.</p>
        ) : loading ? (
          <p className="p-6 text-center text-muted text-sm">Searching…</p>
        ) : results?.length === 0 ? (
          <p className="p-6 text-center text-muted text-sm">No matches.</p>
        ) : (
          results?.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-1 px-4 py-3 border-b border-border cursor-pointer hover:bg-hover"
              onClick={() => router.push(`/notes/${r.id}`)}
            >
              <span className="font-medium truncate">{r.name}</span>
              {r.snippet && (
                <span className="text-sm text-muted truncate">
                  {parseSnippet(r.snippet).map((seg, i) =>
                    seg.highlighted ? (
                      <mark key={i} className="bg-accent/30 text-normal rounded-sm">
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
