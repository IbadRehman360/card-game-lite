"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { sfx } from "@/lib/sfx";

/** Modal panel over the room. Built on <dialog>: focus stays inside, Escape closes, the page behind is inert. */
export function Sheet({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      (
        d.querySelector<HTMLElement>("[data-autofocus]") ??
        d.querySelector<HTMLElement>(".sheet-close")
      )?.focus();
      sfx.open();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const close = () => {
    sfx.back();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-wide={wide}
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        <header className="sheet-head">
          <h2 id="sheet-title">{title}</h2>
          <button
            type="button"
            className="icon-button sheet-close"
            aria-label="Close"
            onClick={close}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6 L18 18 M18 6 L6 18" />
            </svg>
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>
  );
}
