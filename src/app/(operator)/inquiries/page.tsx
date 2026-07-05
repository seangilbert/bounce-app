import { InquiriesView } from "@/components/operator/inquiries/InquiriesView";
import { getDefaultOperator } from "@/lib/inventory/repo";
import { getInquiries } from "@/lib/operator/data";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const operator = await getDefaultOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator configured.</div>;
  }
  const { list, details, filters } = await getInquiries(operator.id);
  return <InquiriesView list={list} details={details} filters={filters} />;
}
