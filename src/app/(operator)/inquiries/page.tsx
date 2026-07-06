import { InquiriesView } from "@/components/operator/inquiries/InquiriesView";
import { getSessionOperator } from "@/lib/operator/session";
import { getInquiries } from "@/lib/operator/data";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const { list, details, filters } = await getInquiries(operator.id);
  return <InquiriesView list={list} details={details} filters={filters} />;
}
