"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash, DownloadSimple, CircleNotch, Paperclip } from "@phosphor-icons/react/dist/ssr";
import { DOC_TYPES, docTypeLabel, type DocType, type OperatorDocument } from "@/lib/documents/repo";
import { uploadDocumentAction, deleteDocumentAction } from "@/app/(operator)/documents/actions";
import { DocIcon, ExpiryPill, fmtSize } from "./docPresentation";

/**
 * Documents attached to a single booking or customer. Reuses the operator-scoped
 * document actions; the booking/customer context is preset on upload so the file
 * lands linked to this record.
 */
export function DocumentsPanel({
  documents,
  bookingId,
  customerId,
}: {
  documents: OperatorDocument[];
  bookingId?: string;
  customerId?: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-2xl border border-sand bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Paperclip size={18} weight="bold" className="text-ink-mute" /> Documents
        </h2>
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-[13px] font-bold text-brand-deep transition-colors hover:bg-brand-ring"
          >
            <Plus size={14} weight="bold" /> Attach
          </button>
        ) : null}
      </div>

      {adding ? (
        <UploadForm
          bookingId={bookingId}
          customerId={customerId}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {documents.length === 0 && !adding ? (
        <p className="mt-3 text-[13.5px] font-medium text-ink-mute">
          No documents attached. Attach a signed waiver, COI, or a delivery photo.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {documents.map((doc) => (
            <DocRow key={doc.id} doc={doc} onDeleted={() => router.refresh()} />
          ))}
        </div>
      )}
    </section>
  );
}

function DocRow({ doc, onDeleted }: { doc: OperatorDocument; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const title = doc.label?.trim() || doc.fileName || docTypeLabel(doc.type);

  async function remove() {
    if (busy) return;
    setBusy(true);
    const res = await deleteDocumentAction(doc.id);
    if (res.ok) onDeleted();
    else setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-sand-line bg-cream px-3 py-2.5">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-deep">
        <DocIcon mime={doc.mimeType} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-bold text-ink">{title}</span>
          <ExpiryPill doc={doc} />
        </div>
        <div className="truncate text-[12px] font-medium text-ink-mute">
          {docTypeLabel(doc.type)}
          {doc.sizeBytes ? ` · ${fmtSize(doc.sizeBytes)}` : ""}
        </div>
      </div>
      {doc.downloadUrl ? (
        <a
          href={doc.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-sand hover:text-ink"
          aria-label="Download"
          title="Download"
        >
          <DownloadSimple size={16} weight="bold" />
        </a>
      ) : null}
      <button
        onClick={remove}
        disabled={busy}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-coral-tint hover:text-coral-deep disabled:opacity-50"
        aria-label="Remove"
        title="Remove"
      >
        {busy ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : <Trash size={16} weight="bold" />}
      </button>
    </div>
  );
}

function UploadForm({
  bookingId,
  customerId,
  onDone,
  onCancel,
}: {
  bookingId?: string;
  customerId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [type, setType] = useState<DocType>("waiver");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("type", type);
    form.set("label", label);
    if (expiresAt) form.set("expiresAt", expiresAt);
    if (bookingId) form.set("bookingId", bookingId);
    if (customerId) form.set("customerId", customerId);
    const res = await uploadDocumentAction(form);
    if (res.ok) onDone();
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-sand-line bg-cream p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-ink-soft">Attach a document</span>
        <button onClick={onCancel} className="text-ink-mute hover:text-ink" aria-label="Cancel">
          <X size={16} weight="bold" />
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,application/pdf,image/*"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        className="block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-brand-tint file:px-3 file:py-1.5 file:text-[13px] file:font-bold file:text-brand-deep hover:file:bg-brand-ring"
      />
      <div className="grid grid-cols-2 gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as DocType)} className="input">
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" title="Expiry (optional)" />
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className="input"
      />
      {error ? <div className="rounded-lg bg-coral-tint px-3 py-2 text-[13px] font-semibold text-coral-deep">{error}</div> : null}
      <button
        onClick={submit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
      >
        {busy ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : null} Attach {fileName ? `“${fileName.slice(0, 24)}”` : "document"}
      </button>
    </div>
  );
}
