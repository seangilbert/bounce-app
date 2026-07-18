import { FilePdf, Image as ImageIcon, FileText } from "@phosphor-icons/react/dist/ssr";
import { DOC_TYPES, type OperatorDocument } from "@/lib/documents/types";

/** Types whose expiry we track + warn on. */
export const TRACKS_EXPIRY = new Set(DOC_TYPES.filter((t) => t.tracksExpiry).map((t) => t.value));

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysUntil(iso: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocIcon({ mime }: { mime: string | null }) {
  if (mime === "application/pdf") return <FilePdf size={20} weight="fill" />;
  if (mime?.startsWith("image/")) return <ImageIcon size={20} weight="fill" />;
  return <FileText size={20} weight="fill" />;
}

export function Pill({ tone, children }: { tone: "coral" | "amber" | "mute"; children: React.ReactNode }) {
  const cls =
    tone === "coral"
      ? "bg-coral-tint text-coral-deep"
      : tone === "amber"
        ? "bg-amber-tint text-amber-deep"
        : "bg-sand text-ink-mute";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

/** Expiry pill: expired (coral) / soon within 30d (amber) / dated (muted). Null when N/A. */
export function ExpiryPill({ doc }: { doc: OperatorDocument }) {
  if (!doc.expiresAt || !TRACKS_EXPIRY.has(doc.type)) return null;
  const d = daysUntil(doc.expiresAt);
  if (d < 0) return <Pill tone="coral">Expired {fmtDate(doc.expiresAt)}</Pill>;
  if (d <= 30)
    return (
      <Pill tone="amber">
        Expires in {d} day{d === 1 ? "" : "s"}
      </Pill>
    );
  return <Pill tone="mute">Expires {fmtDate(doc.expiresAt)}</Pill>;
}
