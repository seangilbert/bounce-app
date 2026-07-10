"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES } from "@/lib/operator/time";
import {
  CheckCircle,
  CircleNotch,
  Storefront as StorefrontIcon,
  CreditCard,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import {
  updateProfileAction,
  updatePolicyAction,
  updatePricingAction,
  type ActionResult,
} from "@/app/(operator)/settings/actions";

interface OperatorSettings {
  name: string;
  ownerName: string | null;
  phone: string | null;
  location: string | null;
  timezone: string;
  contactEmail: string | null;
  slug: string | null;
  plan: string;
  subscriptionStatus: string | null;
  connectChargesEnabled: boolean;
  depositPercent: number;
  autoQuoteCapCents: number;
  minLeadHours: number;
  taxPercent: number;
  deliveryFeeCents: number;
  deliveryTaxable: boolean;
}

export function SettingsView({ operator }: { operator: OperatorSettings }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">Settings</h1>
      <ProfileSection operator={operator} />
      <PricingSection operator={operator} />
      <PolicySection operator={operator} />
      <AccountSection operator={operator} />
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await action();
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(res.error);
    }
  }
  return { busy, saved, error, save };
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sand-line bg-white p-5">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {desc ? <p className="mt-0.5 text-[13.5px] font-medium text-ink-mute">{desc}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] font-medium text-ink-mute">{hint}</span> : null}
    </label>
  );
}

function SaveBar({
  busy,
  saved,
  error,
  onSave,
}: {
  busy: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
      >
        {busy ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null} Save
      </button>
      {saved ? (
        <span className="flex items-center gap-1 text-sm font-bold text-teal">
          <CheckCircle size={16} weight="fill" /> Saved
        </span>
      ) : null}
      {error ? <span className="text-sm font-semibold text-coral-deep">{error}</span> : null}
    </div>
  );
}

function ProfileSection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [f, setF] = useState({
    name: operator.name,
    ownerName: operator.ownerName ?? "",
    phone: operator.phone ?? "",
    location: operator.location ?? "",
    timezone: operator.timezone,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Section title="Business profile" desc="Shown on your storefront and dashboard.">
      <div className="space-y-3">
        <Field label="Business name">
          <input value={f.name} onChange={set("name")} className="input" />
        </Field>
        <Field label="Your name">
          <input value={f.ownerName} onChange={set("ownerName")} placeholder="Cheri Boyd" className="input" />
        </Field>
        <Field label="Phone">
          <input value={f.phone} onChange={set("phone")} placeholder="(508) 555-1234" className="input" />
        </Field>
        <Field label="Service area" hint="City, State — sets your local weather and storefront area.">
          <input value={f.location} onChange={set("location")} placeholder="Plymouth, MA" className="input" />
        </Field>
        <Field label="Timezone" hint="Sets 'today' for your calendar, route, and dashboard.">
          <select
            value={f.timezone}
            onChange={(e) => setF((s) => ({ ...s, timezone: e.target.value }))}
            className="input"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Field>
        {operator.contactEmail ? (
          <Field label="Login email">
            <input value={operator.contactEmail} disabled className="input opacity-60" />
          </Field>
        ) : null}
      </div>
      <SaveBar busy={busy} saved={saved} error={error} onSave={() => save(() => updateProfileAction(f))} />
    </Section>
  );
}

