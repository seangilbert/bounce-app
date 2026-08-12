"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // null = still checking; true/false = whether the recovery session landed.
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    // The /auth/callback handler should have exchanged the emailed code for a
    // session before redirecting here. If there's no session, the link was
    // opened in a different browser than the one that requested the reset (PKCE
    // can't complete) or it expired — either way there's nothing to update.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/movables-logo.png" alt="Movables" className="h-8 w-auto" />
          <div className="mt-2 text-xs font-semibold text-ink-mute">Choose a new password</div>
        </div>

        {ready === false ? (
          <div className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink">Link expired</h1>
            <p className="mt-1 text-sm font-medium text-ink-mute">
              This reset link is no longer valid, or was opened in a different browser than the one you requested it
              from. Request a fresh link to try again.
            </p>
            <Link
              href="/forgot-password"
              className="mt-5 flex w-full items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
            >
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink">Password updated</h1>
            <p className="mt-1 text-sm font-medium text-ink-mute">Taking you to your dashboard…</p>
          </div>
        ) : (
          <form onSubmit={updatePassword} className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink">Set a new password</h1>
            <p className="mt-1 text-sm font-medium text-ink-mute">Pick something you haven&apos;t used before.</p>

            <label className="mt-5 block">
              <span className="mb-1 block text-[13px] font-bold text-ink-soft">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={ready === null}
                className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-brand"
                placeholder="At least 8 characters"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-[13px] font-bold text-ink-soft">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={ready === null}
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
              disabled={submitting || ready === null}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
            >
              {submitting ? (
                <>
                  <CircleNotch size={18} weight="bold" className="animate-spin" /> Saving…
                </>
              ) : (
                "Update password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
