import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/operator/session";
import { getSetupProgress } from "@/lib/operator/setup";
import { publicUrl } from "@/lib/urls";
import { SetupGuide } from "@/components/operator/setup/SetupGuide";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const membership = await getSessionMembership();
  if (!membership) redirect("/login");
  // Setting the business up is admin work (and the steps land on admin-only
  // pages) — employees go straight to the dashboard.
  if (membership.role !== "admin") redirect("/dashboard");
  const op = membership.operator;

  const progress = await getSetupProgress(op);
  const storefrontPath = op.slug ? `/s/${op.slug}` : "/book";

  return (
    <SetupGuide
      businessName={op.name}
      location={op.location}
      storefrontPath={storefrontPath}
      storefrontUrl={publicUrl(storefrontPath)}
      brandColor={op.brandColor}
      logoUrl={op.logoUrl}
      progress={progress}
    />
  );
}
