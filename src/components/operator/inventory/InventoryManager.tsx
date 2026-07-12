"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CastleTurret,
  Tent,
  Chair,
  Package,
  Plus,
  X,
  CircleNotch,
  Trash,
  Lightning,
  ImageSquare,
  Star,
} from "@phosphor-icons/react/dist/ssr";
import { bookableUnits, outOfServiceUnits, type EquipmentItem, type Item } from "@/lib/inventory/types";
import { createItemAction, updateItemAction, deleteItemAction } from "@/app/(operator)/inventory/actions";

type Category = "bounce" | "tent" | "tables" | "other";

const CATS: { value: Category; label: string; Icon: typeof Tent; tint: string; ink: string }[] = [
  { value: "bounce", label: "Bounce house", Icon: CastleTurret, tint: "bg-brand-tint", ink: "text-brand" },
  { value: "tent", label: "Tent", Icon: Tent, tint: "bg-teal-tint", ink: "text-teal" },
  { value: "tables", label: "Tables & chairs", Icon: Chair, tint: "bg-amber-tint", ink: "text-amber-deep" },
  { value: "other", label: "Other", Icon: Package, tint: "bg-sand", ink: "text-ink-soft" },
];
const catMeta = (c: string | null) => CATS.find((x) => x.value === c) ?? CATS[3];
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;
const unitLabel = (u: string) => (u === "per_hour" ? "/ hour" : u === "flat" ? "flat" : "/ day");

interface DraftForm {
  name: string;
  category: Category;
  price: string; // dollars, as typed
  quantity: string;
  priceUnit: "per_day" | "per_hour" | "flat";
  description: string;
  powerRequired: boolean;
  images: string[]; // public URLs; images[0] is the primary
  active: boolean;
  needsCleaning: string;
  damaged: string;
  inRepair: string;
  equipment: EquipmentItem[];
}

const emptyDraft: DraftForm = {
  name: "",
  category: "bounce",
  price: "",
  quantity: "1",
  priceUnit: "per_day",
  description: "",
  powerRequired: false,
  images: [],
  active: true,
  needsCleaning: "0",
  damaged: "0",
  inRepair: "0",
  equipment: [],
};

function itemToDraft(i: Item): DraftForm {
  return {
    name: i.name,
    category: (catMeta(i.category).value as Category) ?? "other",
    price: (i.basePrice / 100).toString(),
    quantity: i.quantity.toString(),
    priceUnit: i.priceUnit,
    description: i.description ?? "",
    powerRequired: i.powerRequired,
    images: i.images ?? [],
    active: i.active,
    needsCleaning: String(i.unitsNeedsCleaning),
    damaged: String(i.unitsDamaged),
    inRepair: String(i.unitsInRepair),
    equipment: i.requiredEquipment.map((e) => ({ ...e })),
  };
}

/** Downscale + re-encode a picked image so uploads stay small (~a few hundred KB). */
async function resizeImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Could not load image."));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode image."))), "image/jpeg", quality),
  );
}

