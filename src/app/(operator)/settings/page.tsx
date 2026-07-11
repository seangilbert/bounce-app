import { getSessionOperator } from "@/lib/operator/session";
import { getQuoteQuota } from "@/lib/usage/ai-quotes";
import { SettingsView } from "@/components/operator/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const op = await getSessionOperator();
  if (!op) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  const quota = await getQuoteQuota(op);
  return (
    <SettingsView
      operator={{
        aiQuotaUsed: quota.used,
        // `Infinity` isn't JSON-serializable across the RSC boundary — send null.
        aiQuotaLimit: Number.isFinite(quota.limit) ? quota.limit : null,
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
        deliveryTaxable: op.deliveryTaxable,
        deliveryMode: op.deliveryMode,
        deliveryConfig: op.deliveryConfig,
        cancellationPolicy: op.cancellationPolicy,
        damagePolicy: op.damagePolicy,
        businessAddress: op.businessAddress,
        esignSignerName: op.esignSignerName,
        esignSignerEmail: op.esignSignerEmail,
        notifyNewInquiry: op.notifyNewInquiry,
        notifyNewBooking: op.notifyNewBooking,
        notifyBalancePaid: op.notifyBalancePaid,
        notifyContractSigned: op.notifyContractSigned,
        brandColor: op.brandColor,
        logoUrl: op.logoUrl,
        tagline: op.tagline,
        about: op.about,
        availabilityConfig: op.availabilityConfig,
      }}
    />
  );
}
