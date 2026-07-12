import { resolveOperatorByKey } from "@/lib/api-keys/repo";
import { planCapabilities } from "@/lib/plans";
import { StoreShell } from "@/components/store/Storefront";

export const dynamic = "force-dynamic";

/**
 * The embeddable storefront — loaded inside an iframe on an operator's own site
 * (via embed.js). Resolves the operator from the publishable key in the query,
 * gated to the Growing plan. Rendered in `embed` mode: no app nav, just the
 * conversational storefront, with resize + checkout bridged to the parent page.
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: { key?: string; return?: string };
}) {
  const resolved = await resolveOperatorByKey(searchParams.key ?? null);
  const ok =
    resolved && resolved.key.type === "publishable" && planCapabilities(resolved.operator).apiAccess;

  if (!ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-6 text-center">
        <p className="text-sm font-semibold text-ink-mute">This storefront isn&rsquo;t available.</p>
      </div>
    );
  }

  // Only honor a return URL whose origin the operator registered — never an
  // arbitrary one (open-redirect / checkout-return safety).
  let returnUrl: string | null = null;
  if (searchParams.return) {
    try {
      if (resolved.key.allowedOrigins.includes(new URL(searchParams.return).origin)) {
        returnUrl = searchParams.return;
      }
    } catch {
      /* malformed return — ignore */
    }
  }

  const op = resolved.operator;
  return (
    <StoreShell
      embed
      returnUrl={returnUrl}
      operatorId={op.id}
      slug={op.slug ?? ""}
      brandColor={op.brandColor}
      operatorName={op.name}
      logoUrl={op.logoUrl}
      tagline={op.tagline}
      about={op.about}
    />
  );
}
