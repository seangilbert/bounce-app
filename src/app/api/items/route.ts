import { NextResponse } from "next/server";
import { getDefaultOperator, listItems } from "@/lib/inventory/repo";
import { availabilityForOperator } from "@/lib/inventory/availability";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Public catalog for the storefront: the active operator's active items.
 * Availability is annotated when a range is given:
 *   `?start=YYYY-MM-DD&end=YYYY-MM-DD`  (multi-day), or
 *   `?date=YYYY-MM-DD`                  (single-day shorthand).
 */
export async function GET(req: Request) {
  try {
    const operator = await getDefaultOperator();
    if (!operator) {
      return NextResponse.json({ error: "No operator configured." }, { status: 503 });
    }

    const params = new URL(req.url).searchParams;
    const date = params.get("date");
    const start = params.get("start") ?? date;
    const end = params.get("end") ?? date;

    for (const [k, v] of [["start", start], ["end", end]] as const) {
      if (v !== null && !ISO_DATE.test(v)) {
        return NextResponse.json(
          { error: `Invalid \`${k}\` — expected YYYY-MM-DD.` },
          { status: 400 },
        );
      }
    }
    if (start && end && end < start) {
      return NextResponse.json({ error: "`end` must be on or after `start`." }, { status: 400 });
    }

    const items =
      start && end
        ? await availabilityForOperator(operator.id, start, end)
        : await listItems(operator.id, { activeOnly: true });

    // Availability is real-time — never let a browser/CDN serve a stale copy.
    return NextResponse.json(
      { operator, startDate: start, endDate: end, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
