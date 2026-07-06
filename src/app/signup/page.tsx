"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Confetti, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";
import { PLAN_LIST, isPaidPlan, PLANS, type PlanId, type Plan } from "@/lib/plans";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<{
    businessName: string;
    ownerName: string;
    email: string;
    password: string;
    plan: PlanId;
  }>({ businessName: "", ownerName: "", email: "", password: "", plan: "solo" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    (k: "businessName" | "ownerName" | "email" | "password") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const paid = isPaidPlan(form.plan);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create your account.");

      // Establish the session.
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (signInErr) throw new Error(signInErr.message);

      // Paid plan → Stripe subscription checkout (14-day trial). Free → dashboard.
      if (paid) {
        const bRes = await fetch("/api/billing/checkout", { method: "POST" });
        const bJson = await bRes.json();
        if (bRes.ok && bJson.url) {
          window.location.href = bJson.url;
          return;
        }
        // If billing can't start, still land them in the app; they can retry later.
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <Confetti size={22} weight="fill" />
          </span>
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight text-ink">Bounce</div>
            <div className="text-xs font-semibold text-ink-mute">Create your workspace</div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
          <h1 className="font-display text-2xl font-bold text-ink">Start your rental business</h1>
          <p className="mt-1 text-sm font-medium text-ink-mute">
            Create an operator account — it takes a minute.
          </p>

          <Field label="Business name" value={form.businessName} onChange={field("businessName")} placeholder="Bounce USA" required />
          <Field label="Your name (optional)" value={form.ownerName} onChange={field("ownerName")} placeholder="Cheri Boyd" />
          <Field label="Email" type="email" value={form.email} onChange={field("email")} placeholder="you@business.com" required />
          <Field label="Password" type="password" value={form.password} onChange={field("password")} placeholder="At least 8 characters" required />

          <div className="mt-4">
            <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Choose a plan</span>
            <div className="flex flex-col gap-2">
              {PLAN_LIST.map((p) => (
                <PlanOption
                  key={p.id}
                  plan={p}
                  active={form.plan === p.id}
                  onClick={() => setForm((f) => ({ ...f, plan: p.id }))}
                />
              ))}
            </div>
            {paid ? (
              <p className="mt-2 text-xs font-medium text-ink-mute">
                14-day free trial, then ${PLANS[form.plan].priceCents / 100}/mo. Cancel anytime.
              </p>
            ) : null}
          </div>

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
                <CircleNotch size={18} weight="bold" className="animate-spin" /> Creating…
              </>
            ) : paid ? (
              "Start free trial"
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-sm font-medium text-ink-mute">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-brand hover:text-brand-deep">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function PlanOption({ plan, active, onClick }: { plan: Plan; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
        active ? "border-brand bg-brand-tint/40" : "border-sand-line bg-white hover:border-sand"
      }`}
    >
      <span
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
          active ? "border-brand" : "border-sand"
        }`}
      >
        {active ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{plan.name}</span>
        <span className="block text-[12.5px] font-medium text-ink-mute">{plan.tagline}</span>
      </span>
      <span className="flex-shrink-0 whitespace-nowrap text-right">
        <span className="font-display text-base font-extrabold text-ink">
          {plan.priceCents === 0 ? "Free" : `$${plan.priceCents / 100}`}
        </span>
        {plan.priceCents > 0 ? <span className="text-[12px] font-semibold text-ink-mute">/mo</span> : null}
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-brand"
      />
    </label>
  );
}
