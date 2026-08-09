"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  bornDiedByTitle,
  checkEventDeathContradictions,
  checkFamilyTreeDateContradictions,
  type Contradiction,
  type EventForCheck,
  type ParentChildForCheck,
} from "@/lib/contradictionCheck";
import { parseRelationships } from "@/lib/familyTreeRelationships";
import { extractWikiLinkTitles } from "@/lib/wikiLinks";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { Button } from "@/components/ui/Button";

interface NoteSummary {
  id: string;
  name: string;
}

interface FullNote {
  id: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Mirrors the Electron app's contradictionCheckRunner.ts, adapted from its
// IPC/noteRefApi calls to this repo's REST API. Same mechanical, not-AI
// framing as the desktop ContradictionsView — a plain date-comparison pass
// over Born:/Died: facts, event dates, and family-tree parent/child pairs
// the notes already declare.
async function runContradictionCheck(): Promise<Contradiction[]> {
  const [facts, eventMatches, familyTreeMatches] = await Promise.all([
    fetchJson<{ id: string; name: string; date: string; summary: string; noteType: string }[]>("/api/events"),
    fetchJson<NoteSummary[]>("/api/notes?type=event"),
    fetchJson<NoteSummary[]>("/api/notes?type=family-tree"),
  ]);
  const bornDied = bornDiedByTitle(facts.map((f) => ({ title: f.name, date: f.date, summary: f.summary })));

  const events: EventForCheck[] = await Promise.all(
    eventMatches.map(async (match): Promise<EventForCheck> => {
      const note = await fetchJson<FullNote>(`/api/notes/${match.id}`);
      return {
        title: match.name,
        date: typeof note.frontmatter.date === "string" ? note.frontmatter.date : "",
        linkedTitles: extractWikiLinkTitles(note.body),
      };
    })
  );

  const edgeLists = await Promise.all(
    familyTreeMatches.map(async (match): Promise<ParentChildForCheck[]> => {
      const note = await fetchJson<FullNote>(`/api/notes/${match.id}`);
      return parseRelationships(note.body)
        .filter((edge) => edge.relation === "parent")
        .map((edge) => ({ parent: edge.a, child: edge.b, sourceTreeTitle: match.name }));
    })
  );

  return [...checkEventDeathContradictions(events, bornDied), ...checkFamilyTreeDateContradictions(edgeLists.flat(), bornDied)];
}

export default function ContradictionsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);

  const runCheck = (): void => {
    setStatus("checking");
    setError(null);
    runContradictionCheck()
      .then((result) => {
        setContradictions(result);
        setStatus("done");
      })
      .catch((err) => {
        console.error("Contradiction check failed:", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  };

  const openTitle = async (title: string): Promise<void> => {
    const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(title)}`).catch(() => []);
    const id = resolveWikiLinkTitle(matches, title);
    if (id) router.push(`/notes/${id}`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-serif">Contradiction Check</h1>
        <Button variant="primary" onClick={runCheck} disabled={status === "checking"}>
          {status === "checking" ? "Checking…" : "Run Check"}
        </Button>
      </div>
      <p className="text-sm text-muted mt-2">
        A mechanical pass over Born:/Died: facts, event dates, and family-tree parent/child pairs your notes already
        have — not an AI reading of your world&apos;s content, just the same kind of check a spreadsheet&apos;s
        data-validation rules would run against structure that already exists.
      </p>

      {status === "error" && <p className="text-sm text-danger mt-4">{error}</p>}
      {status === "done" && contradictions.length === 0 && <p className="text-sm mt-4">No contradictions found.</p>}

      {contradictions.length > 0 && (
        <ul className="flex flex-col gap-2 mt-4 list-none p-0">
          {contradictions.map((c, i) => (
            <li key={i} className="border border-border rounded-lg p-3">
              <div className="text-sm">{c.message}</div>
              <div className="flex gap-3 mt-1.5">
                <button
                  className="text-sm text-accent underline bg-transparent border-0 p-0 cursor-pointer"
                  onClick={() => void openTitle(c.noteATitle)}
                >
                  Open {c.noteATitle}
                </button>
                {c.noteBTitle !== c.noteATitle && (
                  <button
                    className="text-sm text-accent underline bg-transparent border-0 p-0 cursor-pointer"
                    onClick={() => void openTitle(c.noteBTitle)}
                  >
                    Open {c.noteBTitle}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
