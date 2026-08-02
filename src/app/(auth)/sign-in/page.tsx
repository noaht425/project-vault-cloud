"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/Panel";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

export default function SignInPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) return setError(error.message);
    // router.refresh() forces the (app) Server Component layout to re-read
    // the now-set session cookie — without it, Next can serve a cached
    // render from before sign-in and bounce straight back to /sign-in.
    router.push("/");
    router.refresh();
  };

  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-serif">Project Vault</h1>
        <p className="text-sm text-muted">Sign in to your cloud workspace.</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-accent">
          Create one
        </Link>
      </p>
    </Panel>
  );
}
