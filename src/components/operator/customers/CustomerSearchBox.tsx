"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

/** Dashboard search — jumps to the Customers list, seeded with the query. */
export function CustomerSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/customers?q=${encodeURIComponent(term)}` : "/customers");
      }}
      className="flex flex-1 items-center gap-2.5 rounded-full border border-sand bg-white px-4 py-2.5 sm:w-[280px] sm:flex-none lg:w-[320px]"
    >
      <MagnifyingGlass size={18} className="flex-shrink-0 text-ink-faint" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search customers…"
        aria-label="Search customers"
        className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
      />
    </form>
  );
}