function PolicySection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [deposit, setDeposit] = useState(String(operator.depositPercent));
  const [cap, setCap] = useState(String(Math.round(operator.autoQuoteCapCents / 100)));
  const [lead, setLead] = useState(String(operator.minLeadHours));

  return (
    <Section title="Booking policies" desc="How the AI quote assistant and checkout behave.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Deposit %" hint="Collected at checkout">
          <input type="number" min="0" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input" />
        </Field>
        <Field label="Auto-quote cap ($)" hint="Above this → your review">
          <input type="number" min="0" value={cap} onChange={(e) => setCap(e.target.value)} className="input" />
        </Field>
        <Field label="Min lead time (hrs)" hint="Sooner → your review">
          <input type="number" min="0" value={lead} onChange={(e) => setLead(e.target.value)} className="input" />
        </Field>
      </div>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save(() =>
            updatePolicyAction({
              depositPercent: parseInt(deposit || "0", 10),
              autoQuoteCapCents: Math.round(parseFloat(cap || "0") * 100),
              minLeadHours: parseInt(lead || "0", 10),
            }),
          )
        }
      />
    </Section>
  );
}

function PricingSection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [tax, setTax] = useState(String(operator.taxPercent));
  const [delivery, setDelivery] = useState(String(Math.round(operator.deliveryFeeCents / 100)));
  const [deliveryTaxable, setDeliveryTaxable] = useState(operator.deliveryTaxable);

  return (
    <Section title="Pricing" desc="Applied to every quote and checkout. 0 = free delivery / no tax.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Sales tax %" hint={deliveryTaxable ? "On items + delivery" : "On items only"}>
          <input type="number" min="0" max="100" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className="input" />
        </Field>
        <Field label="Delivery fee ($)" hint="Flat fee per booking">
          <input type="number" min="0" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="input" />
        </Field>
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={deliveryTaxable}
          onChange={(e) => setDeliveryTaxable(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand"
        />
        <span className="text-[13px] font-medium text-ink-soft">
          Charge sales tax on the delivery fee
          <span className="mt-0.5 block text-[12px] font-medium text-ink-mute">
            Turn off where delivery isn&apos;t taxable (e.g. Massachusetts taxes rental items but not separately-stated delivery).
          </span>
        </span>
      </label>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save(() =>
            updatePricingAction({
              taxPercent: parseFloat(tax || "0"),
              deliveryFeeCents: Math.round(parseFloat(delivery || "0") * 100),
              deliveryTaxable,
            }),
          )
        }
      />
    </Section>
  );
}

function AccountSection({ operator }: { operator: OperatorSettings }) {
  const [connecting, setConnecting] = useState(false);
  const planLabel = operator.plan
    ? `${operator.plan[0].toUpperCase()}${operator.plan.slice(1)}`
    : "Free";
  const subLabel = operator.subscriptionStatus
    ? ` · ${operator.subscriptionStatus}`
    : operator.plan === "free"
      ? ""
      : " · not active";

  async function connect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/connect/onboard", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.url) window.location.href = json.url;
      else setConnecting(false);
    } catch {
      setConnecting(false);
    }
  }

  return (
    <Section title="Storefront & account">
      <div className="space-y-3">
        <Row icon={<StorefrontIcon size={18} weight="fill" />} label="Storefront">
          {operator.slug ? (
            <a
              href={`/s/${operator.slug}`}
              target="_blank"
              className="flex items-center gap-1 font-bold text-brand hover:text-brand-deep"
            >
              /s/{operator.slug} <ArrowSquareOut size={13} weight="bold" />
            </a>
          ) : (
            <span className="font-medium text-ink-mute">Not set</span>
          )}
        </Row>

        <Row icon={<CreditCard size={18} weight="fill" />} label="Plan">
          <span className="font-semibold text-ink">
            {planLabel}
            {subLabel}
          </span>
        </Row>

        <Row icon={<CreditCard size={18} weight="fill" />} label="Payments">
          {operator.connectChargesEnabled ? (
            <span className="flex items-center gap-1 font-bold text-teal">
              <CheckCircle size={16} weight="fill" /> Connected
            </span>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
            >
              {connecting ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : null} Connect Stripe
            </button>
          )}
        </Row>
      </div>
    </Section>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sand-line pb-3 last:border-0 last:pb-0">
      <span className="flex items-center gap-2.5 text-sm font-bold text-ink-soft">
        <span className="text-ink-mute">{icon}</span>
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
