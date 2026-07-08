import { DeliveriesView } from "@/components/operator/deliveries/DeliveriesView";
import { getSessionOperator } from "@/lib/operator/session";
import { getDeliveryRoute } from "@/lib/operator/deliveries";

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

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dateIso = searchParams.d && ISO.test(searchParams.d) ? searchParams.d : today;

  const route = await getDeliveryRoute(operator.id, dateIso);
  return <DeliveriesView route={route} />;
}
