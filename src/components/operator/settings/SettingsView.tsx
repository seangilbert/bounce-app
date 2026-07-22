"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES } from "@/lib/operator/time";
import { POLICY_MAX_CHARS, ASSISTANT_INSTRUCTIONS_MAX_CHARS } from "@/lib/operator/policies";
import {
  CheckCircle,
  CircleNotch,
  Storefront as StorefrontIcon,
  CreditCard,
  ArrowSquareOut,
  Trash,
  Plus,
  X,
  Confetti,
  Sparkle,
  Key,
  Copy,
} from "@phosphor-icons/react/dist/ssr";
import {
  updateProfileAction,
  updatePolicyAction,
  updatePricingAction,
  updateDeliveryPricingAction,
  updateCustomerPoliciesAction,
  updateAssistantInstructionsAction,
  updateContractIdentityAction,
  updateNotificationPrefsAction,
  updateBrandingAction,
  updateAvailabilityAction,
  type ActionResult,
} from "@/app/(operator)/settings/actions";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/app/(operator)/settings/developer-actions";
import { normalizeDeliveryConfig } from "@/lib/delivery/pricing";
import { normalizeSchedule } from "@/lib/availability/schedule";
import type { ApiKeyRecord } from "@/lib/api-keys/repo";
import type { MemberRole } from "@/lib/operator/roles";
import type { TeamMember, TeamInvite } from "@/lib/operator/members";
import { TeamSection } from "./TeamSection";
import { ACCENT_COLORS, deriveShades } from "@/lib/branding/palette";

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
  billingExempt: boolean;
  aiQuotaUsed: number;
  /** Monthly AI-quote cap; null = unlimited (paid plan). */
  aiQuotaLimit: number | null;
  connectChargesEnabled: boolean;
  depositPercent: number;
  autoQuoteCapCents: number;
  minLeadHours: number;
  taxPercent: number;
  deliveryFeeCents: number;
  deliveryTaxable: boolean;
  deliveryMode: "flat" | "zones" | "distance";
  deliveryConfig: unknown;
  cancellationPolicy: string | null;
  damagePolicy: string | null;
  businessAddress: string | null;
  esignSignerName: string | null;
  esignSignerEmail: string | null;
  signwellTemplateId: string | null;
  notifyNewInquiry: boolean;
  notifyNewBooking: boolean;
  notifyBalancePaid: boolean;
  notifyContractSigned: boolean;
  brandColor: string | null;
  logoUrl: string | null;
  tagline: string | null;
  about: string | null;
  assistantInstructions: string | null;
  availabilityConfig: unknown;
}

