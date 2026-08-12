import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReminderSweep } from "@/lib/reminders/sweep";

export const dynamic = "force-dynamic";
// The sweep can make several Claude calls — give it headroom.
export const maxDuration = 60;

/**
 * The follow-up agent's entry point — the app's first cron (see vercel.json).
 * Vercel Cron invokes it with `Authorization: Bearer $CRON_SECRET` once that
 * env var is set on the project. Fails closed when unconfigured (mirrors
 * /api/quote's QUOTE_API_SECRET pattern). No rate limiter, deliberately:
 * unlike /api/quote this endpoint is idempotent (claim-before-send means a
 * replay sends nothing new), so constant-time auth alone is enough.
 *
 * Manual trigger for testing:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reminders
 */
function secretMatches(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron is not configured (CRON_SECRET unset)." },
      { status: 503 },
    );
  }
  if (!secretMatches(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runReminderSweep();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/reminders] sweep failed:", err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
