import { NextResponse } from "next/server";
import { getDefaultOperator, listItems } from "@/lib/inventory/repo";
import { availabilityForOperator } from "@/lib/inventory/availability";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Public catalog for the storefront: the active operator's active items.
 * With `?date=YYYY-MM-DD`, each item is annotated with availability for that day.
 */
export async function GET(req: Request) {
  try {
    const operator = await getDefaultOperator();
    if (!operator) {
      return NextResponse.json({ error: "No operator configured." }, { status: 503 });
    }

    const date = new URL(req.url).searchParams.get("date");
    if (date !== null && !ISO_DATE.test(date)) {
      return NextResponse.json(
        { error: "Invalid `date` — expected YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const items = date
      ? await availabilityForOperator(operator.id, date)
      : await listItems(operator.id, { activeOnly: true });

    return NextResponse.json({ operator, date, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
