import type { Operator } from "@/lib/inventory/types";
import { normalizeSchedule, type BlackoutRange } from "@/lib/availability/schedule";
import { normalizeDeliveryConfig } from "@/lib/delivery/pricing";
import type { AssistantPromo } from "@/lib/promos/repo";

/**
 * The structured CONFIG block for the quote assistant — firm operating facts &
 * constraints derived from the operator's OWN live settings (service area,
 * hours, blackout dates, lead time, deposit terms, active auto-promos). It is
 * always assembled from data, never free text, so an operator can't accidentally
 * blank it out — and it can't drift from their real settings.
 *
 * Deliberately states NO prices: pricing (item prices, deposit amount, promo
 * discounts, tax, delivery fees) is computed and displayed by the system after
 * the assistant picks items + date. This block gives the assistant what it must
 * KNOW to avoid impossible recommendations, not numbers to quote.
 */

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function serviceAreaLine(operator: Operator): string {
  const where = operator.location ? ` around ${operator.location}` : "";
  if (operator.deliveryMode === "distance") {
    const { distance } = normalizeDeliveryConfig(operator.deliveryConfig);
    return distance.maxMiles
      ? `Service area: delivers within ${distance.maxMiles} miles${where}. Don't promise delivery beyond that range.`
      : `Service area: delivers by distance${where}.`;
  }
  if (operator.deliveryMode === "zones") {
    const cfg = normalizeDeliveryConfig(operator.deliveryConfig);
    const labels = cfg.zones.map((z) => z.label).filter(Boolean);
    if (labels.length) {
      const out = cfg.outOfAreaCents == null ? " Doesn't deliver outside these areas." : "";
      return `Service area (delivery zones): ${labels.join(", ")}.${out}`;
    }
  }
  return `Service area: delivers${where}.`;
}

function operatingDaysLine(days: number[]): string {
  if (days.length >= 7) return "Operating days: open any day of the week.";
  const names = days.map((d) => DAY_ABBR[d]).filter(Boolean).join(", ");
  return `Operating days: ${names || "none configured"}. Don't book events on other days.`;
}

function leadTimeLine(hours: number): string | null {
  if (!hours || hours <= 0) return null;
  const human = hours % 24 === 0 ? `${hours / 24} day${hours / 24 === 1 ? "" : "s"}` : `${hours} hours`;
  return `Advance notice: needs at least ${human} before the event — don't book anything sooner than that from today.`;
}

function blackoutLine(blackouts: BlackoutRange[], today: string): string | null {
  const future = blackouts
    .filter((b) => b.end >= today)
    .slice(0, 8)
    .map((b) => (b.start === b.end ? fmtDate(b.start) : `${fmtDate(b.start)}–${fmtDate(b.end)}`));
  return future.length ? `Closed / blackout dates (do NOT book these): ${future.join("; ")}.` : null;
}

function promoLine(promos: AssistantPromo[]): string | null {
  if (!promos.length) return null;
  const parts = promos.map((p) =>
    p.trigger === "weekday"
      ? `a weekday discount (${p.weekdays.map((d) => DAY_ABBR[d]).filter(Boolean).join("/") || "select days"})`
      : "a repeat-customer discount",
  );
  return `Automatic promotions the system may apply at checkout: ${parts.join("; ")}. You may note a discount might apply, but never state amounts — the system calculates all pricing.`;
}

export function buildOperatorConfig(operator: Operator, today: string, promos: AssistantPromo[]): string {
  const sched = normalizeSchedule(operator.availabilityConfig);
  const lines: string[] = [serviceAreaLine(operator), operatingDaysLine(sched.operatingDays)];

  if (sched.deliveryWindows.length) lines.push(`Delivery time windows: ${sched.deliveryWindows.join("; ")}.`);

  const lead = leadTimeLine(operator.minLeadHours);
  if (lead) lines.push(lead);

  const blackout = blackoutLine(sched.blackouts, today);
  if (blackout) lines.push(blackout);

  lines.push(
    "Deposit: a deposit is required to confirm a booking; the system calculates and shows it — never quote the deposit or any price yourself.",
  );

  const promo = promoLine(promos);
  if (promo) lines.push(promo);

  return lines.map((l) => `- ${l}`).join("\n");
}
