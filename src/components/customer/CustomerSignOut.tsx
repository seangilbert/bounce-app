"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, SignOut } from "@phosphor-icons/react/dist/ssr";
import { signOutResilient } from "@/lib/auth/sign-out-client";

export function CustomerSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await signOutResilient();
        router.push("/my/login");
        router.refresh();
      }}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-2xl border border-sand bg-white px-3.5 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring disabled:opacity-60"
    >
      {busy ? (
        <CircleNotch size={15} weight="bold" className="animate-spin" />
      ) : (
        <SignOut size={15} weight="bold" />
      )}
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
