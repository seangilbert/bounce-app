"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Confetti,
  CheckCircle,
  MapPin,
  Package,
  CreditCard,
  ArrowRight,
  CircleNotch,
} from "@phosphor-icons/react/dist/ssr";
import { saveLocationAction } from "@/app/onboarding/actions";

export function OnboardingWizard({
  businessName,
  slug,
  location,
  itemCount,
  paymentsConnected,
}: {
  businessName: string;
  slug: string | null;
  location: string | null;
  itemCount: number;
  paymentsConnected: boolean;
}) {
  const storefrontPath = slug ? `/s/${slug}` : "/book";
  const hasLocation = Boolean(location);
  const hasItems = itemCount > 0;
  const doneCount = [hasLocation, hasItems, paymentsConnected].filter(Boolean).length;
  const allDone = doneCount === 3;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-cream px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <Confetti size={22} weight="fill" />
          </span>
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight text-ink">
              Welcome, {businessName.split(" ")[0]}!
            </div>
            <div className="text-xs font-semibold text-ink-mute">
              {allDone ? "You're all set 🎉" : `Let's get you set up · ${doneCount} of 3 done`}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <LocationStep done={hasLocation} location={location} />
          <InventoryStep done={hasItems} count={itemCount} />
          <PaymentsStep done={paymentsConnected} />
        </div>

        {slug ? (
          <div className="mt-5 rounded-2xl border border-sand-line bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">
              Your storefront
            </div>
            <div className="mt-0.5 truncate font-display text-sm font-bold text-ink">
              bounce-app.vercel.app{storefrontPath}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between">
          <Link
            href={storefrontPath}
            className="text-sm font-bold text-ink-mute hover:text-ink"
            target="_blank"
          >
            View your storefront ↗
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
          >
            {allDone ? "Go to dashboard" : "Skip for now"} <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StepShell({
  done,
  icon,
  title,
  children,
}: {
  done: boolean;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${done ? "border-teal-line" : "border-sand-line"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
            done ? "bg-teal-tint text-teal" : "bg-brand-tint text-brand"
          }`}
        >
          {done ? <CheckCircle size={22} weight="fill" /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">{title}</div>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function LocationStep({ done, location }: { done: boolean; location: string | null }) {
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
    <StepShell done={done} icon={<MapPin size={20} weight="fill" />} title="Your service area">
      {done ? (
        <p className="text-sm font-medium text-ink-soft">{location}</p>
      ) : (
        <>
          <p className="text-[13.5px] font-medium text-ink-mute">
            Where do you deliver? Sets your local weather and storefront area.
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
      )}
    </StepShell>
  );
}

function InventoryStep({ done, count }: { done: boolean; count: number }) {
  return (
    <StepShell done={done} icon={<Package size={20} weight="fill" />} title="Add your rentals">
      {done ? (
        <p className="text-sm font-medium text-ink-soft">
          {count} {count === 1 ? "item" : "items"} in your catalog.{" "}
          <Link href="/inventory" className="font-bold text-brand hover:text-brand-deep">
            Manage
          </Link>
        </p>
      ) : (
        <>
          <p className="text-[13.5px] font-medium text-ink-mute">
            Add the items customers can book on your storefront.
          </p>
          <Link
            href="/inventory"
            className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
          >
            Add items <ArrowRight size={14} weight="bold" />
          </Link>
        </>
      )}
    </StepShell>
  );
}

function PaymentsStep({ done }: { done: boolean }) {
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
    <StepShell done={done} icon={<CreditCard size={20} weight="fill" />} title="Get paid">
      {done ? (
        <p className="text-sm font-medium text-ink-soft">Stripe connected — payouts go to your bank.</p>
      ) : (
        <>
          <p className="text-[13.5px] font-medium text-ink-mute">
            Connect Stripe so customer payments land in your account.
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
      )}
    </StepShell>
  );
}
