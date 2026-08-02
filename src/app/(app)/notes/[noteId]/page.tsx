import { NoteEditor } from "@/components/notes/NoteEditor";

// key={noteId} forces a full remount on navigating between notes — that's
// what gives NoteEditor's own unmount-cleanup effect a "flush before
// switching notes" boundary for free, without a global editor store.
export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  return <NoteEditor key={noteId} noteId={noteId} />;
}
