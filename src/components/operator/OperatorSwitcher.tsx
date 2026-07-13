"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CaretUpDown, Check, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { roleLabel } from "@/lib/operator/roles";
import { setActiveOperatorAction } from "@/app/(operator)/operator-switch";
import type { OperatorOption } from "@/lib/operator/session";

/** Switch between the operators a user belongs to. Rendered only when there's
 *  more than one (the parent gates on that). */
export function OperatorSwitcher({ options }: { options: OperatorOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = options.find((o) => o.active) ?? options[0];

  function switchTo(id: string) {
    if (id === active.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await setActiveOperatorAction(id);
      setOpen(false);
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-sand-line bg-white px-2.5 py-2 text-left hover:bg-cream"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">Business</span>
          <span className="block truncate text-[13.5px] font-bold text-ink">{active.name}</span>
        </span>
        {pending ? (
          <CircleNotch size={15} weight="bold" className="animate-spin text-ink-mute" />
        ) : (
          <CaretUpDown size={15} weight="bold" className="flex-shrink-0 text-ink-mute" />
        )}
      </button>

      {open ? (
        <>
          {/* click-away backdrop */}
          <button
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />
          <div className="absolute left-0 right-0 z-20 mt-1 rounded-2xl border border-sand-line bg-white p-1 shadow-lg">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => switchTo(o.id)}
                disabled={pending}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-cream disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">{o.name}</span>
                  <span className="block text-[12px] font-medium text-ink-mute">{roleLabel(o.role)}</span>
                </span>
                {o.active ? <Check size={15} weight="bold" className="flex-shrink-0 text-brand" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
