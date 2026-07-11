"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Files,
  FilePdf,
  Image as ImageIcon,
  FileText,
  Plus,
  X,
  Trash,
  DownloadSimple,
  CircleNotch,
  Warning,
  PencilSimple,
} from "@phosphor-icons/react/dist/ssr";
import {
  DOC_TYPES,
  docTypeLabel,
  type DocType,
  type OperatorDocument,
} from "@/lib/documents/repo";
import {
  uploadDocumentAction,
  updateDocumentAction,
  deleteDocumentAction,
} from "@/app/(operator)/documents/actions";

const TRACKS_EXPIRY = new Set(DOC_TYPES.filter((t) => t.tracksExpiry).map((t) => t.value));

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysUntil(iso: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ mime }: { mime: string | null }) {
  if (mime === "application/pdf") return <FilePdf size={20} weight="fill" />;
  if (mime?.startsWith("image/")) return <ImageIcon size={20} weight="fill" />;
  return <FileText size={20} weight="fill" />;
}

/** Expiry pill: expired (coral) / soon (amber) / dated (muted). Null when N/A. */
function ExpiryPill({ doc }: { doc: OperatorDocument }) {
  if (!doc.expiresAt || !TRACKS_EXPIRY.has(doc.type)) return null;
  const d = daysUntil(doc.expiresAt);
  if (d < 0)
    return <Pill tone="coral">Expired {fmtDate(doc.expiresAt)}</Pill>;
  if (d <= 30)
    return <Pill tone="amber">Expires in {d} day{d === 1 ? "" : "s"}</Pill>;
  return <Pill tone="mute">Expires {fmtDate(doc.expiresAt)}</Pill>;
}

function Pill({ tone, children }: { tone: "coral" | "amber" | "mute"; children: React.ReactNode }) {
  const cls =
    tone === "coral"
      ? "bg-coral-tint text-coral-deep"
      : tone === "amber"
        ? "bg-amber-tint text-amber-deep"
        : "bg-sand text-ink-mute";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

export function DocumentsManager({ documents }: { documents: OperatorDocument[] }) {
  const [editing, setEditing] = useState<OperatorDocument | "new" | null>(null);

  const expiringCount = documents.filter(
    (d) => d.expiresAt && TRACKS_EXPIRY.has(d.type) && daysUntil(d.expiresAt) <= 30,
  ).length;

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink lg:text-3xl">Documents</h1>
          <p className="mt-1 text-sm font-medium text-ink-mute">
            Your business paperwork — insurance, licenses, permits, tax forms, and contract templates.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          <Plus size={16} weight="bold" /> Upload
        </button>
      </div>

      {expiringCount > 0 ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-amber-line bg-amber-tint px-4 py-3 text-[13.5px] font-bold text-amber-deep">
          <Warning size={18} weight="fill" />
          {expiringCount} document{expiringCount === 1 ? "" : "s"} expired or expiring within 30 days.
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <Files size={36} weight="light" className="text-ink-faint" />
          <p className="text-sm font-medium text-ink-mute">
            No documents yet. Upload your COI, license, or a contract template to keep them on hand.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {documents.map((doc) => (
            <DocCard key={doc.id} doc={doc} onEdit={() => setEditing(doc)} />
          ))}
        </div>
      )}

      {editing ? (
        <DocDrawer doc={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function DocCard({ doc, onEdit }: { doc: OperatorDocument; onEdit: () => void }) {
  const title = doc.label?.trim() || doc.fileName || docTypeLabel(doc.type);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-sand bg-white px-4 py-3.5">
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep">
        <DocIcon mime={doc.mimeType} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-bold text-ink">{title}</span>
          <ExpiryPill doc={doc} />
        </div>
        <div className="mt-0.5 truncate text-[12.5px] font-medium text-ink-mute">
          {docTypeLabel(doc.type)}
          {doc.sizeBytes ? ` · ${fmtSize(doc.sizeBytes)}` : ""}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {doc.downloadUrl ? (
          <a
            href={doc.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-sand hover:text-ink"
            aria-label="Download"
            title="Download"
          >
            <DownloadSimple size={18} weight="bold" />
          </a>
        ) : null}
        <button
          onClick={onEdit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-sand hover:text-ink"
          aria-label="Edit"
          title="Edit"
        >
          <PencilSimple size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function DocDrawer({ doc, onClose }: { doc: OperatorDocument | null; onClose: () => void }) {
  const router = useRouter();
  const isNew = doc === null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [type, setType] = useState<DocType>(doc?.type ?? "coi");
  const [label, setLabel] = useState(doc?.label ?? "");
  const [expiresAt, setExpiresAt] = useState(doc?.expiresAt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let res;
      if (isNew) {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError("Choose a file to upload.");
          setBusy(false);
          return;
        }
        const form = new FormData();
        form.set("file", file);
        form.set("type", type);
        form.set("label", label);
        if (expiresAt) form.set("expiresAt", expiresAt);
        res = await uploadDocumentAction(form);
      } else {
        res = await updateDocumentAction({ id: doc.id, type, label, expiresAt: expiresAt || null });
      }
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Something went wrong.");
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew) return;
    setBusy(true);
    setError(null);
    const res = await deleteDocumentAction(doc.id);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.refresh();
    onClose();
  }

  const tracksExpiry = TRACKS_EXPIRY.has(type);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">{isNew ? "Upload document" : "Edit document"}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute hover:bg-sand" aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {isNew ? (
            <label className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-soft">File</span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,application/pdf,image/*"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-brand-tint file:px-4 file:py-2 file:text-sm file:font-bold file:text-brand-deep hover:file:bg-brand-ring"
              />
              <span className="mt-1 block text-[12px] font-medium text-ink-mute">
                {fileName || "PDF, image, or Word doc — up to 20 MB."}
              </span>
            </label>
          ) : (
            <div className="rounded-xl bg-cream px-3 py-2.5 text-[13px] font-semibold text-ink-soft">
              {doc.fileName ?? "Document"}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[13px] font-bold text-ink-soft">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as DocType)} className="input">
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-bold text-ink-soft">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. 2026 General Liability COI"
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-bold text-ink-soft">
              Expiry date {tracksExpiry ? "" : "(optional)"}
            </span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
            <span className="mt-1 block text-[12px] font-medium text-ink-mute">
              {tracksExpiry ? "You'll get a dashboard warning as it approaches." : "Only insurance/licenses/permits are tracked for expiry."}
            </span>
          </label>

          {error ? (
            <div className="rounded-xl bg-coral-tint px-3 py-2 text-sm font-semibold text-coral-deep">{error}</div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-mute"
          >
            {busy ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null}
            {isNew ? "Upload" : "Save"}
          </button>
          {!isNew ? (
            <button
              onClick={remove}
              disabled={busy}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-sand text-coral-deep transition-colors hover:bg-coral-tint disabled:opacity-50"
              aria-label="Delete"
              title="Delete"
            >
              <Trash size={18} weight="bold" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
