"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkle,
  CurrencyCircleDollar,
  PaperPlaneTilt,
  PenNib,
  ShieldCheck,
  ArrowRight,
  LockSimple,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { setAgentToggleAction, type AgentToggleKey } from "@/app/(operator)/agents/actions";
import { updateAssistantInstructionsAction } from "@/app/(operator)/settings/actions";
import { ASSISTANT_INSTRUCTIONS_MAX_CHARS } from "@/lib/operator/policies";
import type { AgentStats, AgentStat } from "@/lib/reminders/stats";
import { UpgradeButton } from "@/components/operator/UpgradeButton";

/**
 * The Agents page: the product's automations presented as a hireable team —
 * each card is one agent with a job description, when it acts, live activity
 * from the send-logs (the "shows its work" that earns the framing), and a
 * switch. The three customer-facing follow-up agents are Solo+; the plan gate
 * here is presentation only — the server action and the cron sweep both
 * re-enforce it.
 */

interface AgentsViewProps {
  followUpAgentsEnabled: boolean;
  toggles: Record<AgentToggleKey, boolean>;
  stats: AgentStats;
  /** limit null = unlimited (Infinity doesn't cross the RSC boundary). */
  aiQuota: { used: number; limit: number | null };
  contractAutoSendLive: boolean;
  assistantInstructions: string | null;
}

export function AgentsView({
  followUpAgentsEnabled,
  toggles,
  stats,
  aiQuota,
  contractAutoSendLive,
  assistantInstructions,
}: AgentsViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6 lg:px-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">Agents</h1>
        <p className="mt-1 text-[13.5px] font-medium text-ink-mute">
          Your automated team — each one does a job, shows its work, and can be switched on or off.
        </p>
      </div>

      <QuoteAssistantCard quota={aiQuota} />

      {!followUpAgentsEnabled ? (
        <div className="rounded-xl bg-brand-tint/50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-soft">
            <LockSimple size={15} weight="bold" className="flex-shrink-0 text-brand-deep" />
            <span>
              The follow-up agents below are a <b>Solo</b> plan feature. They chase unpaid balances, unbooked
              quotes, and unsigned contracts for you — automatically, in your business&apos;s voice.
            </span>
          </div>
          <UpgradeButton plan="solo">Upgrade to Solo</UpgradeButton>
        </div>
      ) : null}

      <ToggleAgentCard
        icon={CurrencyCircleDollar}
        name="Payment Follow-up"
        job="Emails customers with an unpaid balance a few days before their event, with a secure pay link."
        when="Runs nightly · once per booking, ever"
        toggleKey="remindBalance"
        initial={toggles.remindBalance}
        gated={!followUpAgentsEnabled}
        stat={stats.balance}
      />
      <ToggleAgentCard
        icon={PaperPlaneTilt}
        name="Quote Follow-up"
        job="Checks in on quotes you sent that haven't booked after 3 days, with the link to reserve — warm, never pushy."
        when="Runs nightly · once per quote, ever"
        toggleKey="remindQuote"
        initial={toggles.remindQuote}
        gated={!followUpAgentsEnabled}
        stat={stats.quote}
      />
      <ToggleAgentCard
        icon={PenNib}
        name="Contract Follow-up"
        job="Nudges customers who haven't signed their rental agreement after 48 hours, and re-sends the signing email."
        when="Runs nightly · once per booking, ever"
        toggleKey="remindContract"
        initial={toggles.remindContract}
        gated={!followUpAgentsEnabled}
        stat={stats.contract}
        dormantNote={
          contractAutoSendLive
            ? undefined
            : "Waiting on e-signature go-live — this agent stays dormant until contracts are sent automatically."
        }
      />
      <ToggleAgentCard
        icon={ShieldCheck}
        name="Compliance Watch"
        job="Warns you before your insurance, licenses, permits, or inspection records expire — two weeks ahead."
        when="Runs nightly · free on every plan"
        toggleKey="notifyDocExpiry"
        initial={toggles.notifyDocExpiry}
        gated={false}
        stat={stats.docExpiry}
        link={{ href: "/documents", label: "Manage documents" }}
      />

      <VoicePanel initial={assistantInstructions} />
    </div>
  );
}

/* ── Voice & instructions — shared briefing for every customer-facing agent ── */

