import { formatMoney, formatQuantity, type Unidad } from "@/app/lib/format";
import { TZ } from "@/app/lib/tz";

/**
 * Ticket imprimible, compartido por el punto de venta (al cobrar) y por
 * Ventas (reimprimir). Solo pinta datos que regresó la BD. La impresión la
 * controla @media print en globals.css (.ticket-print dentro de un
 * dialog.ticket-dialog).
 */

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";

export const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export type TicketData = {
  folio: number;
  fecha: string;
  metodo: MetodoPago;
  total: number;
  recibido: number;
  cambio: number;
  atendio: string;
  items: { nombre: string; unidad: Unidad; cantidad: number; precio: number; importe: number }[];
  negocio: { nombre: string; direccion: string | null; telefono: string | null };
  /** Reimpresión de una venta cancelada: el ticket lo dice arriba. */
  cancelada?: boolean;
};

const fecha = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });

export function formatFolio(folio: number): string {
  return String(folio).padStart(6, "0");
}

export function TicketContent({ ticket }: { ticket: TicketData }) {
  return (
    <div className="ticket-print flex flex-col gap-3 font-mono text-[13px] leading-snug">
      <div className="text-center">
        <p className="text-base font-bold">{ticket.negocio.nombre}</p>
        {ticket.negocio.direccion ? <p>{ticket.negocio.direccion}</p> : null}
        {ticket.negocio.telefono ? <p>Tel. {ticket.negocio.telefono}</p> : null}
      </div>

      {ticket.cancelada ? (
        <p className="ticket-rule border-y border-dashed border-border-strong py-1 text-center font-bold">
          VENTA CANCELADA
        </p>
      ) : null}

      <div className="ticket-rule border-t border-dashed border-border-strong pt-2">
        <p className="flex justify-between">
          <span>Folio</span>
          <span className="font-bold">{formatFolio(ticket.folio)}</span>
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
          <span>{METODO_LABEL[ticket.metodo]}</span>
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
