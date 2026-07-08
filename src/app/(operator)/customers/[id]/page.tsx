import { notFound } from "next/navigation";
import { getSessionOperator } from "@/lib/operator/session";
import { getCustomer, getCustomerActivity } from "@/lib/customers/repo";
import { CustomerProfile } from "@/components/operator/customers/CustomerProfile";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: { id: string } }) {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const customer = await getCustomer(operator.id, params.id);
  if (!customer) notFound();
  const activity = await getCustomerActivity(operator.id, customer);
  return <CustomerProfile operatorId={operator.id} customer={customer} activity={activity} />;
}