export function InventoryManager({ items, isAdmin }: { items: Item[]; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const open = creating || editing != null;
  const close = () => {
    setCreating(false);
    setEditing(null);
  };

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
                  onClick={() => isAdmin && setEditing(item)}
                  disabled={!isAdmin}
                  className={`flex items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 text-left transition-colors ${isAdmin ? "hover:border-sand" : "cursor-default"}`}
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
                  <div className="flex-shrink-0 text-right">
                    <div className="font-display text-lg font-bold text-ink">{money(item.basePrice)}</div>
                    <div className="text-[12px] font-semibold text-ink-mute">{unitLabel(item.priceUnit)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open ? (
        <ItemDrawer
          item={editing}
          onClose={close}
          onSaved={() => {
            close();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ItemDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DraftForm>(item ? itemToDraft(item) : emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const priceCents = Math.round(parseFloat(draft.price || "0") * 100);
  const qty = parseInt(draft.quantity || "0", 10);
  const outOfService =
    (parseInt(draft.needsCleaning || "0", 10) || 0) +
    (parseInt(draft.damaged || "0", 10) || 0) +
    (parseInt(draft.inRepair || "0", 10) || 0);
  const readyUnits = (qty || 0) - outOfService;
  const valid =
    draft.name.trim() && priceCents >= 0 && Number.isFinite(priceCents) && qty >= 0 && readyUnits >= 0;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const blob = await resizeImage(file);
        const fd = new FormData();
        fd.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        const res = await fetch("/api/inventory/photo", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed.");
        uploaded.push(json.url as string);
      }
      if (uploaded.length) setDraft((d) => ({ ...d, images: [...d.images, ...uploaded] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const removePhoto = (url: string) => setDraft((d) => ({ ...d, images: d.images.filter((u) => u !== url) }));
  const makePrimary = (url: string) =>
    setDraft((d) => ({ ...d, images: [url, ...d.images.filter((u) => u !== url)] }));

  async function save() {
    setSubmitting(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      category: draft.category,
      description: draft.description.trim() || null,
      quantity: qty,
      unitsNeedsCleaning: parseInt(draft.needsCleaning || "0", 10),
      unitsDamaged: parseInt(draft.damaged || "0", 10),
      unitsInRepair: parseInt(draft.inRepair || "0", 10),
      requiredEquipment: draft.equipment
        .map((e) => ({ label: e.label.trim(), qty: Math.max(1, e.qty || 1) }))
        .filter((e) => e.label),
      basePrice: priceCents,
      priceUnit: draft.priceUnit,
      powerRequired: draft.powerRequired,
      images: draft.images,
      active: draft.active,
    };
    const res = item ? await updateItemAction(item.id, payload) : await createItemAction(payload);
    if (res.ok) onSaved();
    else {
      setError(res.error);
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!item) return;
    setDeleting(true);
    setError(null);
    const res = await deleteItemAction(item.id);
    if (res.ok) onSaved();
    else {
      setError(res.error);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">{item ? "Edit item" : "Add item"}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-ink-soft"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="flex-1 space-y-4 px-5 py-5">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Rainbow 15×15 Bounce Castle"
              className="input"
            />
          </Field>

          <Field label="Category">
            <div className="grid grid-cols-2 gap-2">
              {CATS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set("category", c.value)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                    draft.category === c.value
                      ? "border-brand bg-brand-tint/40 text-ink"
                      : "border-sand-line bg-white text-ink-soft hover:border-sand"
                  }`}
                >
                  <c.Icon size={18} weight="fill" className={c.ink} /> {c.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex gap-3">
            <Field label="Price (USD)" className="flex-1">
              <input
                type="number"
                min="0"
                step="1"
                value={draft.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="190"
                className="input"
              />
            </Field>
            <Field label="Rate" className="w-32">
              <select
                value={draft.priceUnit}
                onChange={(e) => set("priceUnit", e.target.value as DraftForm["priceUnit"])}
                className="input"
              >
                <option value="per_day">Per day</option>
                <option value="per_hour">Per hour</option>
                <option value="flat">Flat</option>
              </select>
            </Field>
          </div>

          <Field label="Quantity owned">
            <input
              type="number"
              min="0"
              step="1"
              value={draft.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              className="input"
            />
          </Field>

          {/* Readiness — units in a non-ready condition are held out of bookable
              stock. Ready = owned − (needs cleaning + damaged + in repair). */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-ink-soft">Readiness</span>
              <span className={`text-[13px] font-bold ${readyUnits < 0 ? "text-coral-deep" : "text-teal"}`}>
                {Math.max(0, readyUnits)} of {qty || 0} ready to book
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ReadinessInput label="Needs cleaning" value={draft.needsCleaning} onChange={(v) => set("needsCleaning", v)} />
              <ReadinessInput label="Damaged" value={draft.damaged} onChange={(v) => set("damaged", v)} />
              <ReadinessInput label="In repair" value={draft.inRepair} onChange={(v) => set("inRepair", v)} />
            </div>
            {readyUnits < 0 ? (
              <p className="mt-1 text-[12px] font-semibold text-coral-deep">Out-of-service units exceed the quantity owned.</p>
            ) : (
              <p className="mt-1 text-[12px] font-medium text-ink-mute">Out-of-service units won&apos;t be offered for booking.</p>
            )}
          </div>

          {/* Required equipment — the loadout checklist for this item. */}
          <div>
            <div className="mb-1.5 text-[13px] font-bold text-ink-soft">Required equipment</div>
            <p className="mb-2 text-[12px] font-medium text-ink-mute">Gear needed to run it. Shows as a loadout checklist on the deliveries screen.</p>
            <div className="space-y-2">
              {draft.equipment.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={e.label}
                    onChange={(ev) =>
                      set("equipment", draft.equipment.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))
                    }
                    placeholder="Blower, stakes, tarp…"
                    className="input flex-1"
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={e.qty}
                    onChange={(ev) =>
                      set(
                        "equipment",
                        draft.equipment.map((x, j) => (j === i ? { ...x, qty: parseInt(ev.target.value || "1", 10) || 1 } : x)),
                      )
                    }
                    className="input w-16"
                    aria-label="Quantity"
                  />
                  <button
                    type="button"
                    onClick={() => set("equipment", draft.equipment.filter((_, j) => j !== i))}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-coral-tint hover:text-coral-deep"
                    aria-label="Remove"
                  >
                    <Trash size={16} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => set("equipment", [...draft.equipment, { label: "", qty: 1 }])}
              className="mt-2 flex items-center gap-1.5 rounded-full border border-dashed border-sand px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
            >
              <Plus size={14} weight="bold" /> Add equipment
            </button>
          </div>

          <Field label="Description (optional)">
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="A colorful 15×15 castle, big enough for a dozen kids."
              className="input resize-none"
            />
          </Field>

          <Field label="Photos">
            <div className="flex flex-wrap gap-2">
              {draft.images.map((url, i) => (
                <div
                  key={url}
                  className="group relative h-20 w-20 overflow-hidden rounded-xl border border-sand-line bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 ? (
                    <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white">
                      PRIMARY
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(url)}
                      title="Make primary"
                      className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-ink/70 py-0.5 text-[9px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Star size={9} weight="fill" /> Primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-coral"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </div>
              ))}
              <label
                className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-sand text-ink-mute transition-colors hover:border-brand hover:text-brand ${uploading ? "pointer-events-none opacity-60" : ""}`}
              >
                {uploading ? (
                  <CircleNotch size={18} weight="bold" className="animate-spin" />
                ) : (
                  <>
                    <ImageSquare size={18} />
                    <span className="text-[10px] font-bold">Add</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="mt-1 text-[12px] font-medium text-ink-mute">
              The first photo is the primary shown on your storefront.
            </p>
          </Field>

          <div className="space-y-2.5">
            <Toggle checked={draft.active} onChange={(v) => set("active", v)}>
              Visible on storefront
            </Toggle>
            <Toggle
              checked={draft.powerRequired}
              onChange={(v) => set("powerRequired", v)}
              icon={<Lightning size={15} weight="fill" className="text-amber-deep" />}
            >
              Needs power / a blower
            </Toggle>
          </div>

          {error ? (
            <div className="rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-sand px-5 py-4">
          {item ? (
            <button
              onClick={remove}
              disabled={deleting || submitting}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-sand bg-white text-coral transition-colors hover:bg-coral-tint disabled:opacity-50"
              aria-label="Delete item"
            >
              {deleting ? <CircleNotch size={18} weight="bold" className="animate-spin" /> : <Trash size={18} />}
            </button>
          ) : null}
          <button
            onClick={save}
            disabled={!valid || submitting || deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
          >
            {submitting ? (
              <>
                <CircleNotch size={18} weight="bold" className="animate-spin" /> Saving…
              </>
            ) : item ? (
              "Save changes"
            ) : (
              "Add item"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadinessInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-ink-faint">{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  children,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-sand-line bg-white px-4 py-3 text-left"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-ink">
        {icon} {children}
      </span>
      <span
        className={`relative h-6 w-10 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-sand"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
