"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Confetti, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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

      // Establish the session, then land on the dashboard.
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (signInErr) throw new Error(signInErr.message);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
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
