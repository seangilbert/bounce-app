import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/api/with-api-key";
import { buildStorefrontCatalog } from "@/lib/storefront/catalog";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/catalog?start=&end=  (or ?date=)
 * Public catalog + live availability for the key's operator. Publishable key.
 */
const handler = withApiKey(async (req, { operator }) => {
  const params = new URL(req.url).searchParams;
  const date = params.get("date");
  const start = params.get("start") ?? date;
  const end = params.get("end") ?? date;

  for (const [k, v] of [["start", start], ["end", end]] as const) {
    if (v !== null && !ISO_DATE.test(v)) {
      return NextResponse.json({ error: `Invalid \`${k}\` — expected YYYY-MM-DD.` }, { status: 400 });
    }
  }
  if (start && end && end < start) {
    return NextResponse.json({ error: "`end` must be on or after `start`." }, { status: 400 });
  }

  const catalog = await buildStorefrontCatalog(operator, { start, end });
  return NextResponse.json(catalog, { headers: { "Cache-Control": "no-store" } });
}, { require: "publishable" });

export { handler as GET, handler as OPTIONS };
