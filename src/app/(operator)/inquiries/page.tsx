import { InquiriesView } from "@/components/operator/inquiries/InquiriesView";
import { getSessionOperator } from "@/lib/operator/session";
import { getInquiries } from "@/lib/operator/data";
import { smsEnabled } from "@/lib/sms";
import { planCapabilities } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const operator = await getSessionOperator();
  if (!operator) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const { list, details, filters } = await getInquiries(operator.id);
  return (
    <InquiriesView
      list={list}
      details={details}
      filters={filters}
      operatorId={operator.id}
      // Texting needs Twilio configured AND a plan that includes the SMS
      // channel (per-message cost — docs/pricing-plan.md R2). The actions
      // re-enforce both; hiding the toggle is the UX half.
      smsEnabled={smsEnabled() && planCapabilities(operator).smsChannel}
    />
  );
}
