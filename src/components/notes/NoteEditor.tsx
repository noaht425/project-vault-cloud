"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceTree } from "@/components/tree/WorkspaceTreeProvider";
import { EditorTabs, type EditorMode } from "./EditorTabs";
import { PreviewPane } from "./PreviewPane";
import { ConflictBanner, type ConflictNote } from "./ConflictBanner";
import { NoteTypeForm } from "@/components/notetypes/NoteTypeForm";

// Matches the Electron Cloud editor's AUTOSAVE_DELAY_MS exactly
// (cloudEditorStore.ts) — clear-and-reschedule on every keystroke.
const AUTOSAVE_DELAY_MS = 1500;

interface NoteData {
  id: string;
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
  version: number;
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function NoteEditor({ noteId }: { noteId: string }) {
  const { refresh: refreshTree } = useWorkspaceTree();
  const [note, setNote] = useState<NoteData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const [frontmatterDraft, setFrontmatterDraft] = useState<Record<string, unknown>>({});
  const [mode, setMode] = useState<EditorMode>("edit");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<ConflictNote | null>(null);

  // Refs (not state) for values the debounced save/unmount-flush closures
  // need to read without re-subscribing the effect on every keystroke.
  const noteRef = useRef<NoteData | null>(null);
  const bodyDraftRef = useRef("");
  const frontmatterDraftRef = useRef<Record<string, unknown>>({});
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const conflictRef = useRef<ConflictNote | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // No need to reset note/loadError/conflict to their defaults here —
    // this effect only ever runs once per mounted instance (the route
    // wrapper key-remounts NoteEditor per noteId, see notes/[noteId]/
    // page.tsx), so they're already at those defaults. Setting them again
    // synchronously in the effect body would trip react-hooks/
    // set-state-in-effect for no actual benefit.
    let cancelled = false;
    fetch(`/api/notes/${noteId}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load note");
        setNote(data);
        setBodyDraft(data.body);
        setFrontmatterDraft(data.frontmatter);
        setStatus("idle");
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);
  useEffect(() => {
    bodyDraftRef.current = bodyDraft;
  }, [bodyDraft]);
  useEffect(() => {
    frontmatterDraftRef.current = frontmatterDraft;
  }, [frontmatterDraft]);
  useEffect(() => {
    conflictRef.current = conflict;
  }, [conflict]);

  const save = async (): Promise<void> => {
    const current = noteRef.current;
    // A conflict is already showing — don't overwrite it with a second
    // autosave attempt while the user hasn't resolved the first one yet.
    if (!current || savingRef.current || conflictRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: current.version,
          body: bodyDraftRef.current,
          frontmatter: frontmatterDraftRef.current,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setConflict(data.current);
        setStatus("error");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setNote(data);
      dirtyRef.current = false;
      setStatus("saved");
      void refreshTree();
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;
    }
  };

  const scheduleSave = (): void => {
    dirtyRef.current = true;
    setStatus("dirty");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  };

  // Flush on unmount (switching notes, or navigating away) if there's an
  // unsaved edit — the note route wrapper key-remounts NoteEditor per
  // noteId, so this fires exactly when the desktop app's own "flush before
  // switching notes" fix (748112a) needed to.
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (!dirtyRef.current) return;
      if (conflictRef.current) {
        // A conflict banner was still showing when the user navigated away
        // without clicking either resolution button — the banner's own text
        // promises "your unsaved changes are still here," so silently
        // dropping them here would be a real, easy-to-hit case of exactly
        // that. Flushes with the conflict's own (newer) version as the
        // base, same request `keepMine()` makes — there's no UI left to
        // show a second conflict or a save error if this itself races, so
        // those outcomes are just logged, not surfaced.
        const conflictVersion = conflictRef.current.version;
        void fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: conflictVersion,
            body: bodyDraftRef.current,
            frontmatter: frontmatterDraftRef.current,
          }),
        }).catch((err) => console.error("Failed to flush note on unmount after a conflict:", err));
      } else {
        void save();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const keepMine = async (): Promise<void> => {
    if (!conflict) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: conflict.version,
          body: bodyDraftRef.current,
          frontmatter: frontmatterDraftRef.current,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // Changed again in between — show the newer conflict instead.
        setConflict(data.current);
        setStatus("error");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setNote(data);
      setConflict(null);
      dirtyRef.current = false;
      setStatus("saved");
      void refreshTree();
    } catch {
      setStatus("error");
    }
  };

  const discardMine = (): void => {
    if (!conflict) return;
    setNote(conflict);
    setBodyDraft(conflict.body);
    setFrontmatterDraft(conflict.frontmatter);
    setConflict(null);
    dirtyRef.current = false;
    setStatus("idle");
  };

  const updateFrontmatter = (patch: Record<string, unknown>): void => {
    setFrontmatterDraft((prev) => ({ ...prev, ...patch }));
    scheduleSave();
  };

  // Only FamilyTreeForm uses this (its add/remove-relationship controls
  // rewrite the body's "## Relationships" section) — every other
  // NoteTypeForm only ever calls updateFrontmatter.
  const updateBody = (newBody: string): void => {
    setBodyDraft(newBody);
    scheduleSave();
  };

  if (loadError) {
    return <div className="flex-1 flex items-center justify-center p-6 text-danger text-sm text-center">{loadError}</div>;
  }
  if (!note) {
    return <div className="flex-1 flex items-center justify-center p-6 text-muted text-sm">Loading…</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {conflict && <ConflictBanner current={conflict} onKeepMine={() => void keepMine()} onDiscardMine={discardMine} />}
      <div className="shrink-0 flex items-center justify-between border-b border-border">
        <h1 className="px-4 py-2 font-serif text-base truncate">{note.name}</h1>
        <span className="px-4 text-xs text-muted shrink-0">
          {status === "saving" && "Saving…"}
          {status === "dirty" && "Unsaved changes"}
          {status === "saved" && "Saved"}
          {status === "error" && !conflict && "Couldn't save"}
        </span>
      </div>
      <div className="shrink-0">
        <EditorTabs mode={mode} onChange={setMode} />
      </div>
      {/* NoteTypeForm (when the type has one) can be tall enough on its own
          to push the body editor off-screen — this wrapper scrolls as one
          unit so a long PC/NPC form doesn't squish the textarea down to
          nothing, while the title/tabs above stay reachable without
          scrolling back up. */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        <NoteTypeForm frontmatter={frontmatterDraft} body={bodyDraft} onChange={updateFrontmatter} onBodyChange={updateBody} />
        {/* Capped and centered on desktop — a NoteTypeForm above (when
            present) still uses the full pane width for its own tables/
            grids/canvas, but prose body text at full desktop width runs an
            unreadably long line length. No cap on mobile, where the pane is
            already narrow. */}
        {mode === "edit" ? (
          <div className="flex-1 flex flex-col min-h-0 md:max-w-3xl md:w-full md:mx-auto">
            <textarea
              className="flex-1 min-h-[40vh] resize-none border-0 rounded-none focus:outline-none p-4 font-mono text-sm leading-relaxed"
              value={bodyDraft}
              onChange={(e) => {
                setBodyDraft(e.target.value);
                scheduleSave();
              }}
              placeholder="Start writing…"
            />
          </div>
        ) : (
          <div className="md:max-w-3xl md:w-full md:mx-auto">
            <PreviewPane body={bodyDraft} />
          </div>
        )}
      </div>
    </div>
  );
}