function VoicePanel({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [instructions, setInstructions] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = instructions.length > ASSISTANT_INSTRUCTIONS_MAX_CHARS;

  async function saveInstructions() {
    setBusy(true);
    setError(null);
    try {
      const res = await updateAssistantInstructionsAction({ assistantInstructions: instructions });
      if (!res.ok) setError(res.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    } catch {
      setError("Could not save your instructions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <div className="font-display text-[16px] font-bold text-ink">Voice &amp; instructions</div>
      <p className="mt-1 text-[13.5px] font-medium text-ink-mute">
        One briefing for the whole team — tone, what to recommend or upsell, and house rules. Every agent
        that writes to your customers follows it: quotes, follow-ups, and drafted replies. Leave blank to
        use the defaults.
      </p>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={6}
        placeholder="e.g. Keep replies upbeat and casual. Always suggest add-on tables & chairs with a bounce house. We don't deliver more than 30 miles out."
        className="input mt-3 resize-y"
      />
      <div className={`mt-1 text-right text-[12px] font-semibold ${over ? "text-coral-deep" : "text-ink-faint"}`}>
        {instructions.length.toLocaleString()} / {ASSISTANT_INSTRUCTIONS_MAX_CHARS.toLocaleString()}
        {over ? " — too long, please trim" : ""}
      </div>
      <p className="text-[12.5px] font-medium text-ink-mute">
        Agents always follow their core rules first — they never invent prices, items, or availability,
        even if your instructions say otherwise.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={saveInstructions}
          disabled={busy || over}
          className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved ? <span className="text-[13px] font-bold text-teal-deep">Saved</span> : null}
        {error ? <span className="text-[13px] font-semibold text-coral-deep">{error}</span> : null}
      </div>
    </div>
  );
}

/* ── Quote Assistant (always-on v1 — the flagship gets a face, not a switch) ── */

function QuoteAssistantCard({ quota }: { quota: { used: number; limit: number | null } }) {
  const atLimit = quota.limit !== null && quota.used >= quota.limit;
  return (
    <div className="rounded-[20px] border border-sand-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Sparkle size={20} weight="fill" />
          </span>
          <div>
            <div className="font-display text-[16px] font-bold text-ink">Quote Assistant</div>
            <div className="text-[12px] font-semibold text-ink-mute">Acts on every inquiry, instantly</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-teal-tint px-2.5 py-1 text-[12px] font-bold text-teal-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Active
        </span>
      </div>
      <p className="mt-3 text-[13.5px] font-medium text-ink-mute">
        Answers customers on your storefront, by text, and by email — quotes from your real catalog and
        availability, and hands the conversation to you the moment it needs a human.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-ink-soft">
        <span>
          {quota.used.toLocaleString()} AI quote{quota.used === 1 ? "" : "s"} this month
          {quota.limit !== null ? ` · ${quota.limit}/month on the Free plan` : ""}
        </span>
      </div>
      {quota.limit !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand">
            <div
              className={`h-full rounded-full ${atLimit ? "bg-coral" : "bg-brand"}`}
              style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
            />
          </div>
          {atLimit ? (
            <div className="mt-2">
              <div className="text-[13px] font-semibold text-coral-deep">
                Out of AI quotes this month — new inquiries wait for you instead.
              </div>
              <UpgradeButton plan="solo">Upgrade for unlimited quotes</UpgradeButton>
            </div>
          ) : null}
        </div>
      ) : null}
      <Link
        href="/settings"
        className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-brand-deep hover:underline"
      >
        Auto-quote cap in Settings <ArrowRight size={13} weight="bold" />
      </Link>
    </div>
  );
}

/* ── Toggleable agent cards ── */

function ToggleAgentCard({
  icon: CardIcon,
  name,
  job,
  when,
  toggleKey,
  initial,
  gated,
  stat,
  dormantNote,
  link,
}: {
  icon: Icon;
  name: string;
  job: string;
  when: string;
  toggleKey: AgentToggleKey;
  initial: boolean;
  gated: boolean;
  stat: AgentStat;
  dormantNote?: string;
  link?: { href: string; label: string };
}) {
  const { on, busy, error, toggle } = useAgentToggle(toggleKey, initial);
  return (
    <div className={`rounded-[20px] border border-sand-line bg-white p-5 ${gated ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
              on && !gated ? "bg-teal-tint text-teal-deep" : "bg-sand text-ink-mute"
            }`}
          >
            <CardIcon size={20} weight={on && !gated ? "fill" : "regular"} />
          </span>
          <div>
            <div className="font-display text-[16px] font-bold text-ink">{name}</div>
            <div className="text-[12px] font-semibold text-ink-mute">{when}</div>
          </div>
        </div>
        <AgentSwitch checked={on} disabled={gated} busy={busy} onChange={toggle} label={name} />
      </div>
      <p className="mt-3 text-[13.5px] font-medium text-ink-mute">{job}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-ink-soft">
        <span>
          {stat.month} sent this month · {stat.total} all time
        </span>
        {link ? (
          <Link
            href={link.href}
            className="inline-flex items-center gap-1 font-bold text-brand-deep hover:underline"
          >
            {link.label} <ArrowRight size={13} weight="bold" />
          </Link>
        ) : null}
      </div>
      {dormantNote && !gated ? (
        <div className="mt-3 rounded-xl border border-amber-line bg-amber-tint px-3 py-2 text-[12.5px] font-semibold text-amber-deep">
          {dormantNote}
        </div>
      ) : null}
      {error ? <div className="mt-2 text-[12.5px] font-semibold text-coral-deep">{error}</div> : null}
    </div>
  );
}

/** Optimistic toggle: flip locally, persist, revert + surface the error if the
 *  server says no (e.g. the plan gate). router.refresh() reconciles the page. */
function useAgentToggle(key: AgentToggleKey, initial: boolean) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A server refresh delivers fresh props (e.g. the flag was changed from
  // Settings) — re-sync so the two sources can't drift.
  useEffect(() => setOn(initial), [initial]);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const res = await setAgentToggleAction({ key, enabled: next });
      if (!res.ok) {
        setOn(!next);
        setError(res.error);
      } else {
        router.refresh();
      }
    } catch {
      setOn(!next);
      setError("Could not update the agent.");
    } finally {
      setBusy(false);
    }
  }

  return { on, busy, error, toggle };
}

function AgentSwitch({
  checked,
  disabled,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} agent`}
      disabled={disabled || busy}
      onClick={onChange}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
        checked ? "bg-teal" : "bg-sand"
      } ${disabled ? "cursor-not-allowed" : "cursor-pointer"} disabled:opacity-70`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
