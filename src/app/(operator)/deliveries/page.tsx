import { DeliveriesView } from "@/components/operator/deliveries/DeliveriesView";
import { getSessionOperator } from "@/lib/operator/session";
import { getDeliveryRoute } from "@/lib/operator/deliveries";
import { operatorToday } from "@/lib/operator/time";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: { d?: string };
}) {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }

  const dateIso = searchParams.d && ISO.test(searchParams.d) ? searchParams.d : operatorToday(operator.timezone);

  const route = await getDeliveryRoute(operator.id, dateIso, operator.timezone);
  return <DeliveriesView route={route} />;
}
