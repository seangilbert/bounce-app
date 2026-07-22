import { notFound, redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { getItem } from "@/lib/inventory/repo";
import { checkAvailability, listItemHolds } from "@/lib/inventory/availability";
import { ItemDetail } from "@/components/operator/inventory/ItemDetail";

export const dynamic = "force-dynamic";

/** How far ahead the availability summary looks (the holds list is unbounded). */
const HORIZON_DAYS = 60;

/** Today's date (YYYY-MM-DD) in a given IANA timezone. */
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function InventoryItemPage({ params }: { params: { id: string } }) {
  const membership = await getSessionMembership();
  if (!membership) redirect("/login");
  const op = membership.operator;

  let item;
  try {
    item = await getItem(params.id);
  } catch {
    notFound();
  }
  // Tenant-scope: never let one operator open another operator's item.
  if (!item || item.operatorId !== op.id) notFound();

  // Live availability: upcoming holds + the peak reservation over the horizon.
  const today = todayInTz(op.timezone);
  const horizon = addDays(today, HORIZON_DAYS);
  const [holds, avail] = await Promise.all([
    listItemHolds(op.id, item.id, today),
    checkAvailability(item.id, today, horizon),
  ]);

  return (
    <ItemDetail
      item={item}
      isAdmin={membership.role === "admin"}
      holds={holds}
      availability={{
        owned: avail.owned,
        reserved: avail.reserved,
        available: avail.available,
        horizonDate: horizon,
        horizonDays: HORIZON_DAYS,
      }}
    />
  );
}
