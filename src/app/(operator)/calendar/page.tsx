import { CalendarView } from "@/components/operator/calendar/CalendarView";
import { getSessionOperator } from "@/lib/operator/session";
import { getCalendarData } from "@/lib/operator/data";
import { isCatFilter } from "@/lib/operator/calendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { y?: string; m?: string; cat?: string };
}) {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }

  const now = new Date();
  const year = Number(searchParams.y) || now.getFullYear();
  const monthRaw = Number(searchParams.m) || now.getMonth() + 1;
  const month = Math.min(12, Math.max(1, monthRaw));
  const category = isCatFilter(searchParams.cat) ? searchParams.cat : "all";

  const data = await getCalendarData(operator.id, year, month, category);
  return <CalendarView data={data} />;
}
