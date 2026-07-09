import { getSessionOperator } from "@/lib/operator/session";
import { listCustomers } from "@/lib/customers/repo";
import { CustomersView } from "@/components/operator/customers/CustomersView";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const customers = await listCustomers(operator.id);
  return <CustomersView customers={customers} initialQuery={searchParams.q ?? ""} />;
}
