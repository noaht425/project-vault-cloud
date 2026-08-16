"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/Panel";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

export default function SignUpPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once signUp succeeds but Supabase requires confirming the address
  // first — mirrors the Electron app's CloudFileTree.tsx
  // awaitingEmailConfirmation flow, same underlying ambiguity (whether this
  // project's Supabase Auth has "Confirm email" on isn't knowable from
  // here, so both outcomes are handled rather than assumed).
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const signUp = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (error) return setError(error.message);
    if (data.session) {
      // Confirmation is off for this project — signUp already returned a
      // real session, same as sign-in would have.
      router.push("/vault");
      router.refresh();
      return;
    }
    setAwaitingConfirmation(true);
  };

  if (awaitingConfirmation) {
    return (
      <Panel className="flex flex-col gap-3">
        <h1 className="text-lg font-serif">Check your email</h1>
        <p className="text-sm text-muted">
          Account created — check {email || "your email"} for a confirmation link, then sign in.
        </p>
        <Link href="/sign-in">
          <Button className="w-full">Back to sign in</Button>
        </Link>
      </Panel>
    );
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-serif">Create your workspace</h1>
        <p className="text-sm text-muted">Your own, separate campaign — nothing shared with anyone else&apos;s.</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void signUp();
        }}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-accent">
          Sign in
        </Link>
      </p>
    </Panel>
  );
}
