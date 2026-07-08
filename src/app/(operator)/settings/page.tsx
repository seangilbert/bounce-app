import { getSessionOperator } from "@/lib/operator/session";
import { SettingsView } from "@/components/operator/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const op = await getSessionOperator();
  if (!op) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  return (
    <SettingsView
      operator={{
        name: op.name,
        ownerName: op.ownerName,
        phone: op.phone,
        location: op.location,
        timezone: op.timezone,
        contactEmail: op.contactEmail,
        slug: op.slug,
        plan: op.plan,
        subscriptionStatus: op.subscriptionStatus,
        connectChargesEnabled: op.connectChargesEnabled,
        depositPercent: op.depositPercent,
        autoQuoteCapCents: op.autoQuoteCapCents,
        minLeadHours: op.minLeadHours,
        taxPercent: op.taxPercent,
        deliveryFeeCents: op.deliveryFeeCents,
      }}
    />
  );
}
