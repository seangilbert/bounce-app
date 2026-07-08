"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { BookingBuilder } from "./BookingBuilder";

/** "New booking" launcher used on the Dashboard and Calendar. */
export function NewBookingButton({
  operatorId,
  initialDate,
  className,
}: {
  operatorId: string;
  initialDate?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex flex-shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-deep"
        }
      >
        <Plus size={16} weight="bold" />
        <span className="hidden sm:inline">New booking</span>
        <span className="sm:hidden">New</span>
      </button>
      {open ? (
        <BookingBuilder
          operatorId={operatorId}
          initial={initialDate ? { startDate: initialDate, endDate: initialDate } : undefined}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
