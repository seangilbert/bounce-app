import { redirect } from "next/navigation";
import { getSessionOperator } from "@/lib/operator/session";
import { listItems } from "@/lib/inventory/repo";
import { OnboardingWizard } from "@/components/operator/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const op = await getSessionOperator();
  if (!op) redirect("/login");
  const items = await listItems(op.id);

  return (
    <OnboardingWizard
      businessName={op.name}
      location={op.location}
      itemCount={items.length}
      paymentsConnected={op.connectChargesEnabled}
    />
  );
}
