import { notFound } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { getCustomer, getCustomerActivity } from "@/lib/customers/repo";
import { listDocuments } from "@/lib/documents/repo";
import { CustomerProfile } from "@/components/operator/customers/CustomerProfile";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: { id: string } }) {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const operator = membership.operator;
  const isAdmin = membership.role === "admin";
  const customer = await getCustomer(operator.id, params.id);
  if (!customer) notFound();
  const activity = await getCustomerActivity(operator.id, customer);
  const documents = isAdmin ? await listDocuments(operator.id, { customerId: customer.id }) : [];
  return (
    <CustomerProfile
      operatorId={operator.id}
      customer={customer}
      activity={activity}
      documents={documents}
      isAdmin={isAdmin}
    />
  );
}
