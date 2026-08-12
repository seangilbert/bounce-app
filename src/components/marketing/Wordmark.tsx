import Link from "next/link";

/** The Movables logo lockup — mark + wordmark. Links home unless `asLink={false}`. */
export function Wordmark({ asLink = true }: { asLink?: boolean }) {
  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/movables-logo.png" alt="Movables" className="h-8 w-auto" />
  );
  return asLink ? (
    <Link href="/" aria-label="Movables home" className="inline-flex">
      {inner}
    </Link>
  ) : (
    inner
  );
}
