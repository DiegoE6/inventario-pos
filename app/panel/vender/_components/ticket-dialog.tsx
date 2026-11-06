"use client";

import { useEffect, useRef } from "react";
import { Printer, ShoppingCart } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { formatMoney, formatQuantity } from "@/app/lib/format";
import type { Ticket } from "../actions";

const fecha = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Monterrey",
  dateStyle: "short",
  timeStyle: "short",
});

const METODO: Record<Ticket["metodo"], string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

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
      className="ticket-dialog m-auto w-[min(100%-2rem,380px)] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
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

/** Contenido imprimible (ver @media print en globals.css). */
function TicketContent({ ticket }: { ticket: Ticket }) {
  return (
    <div className="ticket-print flex flex-col gap-3 font-mono text-[13px] leading-snug">
      <div className="text-center">
        <p className="text-base font-bold">{ticket.negocio.nombre}</p>
        {ticket.negocio.direccion ? <p>{ticket.negocio.direccion}</p> : null}
        {ticket.negocio.telefono ? <p>Tel. {ticket.negocio.telefono}</p> : null}
      </div>

      <div className="ticket-rule border-t border-dashed border-border-strong pt-2">
        <p className="flex justify-between">
          <span>Folio</span>
          <span className="font-bold">{String(ticket.folio).padStart(6, "0")}</span>
        </p>
        <p className="flex justify-between">
          <span>Fecha</span>
          <span>{fecha.format(new Date(ticket.fecha))}</span>
        </p>
        {ticket.atendio ? (
          <p className="flex justify-between gap-2">
            <span>Atendió</span>
            <span className="truncate">{ticket.atendio}</span>
          </p>
        ) : null}
      </div>

      <ul className="ticket-rule flex flex-col gap-1.5 border-t border-dashed border-border-strong pt-2">
        {ticket.items.map((item, i) => (
          <li key={i}>
            <p>{item.nombre}</p>
            <p className="flex justify-between tabular-nums">
              <span>
                {formatQuantity(item.cantidad, item.unidad)} x {formatMoney(item.precio)}
              </span>
              <span>{formatMoney(item.importe)}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="ticket-rule flex flex-col gap-0.5 border-t border-dashed border-border-strong pt-2 tabular-nums">
        <p className="flex justify-between text-base font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(ticket.total)}</span>
        </p>
        <p className="flex justify-between">
          <span>{METODO[ticket.metodo]}</span>
          <span>{formatMoney(ticket.recibido)}</span>
        </p>
        {ticket.metodo === "efectivo" ? (
          <p className="flex justify-between">
            <span>Cambio</span>
            <span>{formatMoney(ticket.cambio)}</span>
          </p>
        ) : null}
      </div>

      <div className="ticket-rule border-t border-dashed border-border-strong pt-2 text-center">
        <p>¡Gracias por su compra!</p>
        <p className="mt-1 text-[11px]">Este ticket no es un comprobante fiscal.</p>
      </div>
    </div>
  );
}
