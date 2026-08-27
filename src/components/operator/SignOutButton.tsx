"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, SignOut } from "@phosphor-icons/react/dist/ssr";
import { signOutResilient } from "@/lib/auth/sign-out-client";

/** Full-width sign-out row (used on the mobile "More" screen). */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await signOutResilient();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-cream disabled:opacity-60"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-tint text-coral-deep">
        {busy ? <CircleNotch size={19} weight="bold" className="animate-spin" /> : <SignOut size={19} weight="bold" />}
      </span>
      <span className="flex-1 font-bold text-coral-deep">{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
