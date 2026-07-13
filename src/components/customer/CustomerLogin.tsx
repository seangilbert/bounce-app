"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, ArrowLeft, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

const RESEND_SECONDS = 45;

/**
 * The code's length is Supabase's to decide (GoTrue's OTP length is a project
 * setting — this project mints 8 digits, not the documented 6), so don't pin it.
 * Accept a generous range and let the auth server be the judge of correctness;
 * hardcoding "6" here made it literally impossible to type a real code in.
 */
const CODE_MIN = 6;
const CODE_MAX = 10;

/**
 * Passwordless renter sign-in: email → 6-digit code → session.
 *
 * The code is minted by Supabase but delivered by us over Resend (see
 * lib/customers/otp.ts), so `verifyOtp` here must use type "magiclink" — it has
 * to match the type the server passed to `generateLink`.
 */
export function CustomerLogin({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/customer/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setStep("code");
    setCooldown(RESEND_SECONDS);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "magiclink",
    });
    if (verifyError) {
      setBusy(false);
      // Covers both a wrong code and an expired one — we don't distinguish,
      // since telling them which would help someone guessing.
      setError("That code isn't right or has expired. Check the email, or send a new code.");
      return;
    }

    // Session cookie now exists. Attach this person's per-operator records to
    // their account BEFORE navigating — otherwise /my renders an empty list on
    // first login, since nothing has been claimed yet.
    const claim = await fetch("/api/customer/auth/claim", { method: "POST" });
    if (!claim.ok) {
      setBusy(false);
      setError("Signed in, but we couldn't load your bookings. Please refresh.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      {step === "email" ? (
        <form onSubmit={requestCode}>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            See your bookings
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Enter the email you used to book. We&apos;ll send you a sign-in code — no password needed.
          </p>
          <label htmlFor="email" className="mt-6 block text-sm font-semibold text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1.5 w-full rounded-2xl border border-sand bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand-ring"
          />
          {error && <p className="mt-3 text-sm font-medium text-coral">{error}</p>}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-deep disabled:opacity-50"
          >
            {busy && <CircleNotch size={18} className="animate-spin" />}
            Send me a code
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-mute transition hover:text-ink"
          >
            <ArrowLeft size={15} weight="bold" />
            Back
          </button>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint text-brand-deep">
            <EnvelopeSimple size={21} weight="fill" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">
            Check your email
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            If <span className="font-semibold text-ink">{email}</span> has bookings, we just sent it
            a sign-in code.
          </p>
          <label htmlFor="code" className="mt-6 block text-sm font-semibold text-ink">
            Sign-in code
          </label>
          <input
            id="code"
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_MAX}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_MAX))}
            placeholder="Enter code"
            className="mt-1.5 w-full rounded-2xl border border-sand bg-white px-4 py-3 text-center font-display text-2xl font-extrabold tracking-[0.25em] text-ink outline-none placeholder:text-base placeholder:font-bold placeholder:tracking-normal placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand-ring"
          />
          {error && <p className="mt-3 text-sm font-medium text-coral">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length < CODE_MIN}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-deep disabled:opacity-50"
          >
            {busy && <CircleNotch size={18} className="animate-spin" />}
            Sign in
          </button>
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={() => requestCode()}
            className="mt-4 w-full text-center text-sm font-semibold text-ink-mute transition hover:text-ink disabled:opacity-60 disabled:hover:text-ink-mute"
          >
            {cooldown > 0 ? `Didn't get it? Resend in 0:${String(cooldown).padStart(2, "0")}` : "Resend code"}
          </button>
        </form>
      )}
    </div>
  );
}
