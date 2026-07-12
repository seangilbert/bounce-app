import Link from "next/link";
import { Confetti } from "@phosphor-icons/react/dist/ssr";

/** The Bounce logo lockup — mark + wordmark. Links home unless `asLink={false}`. */
export function Wordmark({ asLink = true }: { asLink?: boolean }) {
  const inner = (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand text-white">
        <Confetti size={19} weight="fill" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">Bounce</span>
    </span>
  );
  return asLink ? (
    <Link href="/" aria-label="Bounce home">
      {inner}
    </Link>
  ) : (
    inner
  );
}
