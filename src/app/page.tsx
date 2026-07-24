"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Note = {
  id: string;
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
  version: number;
};

// Throwaway harness for exercising the /api/notes routes against a real
// Supabase project while there's no real sign-up/editor UI yet. Not meant
// to survive once actual auth pages and a note editor exist.
export default function Home() {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [tree, setTree] = useState<unknown>(null);

  const appendLog = (line: string) => setLog((l) => [...l, line]);

  const signIn = async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return appendLog(`Sign-in failed: ${error.message}`);
    setSignedIn(true);
    appendLog("Signed in.");
  };

  const createNote = async (): Promise<void> => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Test Note ${Date.now()}`, frontmatter: { type: "note" }, body: "hello" }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Create failed (${res.status}): ${JSON.stringify(data)}`);
    setNote(data);
    appendLog(`Created note ${data.id}, version ${data.version}`);
  };

  const updateNote = async (): Promise<void> => {
    if (!note) return;
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: note.version, body: `updated at ${Date.now()}` }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Update failed (${res.status}): ${JSON.stringify(data)}`);
    setNote(data);
    appendLog(`Updated note, now version ${data.version}`);
  };

  // Deliberately sends a version one behind what the note is actually at,
  // to prove the optimistic-concurrency check rejects a stale write with
  // 409 instead of silently overwriting the newer content.
  const forceConflict = async (): Promise<void> => {
    if (!note) return;
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: note.version - 1, body: "this should be rejected" }),
    });
    const data = await res.json();
    appendLog(`Conflict test -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  };

  const createFolder = async (): Promise<void> => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Test Folder ${Date.now()}` }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Create folder failed (${res.status}): ${JSON.stringify(data)}`);
    setFolderId(data.id);
    appendLog(`Created folder ${data.id}`);
  };

  const moveNoteToFolder = async (): Promise<void> => {
    if (!note || !folderId) return;
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: note.version, folderId }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Move note failed (${res.status}): ${JSON.stringify(data)}`);
    setNote(data);
    appendLog(`Moved note into folder ${folderId}, now version ${data.version}`);
  };

  const deleteNote = async (): Promise<void> => {
    if (!note) return;
    const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return appendLog(`Delete note failed (${res.status}): ${JSON.stringify(data)}`);
    appendLog(`Deleted note ${note.id}`);
    setNote(null);
  };

  const renameFolder = async (): Promise<void> => {
    if (!folderId) return;
    const res = await fetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Renamed Folder ${Date.now()}` }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Rename folder failed (${res.status}): ${JSON.stringify(data)}`);
    appendLog(`Renamed folder -> "${data.name}"`);
  };

  // A folder can't become its own parent — this should always come back
  // as a 400 from the cycle guard, never silently succeed.
  const tryInvalidMove = async (): Promise<void> => {
    if (!folderId) return;
    const res = await fetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: folderId }),
    });
    const data = await res.json();
    appendLog(`Self-parent test -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  };

  // Deletes the folder (and, via cascade, anything still inside it —
  // exercise "move note to folder" first if you want to see that part).
  const deleteFolder = async (): Promise<void> => {
    if (!folderId) return;
    const res = await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return appendLog(`Delete folder failed (${res.status}): ${JSON.stringify(data)}`);
    appendLog(`Deleted folder ${folderId}`);
    setFolderId(null);
  };

  const loadTree = async (): Promise<void> => {
    const res = await fetch("/api/tree");
    const data = await res.json();
    if (!res.ok) return appendLog(`Load tree failed (${res.status}): ${JSON.stringify(data)}`);
    setTree(data);
    appendLog("Loaded tree — see below.");
  };

  return (
    <div className="min-h-screen p-8 font-sans max-w-xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Project Vault Cloud — API test harness</h1>

      {!signedIn ? (
        <div className="flex flex-col gap-2">
          <input
            className="border rounded px-3 py-2"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="border rounded px-3 py-2 bg-black text-white" onClick={() => void signIn()}>
            Sign in
          </button>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <button className="border rounded px-3 py-2" onClick={() => void createNote()}>
            Create note
          </button>
          <button className="border rounded px-3 py-2" disabled={!note} onClick={() => void updateNote()}>
            Update note
          </button>
          <button className="border rounded px-3 py-2" disabled={!note} onClick={() => void forceConflict()}>
            Force conflict (expect 409)
          </button>
          <button className="border rounded px-3 py-2" disabled={!note} onClick={() => void deleteNote()}>
            Delete note
          </button>
          <button className="border rounded px-3 py-2" onClick={() => void createFolder()}>
            Create folder
          </button>
          <button
            className="border rounded px-3 py-2"
            disabled={!note || !folderId}
            onClick={() => void moveNoteToFolder()}
          >
            Move note to folder
          </button>
          <button className="border rounded px-3 py-2" disabled={!folderId} onClick={() => void renameFolder()}>
            Rename folder
          </button>
          <button className="border rounded px-3 py-2" disabled={!folderId} onClick={() => void tryInvalidMove()}>
            Try self-parent (expect 400)
          </button>
          <button className="border rounded px-3 py-2" disabled={!folderId} onClick={() => void deleteFolder()}>
            Delete folder
          </button>
          <button className="border rounded px-3 py-2" onClick={() => void loadTree()}>
            Load tree
          </button>
        </div>
      )}

      <pre className="border rounded p-3 text-xs whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 min-h-32">
        {log.join("\n")}
      </pre>

      {tree !== null && (
        <pre className="border rounded p-3 text-xs whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900">
          {JSON.stringify(tree, null, 2)}
        </pre>
      )}
    </div>
  );
}
