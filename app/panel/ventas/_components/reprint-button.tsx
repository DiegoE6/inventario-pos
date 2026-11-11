"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";
import { TicketContent, type TicketData } from "@/app/components/ticket";
import { Button } from "@/app/components/ui/button";

/**
 * Reimprimir: el mismo ticket del punto de venta en un <dialog> nativo
 * (ticket-dialog: así lo toma @media print). "Imprimir" tiene el foco.
 */
export function ReprintButton({ ticket }: { ticket: TicketData }) {
  const ref = useRef<HTMLDialogElement>(null);

  function abrir() {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    d.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();
  }

  return (
    <>
      <Button variant="secondary" onClick={abrir} icon={<Printer aria-hidden className="size-[18px]" />}>
        Reimprimir ticket
      </Button>
      <dialog
        ref={ref}
        aria-label={`Ticket de la venta ${ticket.folio}`}
        className="ticket-dialog tema-claro app-dialog m-auto w-[min(100%-2rem,380px)] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="overflow-y-auto p-4">
            <TicketContent ticket={ticket} />
          </div>
          <div className="no-print flex gap-2 border-t border-border p-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => ref.current?.close()}
              icon={<X aria-hidden className="size-[18px]" />}
            >
              Cerrar
            </Button>
            <Button
              data-autofocus
              className="flex-1"
              onClick={() => window.print()}
              icon={<Printer aria-hidden className="size-[18px]" />}
            >
              Imprimir
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
