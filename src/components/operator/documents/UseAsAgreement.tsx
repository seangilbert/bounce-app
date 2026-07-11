"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CircleNotch, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import {
  startContractTemplateAction,
  finalizeContractTemplateAction,
} from "@/app/(operator)/documents/actions";

const SCRIPT_URL = "https://static.signwell.com/assets/embedded.js";

declare global {
  interface Window {
    SignWellEmbed?: new (opts: {
      url: string;
      events?: {
        completed?: (e?: unknown) => void;
        closed?: (e?: unknown) => void;
        declined?: (e?: unknown) => void;
        error?: (e?: unknown) => void;
      };
    }) => { open: () => void; close?: () => void };
  }
}

/** Load SignWell's embedded script once, resolving when `SignWellEmbed` exists. */
function loadSignWell(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window."));
    if (window.SignWellEmbed) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load SignWell.")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load SignWell."));
    document.body.appendChild(s);
  });
}

/**
 * "Use as rental agreement" — turns this PDF document into the operator's
 * SignWell template. Creates a draft template server-side, opens SignWell's
 * embedded editor so the operator places signer fields, then persists the
 * finished template id as their agreement on `completed`.
 */
export function UseAsAgreement({ documentId, isCurrent }: { documentId: string; isCurrent?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "starting" | "editing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStatus("starting");
    setError(null);
    const res = await startContractTemplateAction(documentId);
    if (!res.ok) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    try {
      await loadSignWell();
    } catch {
      setError("Couldn't load the SignWell editor.");
      setStatus("idle");
      return;
    }
    if (!window.SignWellEmbed) {
      setError("SignWell editor unavailable.");
      setStatus("idle");
      return;
    }
    setStatus("editing");
    const embed = new window.SignWellEmbed({
      url: res.embeddedEditUrl,
      events: {
        completed: async () => {
          const fin = await finalizeContractTemplateAction(res.templateId);
          if (fin.ok) {
            setStatus("done");
            router.refresh();
          } else {
            setError(fin.error);
            setStatus("idle");
          }
        },
        closed: () => setStatus((s) => (s === "done" ? "done" : "idle")),
        error: () => {
          setError("The editor reported an error.");
          setStatus("idle");
        },
      },
    });
    embed.open();
  }

  if (status === "done") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-teal-tint px-3 py-2 text-[13px] font-bold text-teal-deep">
        <CheckCircle size={16} weight="fill" /> Set as your rental agreement.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={start}
        disabled={status !== "idle"}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-brand bg-brand-tint px-4 py-2 text-[13px] font-bold text-brand-deep transition-colors hover:bg-brand-ring disabled:opacity-60"
      >
        {status === "starting" ? (
          <CircleNotch size={14} weight="bold" className="animate-spin" />
        ) : (
          <FileText size={14} weight="fill" />
        )}
        {status === "editing"
          ? "Editor open…"
          : isCurrent
            ? "Re-edit rental agreement"
            : "Use as rental agreement"}
      </button>
      {error ? (
        <div className="rounded-lg bg-coral-tint px-3 py-2 text-[12.5px] font-semibold text-coral-deep">{error}</div>
      ) : null}
      <p className="text-[11.5px] font-medium text-ink-mute">
        Opens SignWell to place signature fields, then becomes the contract your customers sign.
      </p>
    </div>
  );
}
