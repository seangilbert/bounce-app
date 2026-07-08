"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";

interface LightboxState {
  images: string[];
  index: number;
}
interface LightboxApi {
  /** Open the viewer for an item's photos, starting at `index`. No-op if empty. */
  open: (images: string[], index?: number) => void;
}

const LightboxCtx = createContext<LightboxApi>({ open: () => {} });
export const useLightbox = () => useContext(LightboxCtx);

/** Wrap the storefront so any thumbnail can pop a full-screen photo carousel. */
export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);
  const open = useCallback((images: string[], index = 0) => {
    if (images.length > 0) setState({ images, index: Math.max(0, Math.min(index, images.length - 1)) });
  }, []);
  return (
    <LightboxCtx.Provider value={{ open }}>
      {children}
      {state ? <LightboxModal state={state} setState={setState} onClose={() => setState(null)} /> : null}
    </LightboxCtx.Provider>
  );
}

function LightboxModal({
  state,
  setState,
  onClose,
}: {
  state: LightboxState;
  setState: (s: LightboxState) => void;
  onClose: () => void;
}) {
  const { images, index } = state;
  const count = images.length;
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef(0);

  const go = useCallback(
    (delta: number) => setState({ images, index: (index + delta + count) % count }),
    [images, index, count, setState],
  );

  // Keyboard nav + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]!.clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0]!.clientX - touchX.current;
    if (count > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
    >
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <X size={22} weight="bold" />
      </button>

      {count > 1 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="Previous photo"
          className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
        >
          <CaretLeft size={22} weight="bold" />
        </button>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="max-h-[82vh] max-w-[88vw] rounded-xl object-contain shadow-2xl"
      />

      {count > 1 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="Next photo"
          className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
        >
          <CaretRight size={22} weight="bold" />
        </button>
      ) : null}

      {count > 1 ? (
        <div
          className="absolute bottom-6 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setState({ images, index: i })}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
