"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { bookableUnits, outOfServiceUnits, type Item } from "@/lib/inventory/types";
import { ItemDrawer } from "./ItemDrawer";
import { catMeta, money, unitLabel } from "./shared";

export function InventoryManager({ items, isAdmin }: { items: Item[]; isAdmin: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex w-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-sand px-5 py-5 lg:px-8 lg:py-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">Inventory</h1>
          <p className="mt-0.5 text-sm font-medium text-ink-mute">
            {items.length} {items.length === 1 ? "item" : "items"} in your catalog
          </p>
        </div>
        {isAdmin ? (
          <button
            onClick={() => setCreating(true)}
            className="flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep"
          >
            <Plus size={16} weight="bold" /> <span className="hidden sm:inline">Add item</span>
            <span className="sm:hidden">Add</span>
          </button>
        ) : null}
      </div>

      <div className="px-5 py-5 lg:px-8 lg:py-6">
        {items.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sand text-ink-mute">
              <Package size={26} />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">No items yet</h2>
            <p className="max-w-sm text-sm font-medium text-ink-mute">
              Add your first rental item so customers can browse and book it on your storefront.
            </p>
            {isAdmin ? (
              <button
                onClick={() => setCreating(true)}
                className="mt-2 flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep"
              >
                <Plus size={15} weight="bold" /> Add your first item
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map((item) => {
              const m = catMeta(item.category);
              return (
                <button
                  key={item.id}
                  onClick={() => router.push(`/inventory/${item.id}`)}
                  className="flex items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 text-left transition-colors hover:border-sand"
                >
                  <span
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl ${item.images?.[0] ? "" : m.tint}`}
                  >
                    {item.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.images[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <m.Icon size={24} weight="fill" className={m.ink} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-ink">{item.name}</span>
                      {!item.active ? (
                        <span className="flex-shrink-0 rounded-full bg-sand px-2 py-0.5 text-[10px] font-extrabold text-ink-mute">
                          HIDDEN
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-ink-mute">
                      <span>{m.label} · {item.quantity} in stock</span>
                      {outOfServiceUnits(item) > 0 ? (
                        <span className="rounded-full bg-amber-tint px-2 py-0.5 text-[11px] font-extrabold text-amber-deep">
                          {bookableUnits(item)} ready · {outOfServiceUnits(item)} out
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="font-display text-lg font-bold text-ink">{money(item.basePrice)}</div>
                      <div className="text-[12px] font-semibold text-ink-mute">{unitLabel(item.priceUnit)}</div>
                    </div>
                    <CaretRight size={16} weight="bold" className="text-ink-faint" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {creating ? (
        <ItemDrawer
          item={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
