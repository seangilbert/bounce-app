import { getSessionMembership } from "@/lib/operator/session";
import { listCustomers } from "@/lib/customers/repo";
import { CustomersView } from "@/components/operator/customers/CustomersView";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const customers = await listCustomers(membership.operator.id);
  return (
    <CustomersView
      customers={customers}
      initialQuery={searchParams.q ?? ""}
      isAdmin={membership.role === "admin"}
    />
  );
}
