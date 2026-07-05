import { Wrench } from "@phosphor-icons/react/dist/ssr";

/** Placeholder for operator screens not yet built. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sand text-ink-mute">
        <Wrench size={26} />
      </div>
      <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="text-sm font-medium text-ink-mute">Coming soon.</p>
    </div>
  );
}
