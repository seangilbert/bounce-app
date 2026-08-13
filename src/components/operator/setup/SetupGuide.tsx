"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Confetti,
  CheckCircle,
  ArrowRight,
  ArrowSquareOut,
  CircleNotch,
  Copy,
} from "@phosphor-icons/react/dist/ssr";
import { saveLocationAction, setSetupDismissedAction } from "@/app/onboarding/actions";
import { brandVars } from "@/lib/branding/palette";
import type { SetupProgress, SetupStep } from "@/lib/operator/setup";
import { SETUP_STEPS } from "./steps";

/**
 * The full "Get set up" guide at /onboarding — where new signups land and where
 * the dashboard card's "See all steps" goes. Two steps are done right here
 * (service area, Stripe); the rest hand off to the page that owns them.
 */
export function SetupGuide({
  businessName,
  location,
  storefrontPath,
  storefrontUrl,
  brandColor,
  logoUrl,
  progress,
}: {
  businessName: string;
  location: string | null;
  storefrontPath: string;
  storefrontUrl: string;
  brandColor: string | null;
  logoUrl: string | null;
  progress: SetupProgress;
}) {
  const { doneCount, total, complete } = progress;
  const pct = Math.round((doneCount / total) * 100);

  return (
    // The guide sits outside the (operator) layout, so it sets the brand vars
    // itself — otherwise it's the one operator surface still wearing default blue.
    <div
      className="flex min-h-dvh flex-col items-center bg-cream px-6 py-12"
      style={brandVars(brandColor)}
    >
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              className="h-11 w-11 flex-shrink-0 rounded-2xl object-contain"
            />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
              <Confetti size={22} weight="fill" />
            </span>
          )}
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight text-ink">
              Welcome, {businessName.split(" ")[0]}!
            </div>
            <div className="text-xs font-semibold text-ink-mute">
              {complete ? "You're all set 🎉" : `Let's get you set up · ${doneCount} of ${total} done`}
            </div>
          </div>
        </div>

        <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex flex-col gap-3">
          {progress.steps.map((step) => (
            <GuideStep
              key={step.key}
              step={step}
              location={location}
              itemCount={progress.itemCount}
              storefrontPath={storefrontPath}
            />
          ))}
        </div>

        <StorefrontUrlCard url={storefrontUrl} />

        <div className="mt-6 flex items-center justify-between">
          <Link
            href={storefrontPath}
            className="flex items-center gap-1.5 text-sm font-bold text-ink-mute hover:text-ink"
            target="_blank"
          >
            View your storefront <ArrowSquareOut size={14} weight="bold" />
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
          >
            {complete ? "Go to dashboard" : "Finish later"} <ArrowRight size={15} weight="bold" />
          </Link>
        </div>

        <DashboardCardToggle dismissed={progress.dismissed} />
      </div>
    </div>
  );
}

/** The link an operator puts in their bio, ads, and email signature — shown in
 *  full (scheme included) and copyable, because that's what it's for. */
function StorefrontUrlCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin / permission) — the URL is on screen.
    }
  }

  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-sand-line bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
          Your storefront
        </div>
        <div className="mt-0.5 truncate font-display text-sm font-bold text-ink">{url}</div>
      </div>
      <button
        onClick={copy}
        className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-sand-line px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:bg-cream"
      >
        {copied ? (
          <>
            <CheckCircle size={14} weight="fill" className="text-teal" /> Copied
          </>
        ) : (
          <>
            <Copy size={14} weight="bold" /> Copy
          </>
        )}
      </button>
    </div>
  );
}

function GuideStep({
  step,
  location,
  itemCount,
  storefrontPath,
}: {
  step: SetupStep;
  location: string | null;
  itemCount: number;
  storefrontPath: string;
}) {
  const meta = SETUP_STEPS[step.key];
  const Icon = meta.icon;

  let body: React.ReactNode;
  if (step.done) {
    body = (
      <p className="text-sm font-medium text-ink-soft">
        {step.key === "location" && location
          ? location
          : step.key === "items"
            ? `${itemCount} ${itemCount === 1 ? "item" : "items"} in your catalog.`
            : meta.doneNote}{" "}
        {step.key !== "location" && meta.href ? (
          <Link href={meta.href} className="font-bold text-brand hover:text-brand-deep">
            Manage
          </Link>
        ) : null}
      </p>
    );
  } else if (step.key === "location") {
    body = <LocationField />;
  } else if (step.key === "payments") {
    body = <ConnectStripeField />;
  } else {
    const href = step.key === "testDrive" ? storefrontPath : (meta.href ?? "/dashboard");
    body = (
      <>
        <p className="text-[13.5px] font-medium leading-snug text-ink-mute">{meta.blurb}</p>
        <Link
          href={href}
          target={step.key === "testDrive" ? "_blank" : undefined}
          className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          {meta.cta} <ArrowRight size={14} weight="bold" />
        </Link>
      </>
    );
  }

  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${step.done ? "border-teal-line" : "border-sand-line"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
            step.done ? "bg-teal-tint text-teal" : "bg-brand-tint text-brand"
          }`}
        >
          {step.done ? <CheckCircle size={22} weight="fill" /> : <Icon size={20} weight="fill" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">{meta.title}</div>
          <div className="mt-1">{body}</div>
        </div>
      </div>
    </div>
  );
}

function LocationField() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSubmitting(true);
    setError(null);
    const res = await saveLocationAction(value);
    if (res.ok) router.refresh();
    else {
      setError(res.error);
      setSubmitting(false);
    }
  }

  return (
    <>
      <p className="text-[13.5px] font-medium leading-snug text-ink-mute">
        {SETUP_STEPS.location.blurb}
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Plymouth, MA"
          className="input"
        />
        <button
          onClick={save}
          disabled={submitting || !value.trim()}
          className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
        >
          {submitting ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : "Save"}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-[13px] font-semibold text-coral-deep">{error}</p> : null}
    </>
  );
}

function ConnectStripeField() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/onboard", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start setup.");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <>
      <p className="text-[13.5px] font-medium leading-snug text-ink-mute">
        {SETUP_STEPS.payments.blurb}
      </p>
      <button
        onClick={connect}
        disabled={loading}
        className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-70"
      >
        {loading ? (
          <>
            <CircleNotch size={14} weight="bold" className="animate-spin" /> Starting…
          </>
        ) : (
          <>
            Connect Stripe <ArrowRight size={14} weight="bold" />
          </>
        )}
      </button>
      {error ? <p className="mt-1.5 text-[13px] font-semibold text-coral-deep">{error}</p> : null}
    </>
  );
}

/** Bring the dashboard card back (or send it away) without leaving the guide. */
function DashboardCardToggle({ dismissed }: { dismissed: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setError(null);
    const res = await setSetupDismissedAction(!dismissed);
    if (res.ok) router.refresh();
    else setError(res.error);
    setSaving(false);
  }

  return (
    <div className="mt-4 text-center">
      <button
        onClick={toggle}
        disabled={saving}
        className="text-[13px] font-bold text-ink-faint hover:text-ink-mute disabled:opacity-60"
      >
        {dismissed ? "Show this guide on my dashboard" : "Hide this guide from my dashboard"}
      </button>
      {error ? <p className="mt-1 text-[13px] font-semibold text-coral-deep">{error}</p> : null}
    </div>
  );
}
