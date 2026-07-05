import { NextResponse } from "next/server";
import { getDefaultOperator, listItems } from "@/lib/inventory/repo";

export const dynamic = "force-dynamic";

/**
 * Public catalog for the storefront: the active operator's active items.
 *
 * Availability for a given date is layered on in Milestone 2 (?date=...).
 */
export async function GET() {
  try {
    const operator = await getDefaultOperator();
    if (!operator) {
      return NextResponse.json({ error: "No operator configured." }, { status: 503 });
    }
    const items = await listItems(operator.id, { activeOnly: true });
    return NextResponse.json({ operator, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