export function SettingsView({
  operator,
  apiAccess,
  apiKeys,
  role,
  currentUserId,
  teamEnabled,
  members,
  invites,
}: {
  operator: OperatorSettings;
  apiAccess: boolean;
  apiKeys: ApiKeyRecord[];
  role: MemberRole;
  currentUserId: string;
  teamEnabled: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">Settings</h1>
      <ProfileSection operator={operator} />
      <BrandingSection operator={operator} />
      <PricingSection operator={operator} />
      <DeliverySection operator={operator} />
      <AvailabilitySection operator={operator} />
      <PolicySection operator={operator} />
      <AssistantSection operator={operator} />
      <CustomerPoliciesSection operator={operator} />
      <ContractSection operator={operator} />
      <NotificationsSection operator={operator} />
      <TeamSection
        teamEnabled={teamEnabled}
        members={members}
        invites={invites}
        currentUserId={currentUserId}
      />
      <DeveloperSection apiAccess={apiAccess} apiKeys={apiKeys} operatorSlug={operator.slug} />
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

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function AvailabilitySection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const seed = normalizeSchedule(operator.availabilityConfig);
  const [days, setDays] = useState<number[]>(seed.operatingDays);
  const [windows, setWindows] = useState<string[]>(seed.deliveryWindows);
  const [blackouts, setBlackouts] = useState(seed.blackouts);
  const [boStart, setBoStart] = useState("");
  const [boEnd, setBoEnd] = useState("");

  const toggleDay = (d: number) =>
    setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()));
  const setWindow = (i: number, v: string) => setWindows((w) => w.map((x, j) => (j === i ? v : x)));
  const removeWindow = (i: number) => setWindows((w) => w.filter((_, j) => j !== i));
  const addBlackout = () => {
    if (!boStart) return;
    const end = boEnd && boEnd >= boStart ? boEnd : boStart;
    setBlackouts((b) => [...b, { start: boStart, end }].sort((x, y) => x.start.localeCompare(y.start)));
    setBoStart("");
    setBoEnd("");
  };
  const removeBlackout = (i: number) => setBlackouts((b) => b.filter((_, j) => j !== i));

  return (
    <Section title="Availability" desc="When you deliver, the windows customers choose, and dates you're closed.">
      <div className="space-y-5">
        {/* Operating days */}
        <div>
          <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Operating days</span>
          <div className="flex flex-wrap gap-1.5">
            {DOW.map((label, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`h-10 w-11 rounded-xl text-[13px] font-bold transition-colors ${
                  days.includes(d) ? "bg-brand text-white" : "bg-cream text-ink-mute hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {days.length === 0 ? (
            <p className="mt-1 text-[12px] font-semibold text-coral-deep">Pick at least one day.</p>
          ) : null}
        </div>

        {/* Delivery windows */}
        <div>
          <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Delivery windows</span>
          <p className="mb-2 text-[12px] font-medium text-ink-mute">Customers pick one at checkout. Leave empty to skip.</p>
          <div className="space-y-2">
            {windows.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={w} onChange={(e) => setWindow(i, e.target.value)} placeholder="8–10am" className="input flex-1" />
                <button
                  onClick={() => removeWindow(i)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-coral-tint hover:text-coral-deep"
                  aria-label="Remove window"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setWindows((w) => [...w, ""])}
            className="mt-2 flex items-center gap-1.5 rounded-full border border-dashed border-sand px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            <Plus size={14} weight="bold" /> Add window
          </button>
        </div>

        {/* Blackout dates */}
        <div>
          <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Blackout dates</span>
          <p className="mb-2 text-[12px] font-medium text-ink-mute">Dates you can&apos;t take bookings (holidays, days off).</p>
          {blackouts.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {blackouts.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-[12.5px] font-bold text-ink-soft">
                  {b.start === b.end ? fmtDay(b.start) : `${fmtDay(b.start)} → ${fmtDay(b.end)}`}
                  <button onClick={() => removeBlackout(i)} className="text-ink-mute hover:text-coral-deep" aria-label="Remove">
                    <X size={13} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={boStart} onChange={(e) => setBoStart(e.target.value)} className="input w-40" />
            <span className="text-[13px] font-semibold text-ink-mute">to</span>
            <input type="date" value={boEnd} min={boStart} onChange={(e) => setBoEnd(e.target.value)} className="input w-40" />
            <button
              onClick={addBlackout}
              disabled={!boStart}
              className="rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-cream transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              Add
            </button>
          </div>
          <p className="mt-1 text-[12px] font-medium text-ink-mute">Leave the second date empty for a single day.</p>
        </div>
      </div>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save(() => updateAvailabilityAction({ operatingDays: days, deliveryWindows: windows.map((w) => w.trim()).filter(Boolean), blackouts }))
        }
      />
    </Section>
  );
}

function BrandingSection({ operator }: { operator: OperatorSettings }) {
  const router = useRouter();
  const { busy, saved, error, save } = useSaver();
  const [color, setColor] = useState(operator.brandColor ?? ACCENT_COLORS[0]!.base);
  const [tagline, setTagline] = useState(operator.tagline ?? "");
  const [about, setAbout] = useState(operator.about ?? "");
  const [logoUrl, setLogoUrl] = useState(operator.logoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const shades = deriveShades(color);

  async function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return setLogoErr("Please choose an image file.");
    if (file.size > 2_097_152) return setLogoErr("Logo too large (2 MB max).");
    setLogoBusy(true);
    setLogoErr(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/settings/logo", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      setLogoUrl(json.url);
      router.refresh();
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    setLogoErr(null);
    try {
      const res = await fetch("/api/settings/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("Remove failed.");
      setLogoUrl(null);
      router.refresh();
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <Section title="Branding" desc="Your color, logo, and copy on the storefront customers see.">
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Logo</span>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sand bg-cream">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Confetti size={26} weight="fill" className="text-brand" />
              )}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-cream transition-opacity hover:opacity-90">
                  {logoBusy ? "Working…" : logoUrl ? "Replace" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoPick} disabled={logoBusy} className="hidden" />
                </label>
                {logoUrl ? (
                  <button onClick={removeLogo} disabled={logoBusy} className="text-[13px] font-bold text-ink-mute transition-colors hover:text-coral-deep">
                    Remove
                  </button>
                ) : null}
              </div>
              <span className="text-[12px] font-medium text-ink-mute">PNG, JPG, or WebP · 2 MB max · square works best.</span>
              {logoErr ? <span className="text-[12px] font-semibold text-coral-deep">{logoErr}</span> : null}
            </div>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-bold text-ink-soft">Brand color</span>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setColor(c.base)}
                title={c.name}
                className={`h-9 w-9 rounded-full transition-transform hover:scale-105 ${
                  color.toLowerCase() === c.base.toLowerCase() ? "ring-2 ring-ink ring-offset-2 ring-offset-white" : ""
                }`}
                style={{ background: c.base }}
              />
            ))}
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-sand px-3 text-[13px] font-bold text-ink-soft">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
              />
              Custom
            </label>
          </div>
          {/* Live preview of the derived shades on the storefront canvas. */}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-cream p-3">
            <span className="rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white" style={{ background: shades.DEFAULT }}>
              Book now
            </span>
            <span
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{ background: shades.tint, color: shades.deep }}
            >
              Instant quote
            </span>
            <span className="ml-auto font-mono text-[12px] font-semibold uppercase text-ink-mute">{color}</span>
          </div>
          <p className="mt-1 text-[12px] font-medium text-ink-mute">Deep, saturated colors read best on the cream storefront.</p>
        </div>

        <Field label="Tagline" hint="Headline on your storefront. Blank = default.">
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={80}
            placeholder="Bouncy fun, delivered to your party."
            className="input"
          />
        </Field>
        <Field label="About" hint="Short blurb under the headline. Blank = default.">
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Tell customers what makes you great — clean equipment, on-time delivery, family-run…"
            className="input resize-none"
          />
        </Field>
      </div>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save(() => updateBrandingAction({ brandColor: color, tagline, about }))}
      />
    </Section>
  );
}

function NotificationsSection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [prefs, setPrefs] = useState({
    notifyNewInquiry: operator.notifyNewInquiry,
    notifyNewBooking: operator.notifyNewBooking,
    notifyBalancePaid: operator.notifyBalancePaid,
    notifyContractSigned: operator.notifyContractSigned,
  });
  const toggle = (k: keyof typeof prefs) => setPrefs((s) => ({ ...s, [k]: !s[k] }));

  const ROWS: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "notifyNewInquiry", label: "New inquiry", desc: "A lead needs your review (over the auto-quote cap or unmatched)." },
    { key: "notifyNewBooking", label: "New booking & payment", desc: "A customer booked and paid a deposit or in full." },
    { key: "notifyBalancePaid", label: "Balance paid", desc: "A customer paid their remaining balance online." },
    { key: "notifyContractSigned", label: "Contract signed", desc: "The rental agreement is fully signed." },
  ];

  return (
    <Section title="Notifications" desc="Which emails you receive. Customers are always notified regardless.">
      <div className="divide-y divide-sand-line">
        {ROWS.map((r) => (
          <label key={r.key} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0">
            <input
              type="checkbox"
              checked={prefs[r.key]}
              onChange={() => toggle(r.key)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-ink-soft">{r.label}</span>
              <span className="block text-[12.5px] font-medium text-ink-mute">{r.desc}</span>
            </span>
          </label>
        ))}
      </div>
      <SaveBar busy={busy} saved={saved} error={error} onSave={() => save(() => updateNotificationPrefsAction(prefs))} />
    </Section>
  );
}

function PolicyCount({ value, max = POLICY_MAX_CHARS }: { value: string; max?: number }) {
  const over = value.length > max;
  return (
    <div className={`mt-1 text-right text-[12px] font-semibold ${over ? "text-coral-deep" : "text-ink-faint"}`}>
      {value.length.toLocaleString()} / {max.toLocaleString()}
      {over ? " — too long, please trim" : ""}
    </div>
  );
}

function AssistantSection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [instructions, setInstructions] = useState(operator.assistantInstructions ?? "");

  return (
    <Section
      title="Assistant instructions"
      desc="Custom guidance for your AI quote assistant — tone, what to recommend or upsell, and house rules. Applies to every inquiry. Leave blank to use the defaults."
    >
      <Field
        label="Instructions"
        hint="e.g. Keep replies upbeat and casual. Always suggest add-on tables & chairs with a bounce house. We don't deliver more than 30 miles out."
      >
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={7}
          placeholder="Tell your assistant how to talk to customers and what to recommend…"
          className="input resize-y"
        />
        <PolicyCount value={instructions} max={ASSISTANT_INSTRUCTIONS_MAX_CHARS} />
      </Field>
      <p className="mt-1 text-[12.5px] text-ink-mute">
        The assistant always follows its core rules first — it never quotes prices itself, invents items,
        or recommends unavailable inventory, even if your instructions say otherwise.
      </p>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save(() => updateAssistantInstructionsAction({ assistantInstructions: instructions }))}
      />
    </Section>
  );
}

function CustomerPoliciesSection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [cancellation, setCancellation] = useState(operator.cancellationPolicy ?? "");
  const [damage, setDamage] = useState(operator.damagePolicy ?? "");

  return (
    <Section
      title="Customer policies"
      desc="Shown at checkout and included in the quote & confirmation emails. Leave blank to omit."
    >
      <div className="space-y-3">
        <Field label="Cancellation policy" hint="e.g. Full refund if canceled 7+ days before the event.">
          <textarea
            value={cancellation}
            onChange={(e) => setCancellation(e.target.value)}
            rows={4}
            placeholder="Describe your cancellation & refund terms…"
            className="input resize-y"
          />
          <PolicyCount value={cancellation} />
        </Field>
        <Field label="Damage & cleaning policy" hint="e.g. Renter is responsible for damage; return clean and dry.">
          <textarea
            value={damage}
            onChange={(e) => setDamage(e.target.value)}
            rows={4}
            placeholder="Describe damage, cleaning, or care terms…"
            className="input resize-y"
          />
          <PolicyCount value={damage} />
        </Field>
      </div>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save(() =>
            updateCustomerPoliciesAction({
              cancellationPolicy: cancellation,
              damagePolicy: damage,
            }),
          )
        }
      />
    </Section>
  );
}

function ContractSection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const [address, setAddress] = useState(operator.businessAddress ?? "");
  const [signerName, setSignerName] = useState(operator.esignSignerName ?? "");
  const [signerEmail, setSignerEmail] = useState(operator.esignSignerEmail ?? "");
  const [templateId, setTemplateId] = useState(operator.signwellTemplateId ?? "");

  return (
    <Section
      title="Rental agreement"
      desc="Your business identity on the e-signed rental contract — so customers sign paperwork from you, not the platform."
    >
      <div className="space-y-3">
        <Field label="Business address" hint="Printed on the contract as your legal/mailing address.">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="123 Main St, Springfield, MA 01000"
            className="input resize-none"
          />
        </Field>
        <Field label="Signer name" hint="Who countersigns on your behalf. Blank = your business name.">
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder={operator.name}
            className="input"
          />
        </Field>
        <Field label="Signer email" hint="Where the countersigning request goes. Blank = your contact email.">
          <input
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder={operator.contactEmail ?? "you@yourbusiness.com"}
            className="input"
          />
        </Field>
        <Field
          label="Custom contract template ID"
          hint="Advanced: your own SignWell template ID to use instead of the default agreement. Blank = platform default."
        >
          <input
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Leave blank to use the standard agreement"
            className="input"
          />
        </Field>
      </div>
      <SaveBar
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save(() =>
            updateContractIdentityAction({
              businessAddress: address,
              esignSignerName: signerName,
              esignSignerEmail: signerEmail,
              signwellTemplateId: templateId,
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
  const [deliveryTaxable, setDeliveryTaxable] = useState(operator.deliveryTaxable);

  return (
    <Section title="Sales tax" desc="Applied to every quote and checkout. 0 = no tax.">
      <Field label="Sales tax %" hint={deliveryTaxable ? "On items + delivery" : "On items only"}>
        <input type="number" min="0" max="100" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className="input" />
      </Field>
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
              deliveryTaxable,
            }),
          )
        }
      />
    </Section>
  );
}

interface ZoneDraft {
  id: string;
  label: string;
  fee: string; // dollars
  zips: string; // comma/space separated
  towns: string; // comma separated
}

function DeliverySection({ operator }: { operator: OperatorSettings }) {
  const { busy, saved, error, save } = useSaver();
  const seed = normalizeDeliveryConfig(operator.deliveryConfig);
  const [mode, setMode] = useState(operator.deliveryMode);
  // Flat fee doubles as the distance-mode base fee.
  const [fee, setFee] = useState(String(Math.round(operator.deliveryFeeCents / 100)));
  const [zones, setZones] = useState<ZoneDraft[]>(
    seed.zones.map((z) => ({
      id: z.id || crypto.randomUUID(),
      label: z.label,
      fee: String(z.feeCents / 100),
      zips: z.zips.join(", "),
      towns: z.towns.join(", "),
    })),
  );
  const [quoteByHand, setQuoteByHand] = useState(seed.outOfAreaCents === null);
  const [outOfArea, setOutOfArea] = useState(
    seed.outOfAreaCents === null ? "" : String(seed.outOfAreaCents / 100),
  );
  const [freeMiles, setFreeMiles] = useState(String(seed.distance.freeMiles || ""));
  const [perMile, setPerMile] = useState(String(seed.distance.perMileCents / 100 || ""));
  const [maxMiles, setMaxMiles] = useState(seed.distance.maxMiles == null ? "" : String(seed.distance.maxMiles));

  const dollars = (s: string) => Math.max(0, Math.round(parseFloat(s || "0") * 100));
  const splitTokens = (s: string) =>
    s.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);

  const addZone = () =>
    setZones((z) => [...z, { id: crypto.randomUUID(), label: "", fee: "", zips: "", towns: "" }]);
  const removeZone = (id: string) => setZones((z) => z.filter((x) => x.id !== id));
  const patchZone = (id: string, patch: Partial<ZoneDraft>) =>
    setZones((z) => z.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const TABS: { key: typeof mode; label: string }[] = [
    { key: "flat", label: "Flat fee" },
    { key: "zones", label: "Service areas" },
    { key: "distance", label: "By distance" },
  ];

  function onSave() {
    const config = {
      zones: zones
        .filter((z) => z.label.trim() || z.zips.trim() || z.towns.trim())
        .map((z) => ({
          id: z.id,
          label: z.label.trim() || "Zone",
          feeCents: dollars(z.fee),
          zips: splitTokens(z.zips),
          towns: splitTokens(z.towns),
        })),
      outOfAreaCents: quoteByHand ? null : dollars(outOfArea),
      distance: {
        freeMiles: Math.max(0, parseFloat(freeMiles || "0")),
        perMileCents: dollars(perMile),
        maxMiles: maxMiles.trim() === "" ? null : Math.max(0, parseFloat(maxMiles)),
      },
    };
    save(() =>
      updateDeliveryPricingAction({ mode, deliveryFeeCents: dollars(fee), config }),
    );
  }

  return (
    <Section title="Delivery pricing" desc="How the delivery fee is calculated on every quote.">
      <div className="mb-4 flex gap-1.5 rounded-xl bg-cream p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors ${
              mode === t.key ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "flat" ? (
        <Field label="Delivery fee ($)" hint="One flat fee added to every booking. 0 = free delivery.">
          <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className="input" />
        </Field>
      ) : null}

      {mode === "distance" ? (
        <div className="space-y-3">
          <p className="text-[12.5px] font-medium text-ink-mute">
            Distance is measured from your service-area address (set under Business profile) to the customer&apos;s delivery address.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Base fee ($)" hint="Added to every delivery">
              <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} className="input" />
            </Field>
            <Field label="Free within (mi)" hint="No per-mile charge inside this radius">
              <input type="number" min="0" value={freeMiles} onChange={(e) => setFreeMiles(e.target.value)} className="input" />
            </Field>
            <Field label="Per mile ($)" hint="Charged beyond the free radius">
              <input type="number" min="0" step="0.01" value={perMile} onChange={(e) => setPerMile(e.target.value)} className="input" />
            </Field>
            <Field label="Max radius (mi)" hint="Beyond this = outside service area. Blank = no limit.">
              <input type="number" min="0" value={maxMiles} onChange={(e) => setMaxMiles(e.target.value)} className="input" />
            </Field>
          </div>
        </div>
      ) : null}

      {mode === "zones" ? (
        <div className="space-y-3">
          <p className="text-[12.5px] font-medium text-ink-mute">
            Match by ZIP (most reliable) or town. First matching area wins.
          </p>
          {zones.map((z) => (
            <div key={z.id} className="rounded-xl border border-sand-line bg-cream p-3">
              <div className="flex items-center gap-2">
                <input
                  value={z.label}
                  onChange={(e) => patchZone(z.id, { label: e.target.value })}
                  placeholder="Area name (e.g. Kingston)"
                  className="input flex-1"
                />
                <div className="flex items-center gap-1">
                  <span className="text-[13px] font-bold text-ink-mute">$</span>
                  <input
                    type="number"
                    min="0"
                    value={z.fee}
                    onChange={(e) => patchZone(z.id, { fee: e.target.value })}
                    placeholder="Fee"
                    className="input w-20"
                  />
                </div>
                <button
                  onClick={() => removeZone(z.id)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-coral-tint hover:text-coral-deep"
                  aria-label="Remove area"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={z.zips}
                  onChange={(e) => patchZone(z.id, { zips: e.target.value })}
                  placeholder="ZIPs: 02360, 02364"
                  className="input"
                />
                <input
                  value={z.towns}
                  onChange={(e) => patchZone(z.id, { towns: e.target.value })}
                  placeholder="Towns: Kingston, Duxbury"
                  className="input"
                />
              </div>
            </div>
          ))}
          <button
            onClick={addZone}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-sand px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            <Plus size={14} weight="bold" /> Add service area
          </button>

          <div className="rounded-xl border border-sand-line p-3">
            <div className="text-[13px] font-bold text-ink-soft">Outside all areas</div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-soft">
              <input
                type="checkbox"
                checked={quoteByHand}
                onChange={(e) => setQuoteByHand(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Quote by hand (no automatic fee — you follow up)
            </label>
            {!quoteByHand ? (
              <div className="mt-2 flex items-center gap-1">
                <span className="text-[13px] font-bold text-ink-mute">$</span>
                <input
                  type="number"
                  min="0"
                  value={outOfArea}
                  onChange={(e) => setOutOfArea(e.target.value)}
                  placeholder="Fee outside your areas"
                  className="input w-40"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <SaveBar busy={busy} saved={saved} error={error} onSave={onSave} />
    </Section>
  );
}

function DeveloperSection({
  apiAccess,
  apiKeys,
  operatorSlug,
}: {
  apiAccess: boolean;
  apiKeys: ApiKeyRecord[];
  operatorSlug: string | null;
}) {
  const router = useRouter();
  const [upgrading, setUpgrading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"publishable" | "secret">("publishable");
  const [origins, setOrigins] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);

  const pubKey = apiKeys.find((k) => k.type === "publishable" && k.plaintext);
  // The widget must load from the PUBLIC host (the storefront), not this operator
  // app host where the operator is copying the snippet — they differ once the
  // domain split is on. Fall back to the current origin when no split is set.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "https://bounce-app.vercel.app");
  const snippet = pubKey ? `<script src="${base}/embed.js" data-key="${pubKey.plaintext}" async></script>` : "";

  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "growing" }),
      });
      const json = await res.json();
      if (res.ok && json.url) window.location.href = json.url;
      else setUpgrading(false);
    } catch {
      setUpgrading(false);
    }
  }

  async function copySnippet() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setSnippetCopied(true);
      setTimeout(() => setSnippetCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  if (!apiAccess) {
    return (
      <Section title="Developers" desc="Embed your AI storefront on your own website.">
        <div className="rounded-xl bg-brand-tint/50 px-4 py-3 text-[13.5px] font-semibold text-ink-soft">
          API keys + the embeddable storefront widget are available on the <b>Growing</b> plan — run
          your catalog, AI quote agent, and checkout on your own domain.
        </div>
        <button
          onClick={upgrade}
          disabled={upgrading}
          className="mt-3 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        >
          {upgrading ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : null} Upgrade to Growing
        </button>
      </Section>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    setNewKey(null);
    const originList = origins.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const res = await createApiKeyAction({
      type,
      name: name.trim() || undefined,
      allowedOrigins: type === "publishable" ? originList : [],
    });
    if (res.ok) {
      setNewKey(res.fullKey);
      setName("");
      setOrigins("");
      router.refresh();
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    setError(null);
    const res = await revokeApiKeyAction(id);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the key is still selectable in the box */
    }
  }

  return (
    <Section title="Developers" desc="API keys to embed your storefront on your own website.">
      {newKey ? (
        <div className="mb-4 rounded-xl border border-teal-line bg-teal-tint p-3">
          <div className="text-[13px] font-bold text-teal-deep">
            Copy your key now — it won&rsquo;t be shown again.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-[12.5px] text-ink">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-ink-mute hover:text-ink"
              aria-label="Copy key"
            >
              {copied ? <CheckCircle size={16} weight="fill" className="text-teal" /> : <Copy size={16} weight="bold" />}
            </button>
          </div>
        </div>
      ) : null}

      {apiKeys.length === 0 ? (
        <p className="text-[13.5px] font-medium text-ink-mute">
          No keys yet. Create a <b>publishable</b> key to embed your storefront.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {apiKeys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-xl border border-sand bg-white px-3 py-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sand/60 text-ink-mute">
                <Key size={16} weight="bold" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-[13px] font-bold text-ink">
                    {k.prefix}_••••{k.last4}
                  </code>
                  <span className="rounded-full bg-sand px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-mute">
                    {k.type === "publishable" ? "publishable" : "secret"}
                  </span>
                </div>
                <div className="truncate text-[12px] font-medium text-ink-mute">
                  {k.name || "Unnamed"}
                  {k.type === "publishable" ? ` · ${k.allowedOrigins.length} origin${k.allowedOrigins.length === 1 ? "" : "s"}` : ""}
                  {k.lastUsedAt ? ` · used ${new Date(k.lastUsedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · never used"}
                </div>
              </div>
              <button
                onClick={() => revoke(k.id)}
                className="flex-shrink-0 rounded-full border border-sand px-3 py-1.5 text-[12.5px] font-bold text-coral-deep transition-colors hover:bg-coral-tint"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-xl border border-sand-line bg-cream p-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. My website)"
            className="input"
          />
          <select value={type} onChange={(e) => setType(e.target.value as "publishable" | "secret")} className="input">
            <option value="publishable">Publishable (browser)</option>
            <option value="secret">Secret (server)</option>
          </select>
        </div>
        {type === "publishable" ? (
          <textarea
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            rows={2}
            placeholder={"Allowed origins, one per line\nhttps://yourdomain.com"}
            className="input resize-none font-mono text-[12.5px]"
          />
        ) : (
          <p className="text-[12px] font-medium text-ink-mute">
            Secret keys are for server-to-server calls — keep them on your backend, never in a browser.
          </p>
        )}
        <button
          onClick={create}
          disabled={busy}
          className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        >
          {busy ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <Plus size={14} weight="bold" />} Create key
        </button>
      </div>

      {error ? (
        <div className="mt-2 rounded-lg bg-coral-tint px-3 py-2 text-sm font-semibold text-coral-deep">{error}</div>
      ) : null}

      <div className="mt-4 rounded-xl border border-sand-line bg-cream p-3">
        <div className="text-[13px] font-bold text-ink-soft">Embed on your website</div>
        {pubKey ? (
          <>
            <p className="mt-0.5 text-[12px] font-medium text-ink-mute">
              Paste this where you want your storefront to appear.
            </p>
            <div className="mt-2 flex items-start gap-2">
              <code className="flex-1 overflow-x-auto whitespace-pre rounded-lg bg-white px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink">
                {snippet}
              </code>
              <button
                onClick={copySnippet}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-ink-mute hover:text-ink"
                aria-label="Copy embed snippet"
              >
                {snippetCopied ? <CheckCircle size={16} weight="fill" className="text-teal" /> : <Copy size={16} weight="bold" />}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] font-medium text-ink-mute">
              Add your site&rsquo;s domain to this key&rsquo;s <b>Allowed origins</b> so the embed can load there.
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-[12px] font-medium text-ink-mute">
            Create a <b>publishable</b> key above to get your copy-paste embed snippet.
          </p>
        )}
      </div>
    </Section>
  );
}

function AccountSection({ operator }: { operator: OperatorSettings }) {
  const [connecting, setConnecting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "solo" }),
      });
      const json = await res.json();
      if (res.ok && json.url) window.location.href = json.url;
      else setUpgrading(false);
    } catch {
      setUpgrading(false);
    }
  }
  const planLabel = operator.billingExempt
    ? "Growing"
    : operator.plan
      ? `${operator.plan[0].toUpperCase()}${operator.plan.slice(1)}`
      : "Free";
  const subLabel = operator.billingExempt
    ? " · complimentary"
    : operator.subscriptionStatus
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

        <Row icon={<Sparkle size={18} weight="fill" />} label="AI quotes">
          {operator.aiQuotaLimit == null ? (
            <span className="font-semibold text-ink">Unlimited</span>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={`font-semibold ${
                  operator.aiQuotaUsed >= operator.aiQuotaLimit ? "text-coral-deep" : "text-ink"
                }`}
              >
                {operator.aiQuotaUsed} / {operator.aiQuotaLimit} this month
              </span>
              {operator.aiQuotaUsed >= operator.aiQuotaLimit ? (
                <button
                  onClick={upgrade}
                  disabled={upgrading}
                  className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white hover:bg-brand-deep disabled:opacity-60"
                >
                  {upgrading ? <CircleNotch size={12} weight="bold" className="animate-spin" /> : null}
                  Upgrade to keep quoting
                </button>
              ) : null}
            </span>
          )}
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
