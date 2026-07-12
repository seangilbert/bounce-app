import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { getQuoteQuota } from "@/lib/usage/ai-quotes";
import { planCapabilities } from "@/lib/plans";
import { listApiKeys } from "@/lib/api-keys/repo";
import { listMembers, listPendingInvites } from "@/lib/operator/members";
import { SettingsView } from "@/components/operator/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const membership = await getSessionMembership();
  if (!membership) {
    return <div className="p-8 text-ink-mute">No operator linked to your account.</div>;
  }
  if (membership.role !== "admin") redirect("/dashboard"); // employees: no settings
  const op = membership.operator;
  const quota = await getQuoteQuota(op);
  const apiAccess = planCapabilities(op).apiAccess;
  const apiKeys = apiAccess ? await listApiKeys(op.id) : [];
  const teamEnabled = planCapabilities(op).teamMembers;
  const members = await listMembers(op.id);
  const invites = await listPendingInvites(op.id);
  return (
    <SettingsView
      role={membership.role}
      currentUserId={membership.userId}
      teamEnabled={teamEnabled}
      members={members}
      invites={invites}
      apiAccess={apiAccess}
      apiKeys={apiKeys}
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
        signwellTemplateId: op.signwellTemplateId,
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
