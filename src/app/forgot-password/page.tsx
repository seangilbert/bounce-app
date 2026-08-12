"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleNotch, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Always land on the same confirmation, whether or not the email exists —
    // otherwise this form becomes an oracle for which addresses have accounts.
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/movables-logo.png" alt="Movables" className="h-8 w-auto" />
          <div className="mt-2 text-xs font-semibold text-ink-mute">Reset your password</div>
        </div>

        {sent ? (
          <div className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <EnvelopeSimple size={22} weight="fill" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">Check your email</h1>
            <p className="mt-1 text-sm font-medium text-ink-mute">
              If an account exists for <span className="font-bold text-ink-soft">{email}</span>, we&apos;ve sent a link
              to reset your password. It expires in about an hour.
            </p>
            <Link
              href="/login"
              className="mt-5 flex w-full items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={requestReset} className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink">Forgot password?</h1>
            <p className="mt-1 text-sm font-medium text-ink-mute">
              Enter your email and we&apos;ll send you a link to set a new one.
            </p>

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
                  <CircleNotch size={18} weight="bold" className="animate-spin" /> Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm font-medium text-ink-mute">
          Remembered it?{" "}
          <Link href="/login" className="font-bold text-brand hover:text-brand-deep">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
