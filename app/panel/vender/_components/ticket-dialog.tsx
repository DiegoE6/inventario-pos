"use client";

import { useEffect, useRef } from "react";
import { Printer, ShoppingCart } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { TicketContent } from "@/app/components/ticket";
import type { Ticket } from "../actions";

/**
 * Ticket en un <dialog> nativo (foco atrapado, Escape). Muestra solo datos que
 * regresó la BD. Al cerrarse por cualquier vía empieza una venta nueva.
 * "Nueva venta" tiene el foco: cobrar → Enter → siguiente cliente.
 */
export function TicketDialog({ ticket, onNueva }: { ticket: Ticket | null; onNueva: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (ticket && d && !d.open) {
      d.showModal();
      // showModal() enfoca el primer botón (Imprimir). El autoFocus de React
      // corre al montar, antes de abrir el diálogo, así que se enfoca aquí.
      d.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();
    }
  }, [ticket]);

  return (
    <dialog
      ref={ref}
      onClose={onNueva}
      aria-label="Ticket de venta"
      className="ticket-dialog tema-claro m-auto w-[min(100%-2rem,380px)] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
    >
      {ticket ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="overflow-y-auto p-4">
            {ticket.repetida ? (
              <div className="no-print mb-3">
                <Notice tone="success">
                  Esta venta ya se había registrado. No se cobró doble; este es su ticket.
                </Notice>
              </div>
            ) : null}
            <TicketContent ticket={ticket} />
          </div>
          <div className="no-print flex gap-2 border-t border-border p-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => window.print()}
              icon={<Printer aria-hidden className="size-[18px]" />}
            >
              Imprimir
            </Button>
            <Button
              data-autofocus
              className="flex-1"
              onClick={() => ref.current?.close()}
              icon={<ShoppingCart aria-hidden className="size-[18px]" />}
            >
              Nueva venta
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
