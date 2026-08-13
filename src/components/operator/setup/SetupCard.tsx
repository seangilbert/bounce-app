"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rocket, ArrowRight, CaretRight, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { setSetupDismissedAction } from "@/app/onboarding/actions";
import type { SetupProgress, SetupStepKey } from "@/lib/operator/setup";
import { SETUP_STEPS } from "./steps";

/** Dashboard "Get set up" card — the persistent half of onboarding v2. Shows the
 *  next thing worth doing (not all nine), and can be hidden for good; the full
 *  guide stays at /onboarding, linked from Settings after that. */
export function SetupCard({
  progress,
  storefrontPath,
}: {
  progress: SetupProgress;
  storefrontPath: string;
}) {
  const router = useRouter();
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = progress.steps.filter((s) => !s.done);
  const [next, ...rest] = remaining;
  if (!next) return null; // complete — the dashboard stops asking

  const pct = Math.round((progress.doneCount / progress.total) * 100);
  const nextMeta = SETUP_STEPS[next.key];
  const NextIcon = nextMeta.icon;

  async function hide() {
    setHiding(true);
    setError(null);
    const res = await setSetupDismissedAction(true);
    if (res.ok) router.refresh();
    else {
      setError(res.error);
      setHiding(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <Rocket size={20} weight="fill" />
          </span>
          <div>
            <div className="font-display text-[17px] font-bold text-ink">Get set up</div>
            <div className="text-[13px] font-semibold text-ink-mute">
              {progress.doneCount} of {progress.total} done
            </div>
          </div>
        </div>
        <button
          onClick={hide}
          disabled={hiding}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold text-ink-faint transition-colors hover:bg-cream hover:text-ink-mute disabled:opacity-60"
        >
          {hiding ? <CircleNotch size={13} weight="bold" className="animate-spin" /> : null}
          Hide
        </button>
      </div>

      <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* The next step, in full */}
      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
          <NextIcon size={18} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">{nextMeta.title}</div>
          <p className="mt-0.5 text-[13.5px] font-medium leading-snug text-ink-mute">
            {nextMeta.blurb}
          </p>
          <StepLink
            stepKey={next.key}
            storefrontPath={storefrontPath}
            className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
          >
            {nextMeta.cta} <ArrowRight size={14} weight="bold" />
          </StepLink>
        </div>
      </div>

      {/* What's after it */}
      {rest.length > 0 ? (
        <div className="mt-4 divide-y divide-sand-line border-t border-sand-line">
          {rest.slice(0, 2).map((step) => {
            const meta = SETUP_STEPS[step.key];
            const Icon = meta.icon;
            return (
              <StepLink
                key={step.key}
                stepKey={step.key}
                storefrontPath={storefrontPath}
                className="flex items-center gap-2.5 py-2.5 hover:text-ink"
              >
                <Icon size={17} weight="fill" className="flex-shrink-0 text-ink-faint" />
                <span className="flex-1 truncate text-[14px] font-semibold text-ink-soft">
                  {meta.title}
                </span>
                <CaretRight size={14} weight="bold" className="flex-shrink-0 text-ink-faint" />
              </StepLink>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <Link href="/onboarding" className="text-[13px] font-bold text-brand hover:text-brand-deep">
          See all steps →
        </Link>
        {error ? <span className="text-[13px] font-semibold text-coral-deep">{error}</span> : null}
      </div>
    </div>
  );
}

/** Steps the guide handles inline (location, payments) send you to the guide;
 *  the test drive opens the operator's own storefront in a new tab. */
function StepLink({
  stepKey,
  storefrontPath,
  className,
  children,
}: {
  stepKey: SetupStepKey;
  storefrontPath: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (stepKey === "testDrive") {
    return (
      <Link href={storefrontPath} target="_blank" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={SETUP_STEPS[stepKey].href ?? "/onboarding"} className={className}>
      {children}
    </Link>
  );
}
