"use client";

import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

/** Full-width sign-out row (used on the mobile "More" screen). */
export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-cream"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-tint text-coral-deep">
        <SignOut size={19} weight="bold" />
      </span>
      <span className="flex-1 font-bold text-coral-deep">Sign out</span>
    </button>
  );
}
