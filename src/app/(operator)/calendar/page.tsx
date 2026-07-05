import { CalendarView } from "@/components/operator/calendar/CalendarView";
import { getDefaultOperator } from "@/lib/inventory/repo";
import { getCalendarMonth } from "@/lib/operator/data";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const operator = await getDefaultOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator configured.</div>;
  }
  const month = await getCalendarMonth(operator.id, 2026, 7);
  return <CalendarView {...month} />;
}
