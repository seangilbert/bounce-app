import Link from "next/link";
import { Confetti, CheckCircle, EnvelopeSimple, Signature } from "@phosphor-icons/react/dist/ssr";

export const metadata = { title: "You're booked" };

export default function BookingSuccessPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-md rounded-[28px] border border-sand-line bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-tint text-teal">
          <CheckCircle size={36} weight="fill" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink">
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-[15px] font-medium leading-relaxed text-ink-soft">
          Your deposit is paid and your date is reserved. Here&apos;s what happens next:
        </p>

        <ul className="mt-6 flex flex-col gap-3 text-left">
          <li className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3">
            <EnvelopeSimple size={22} weight="fill" className="flex-shrink-0 text-brand" />
            <span className="text-sm font-semibold text-ink">
              A receipt is on its way to your email.
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3">
            <Signature size={22} weight="fill" className="flex-shrink-0 text-brand" />
            <span className="text-sm font-semibold text-ink">
              You&apos;ll get a rental agreement to e-sign.
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3">
            <Confetti size={22} weight="fill" className="flex-shrink-0 text-brand" />
            <span className="text-sm font-semibold text-ink">
              We deliver, set up, and pick up — you just party.
            </span>
          </li>
        </ul>

        <Link
          href="/book"
          className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          Back to store
        </Link>
      </div>
    </div>
  );
}
