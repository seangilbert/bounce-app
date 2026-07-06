import { CalendarView } from "@/components/operator/calendar/CalendarView";
import { getSessionOperator } from "@/lib/operator/session";
import { getCalendarMonth } from "@/lib/operator/data";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const month = await getCalendarMonth(operator.id, 2026, 7);
  return <CalendarView {...month} />;
}
