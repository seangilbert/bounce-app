import Link from "next/link";
import { signupsOpen, earlyAccessHref } from "@/lib/signups";

/**
 * The single marketing signup call-to-action. While signups are open it links
 * to `/signup` with the plan preselected and renders whatever the caller passes
 * (label + icon). While closed it collapses to a "Request early access" mailto,
 * so no CTA on the site leads to a dead form — one flag flips all of them.
 *
 * Renders a plain <a> for the mailto (next/link is for in-app navigation).
 */
export function SignupCta({
  plan = "free",
  className,
  children,
}: {
  plan?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (signupsOpen()) {
    return (
      <Link href={`/signup?plan=${plan}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={earlyAccessHref} className={className}>
      Request early access
    </a>
  );
}
