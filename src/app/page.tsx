import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";

const FEATURES: { title: string; description: string }[] = [
  {
    title: "Notes that link together",
    description: "Write freely and connect people, places, and events with [[wiki-links]] — full-text search and backlinks find everything for you.",
  },
  {
    title: "Character sheets",
    description: "PC and NPC stat blocks with ability scores, HP, and AC, built into the note itself.",
  },
  {
    title: "Interactive maps",
    description: "Upload a map image, paint terrain and roads, drop pins, and calculate real travel time between them.",
  },
  {
    title: "Settlements",
    description: "Generate a whole town's population and buildings from a few sliders, then promote the ones your players actually meet into real notes.",
  },
  {
    title: "Custom calendars",
    description: "Track in-world dates across your own calendar systems, with a scaled timeline of everything that's happened.",
  },
  {
    title: "Dice & initiative",
    description: "A dice roller and a combat tracker, ready at the table on your phone.",
  },
];

// The public root — `/` is intentionally outside the (app) route group so
// it renders for a signed-out visitor instead of the (app) layout's
// server-side redirect straight to /sign-in, which used to mean anyone
// landing on the bare domain saw a login form with zero context for what
// this even is. Signed-in visitors (a stale bookmark, or just navigating
// back to "/") skip straight through to their workspace.
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/vault");

  return (
    <div className="min-h-full flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4">
        <span className="font-serif text-lg">Project Vault</span>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link href="/sign-up">
            <Button variant="primary">Create account</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-8">
        <section className="max-w-2xl w-full text-center py-12 sm:py-20">
          <h1 className="font-serif text-3xl sm:text-4xl leading-tight">Your campaign, all in one place.</h1>
          <p className="text-muted mt-4 text-base sm:text-lg">
            A D&apos;D campaign notes workspace — browse, read, and edit your world from any device, at the table or
            on the couch.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Link href="/sign-up">
              <Button variant="primary">Create account</Button>
            </Link>
            <Link href="/sign-in">
              <Button>Sign in</Button>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl w-full pb-16">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-panel border border-border rounded-xl p-5">
              <h2 className="font-serif text-base">{f.title}</h2>
              <p className="text-sm text-muted mt-1.5">{f.description}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-4 sm:px-8 py-6 text-center text-xs text-muted">
        Each account gets its own separate campaign — nothing shared with anyone else&apos;s.
      </footer>
    </div>
  );
}
