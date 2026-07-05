import type { Operator } from "@/lib/inventory/types";
import type { Stop } from "./mock";

/**
 * Weather advisory for the operator's dashboard, from a live Open-Meteo forecast
 * (free, no API key). We surface an advisory only when meaningful rain is likely
 * during the working day, tied to today's first delivery so the operator can
 * give the customer a heads-up.
 */
export interface WeatherAdvisory {
  headline: string; // e.g. "Rain likely 2–4 PM"
  detail: string;
  tone: "warn";
}

const RAIN_PROB_THRESHOLD = 55; // percent
const DAY_START = 8; // 8 AM
const DAY_END = 20; // 8 PM
const TIMEZONE = "America/New_York";

function fmtRange(start: number, end: number): string {
  const period = (h: number) => (h >= 12 ? "PM" : "AM");
  const h12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
  return period(start) === period(end)
    ? `${h12(start)}–${h12(end)} ${period(end)}`
    : `${h12(start)} ${period(start)}–${h12(end)} ${period(end)}`;
}

export async function getWeatherAdvisory(
  operator: Pick<Operator, "latitude" | "longitude" | "location">,
  stops: Stop[],
): Promise<WeatherAdvisory | null> {
  if (operator.latitude == null || operator.longitude == null) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${operator.latitude}` +
    `&longitude=${operator.longitude}&hourly=precipitation_probability` +
    `&timezone=${encodeURIComponent(TIMEZONE)}&forecast_days=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30 min cache
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hourly?: { time: string[]; precipitation_probability: number[] };
    };
    const times = data.hourly?.time ?? [];
    const probs = data.hourly?.precipitation_probability ?? [];

    const rainyHours: number[] = [];
    for (let i = 0; i < times.length; i++) {
      const hour = Number(times[i].slice(11, 13)); // "YYYY-MM-DDTHH:MM"
      if (hour >= DAY_START && hour <= DAY_END && (probs[i] ?? 0) >= RAIN_PROB_THRESHOLD) {
        rainyHours.push(hour);
      }
    }
    if (rainyHours.length === 0) return null;

    const start = rainyHours[0];
    const end = rainyHours[rainyHours.length - 1] + 1; // window end (exclusive hour)
    const where = operator.location ?? "your area";
    const firstDeliver = stops.find((s) => s.type === "DELIVER");
    const detail = firstDeliver
      ? `Could affect the ${firstDeliver.customer} ${firstDeliver.time} ${firstDeliver.meridiem} setup in ${where}. Send them a heads-up.`
      : `Plan today's setups in ${where} around it.`;

    return { headline: `Rain likely ${fmtRange(start, end)}`, detail, tone: "warn" };
  } catch {
    return null; // never let weather break the dashboard
  }
}
