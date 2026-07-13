"use client";

import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

export function CustomerSignOut() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/my/login");
        router.refresh();
      }}
      className="flex items-center gap-1.5 rounded-2xl border border-sand bg-white px-3.5 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
    >
      <SignOut size={15} weight="bold" />
      Sign out
    </button>
  );
}
