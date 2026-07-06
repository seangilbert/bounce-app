"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Confetti, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <Confetti size={22} weight="fill" />
          </span>
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight text-ink">Bounce</div>
            <div className="text-xs font-semibold text-ink-mute">Operator sign in</div>
          </div>
        </div>

        <form
          onSubmit={signIn}
          className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm"
        >
          <h1 className="font-display text-2xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm font-medium text-ink-mute">Sign in to your operator dashboard.</p>

          <label className="mt-5 block">
            <span className="mb-1 block text-[13px] font-bold text-ink-soft">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-brand"
              placeholder="you@business.com"
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-[13px] font-bold text-ink-soft">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-brand"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="mt-4 rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
          >
            {submitting ? (
              <>
                <CircleNotch size={18} weight="bold" className="animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs font-medium text-ink-mute">
          Operator accounts are provisioned during onboarding.
        </p>
      </div>
    </div>
  );
}
