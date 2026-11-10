import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatFolio, METODO_LABEL } from "@/app/components/ticket";
import { formatMoney } from "@/app/lib/format";
import { formatFechaHora } from "@/app/lib/tz";
import type { EstadoVenta, VentaLista } from "@/app/lib/ventas";

export function EstadoBadge({ estado }: { estado: EstadoVenta }) {
  return estado === "cancelada" ? (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-danger-soft px-2.5 text-xs font-semibold text-danger">
      Cancelada
    </span>
  ) : (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-success-soft px-2.5 text-xs font-semibold text-success">
      Completada
    </span>
  );
}

function Total({ venta }: { venta: VentaLista }) {
  const cancelada = venta.estado === "cancelada";
  return (
    <span className={`font-semibold tabular-nums ${cancelada ? "text-muted line-through" : ""}`}>
      {formatMoney(venta.total)}
      {cancelada ? <span className="sr-only"> (cancelada, no cuenta)</span> : null}
    </span>
  );
}

const COLS = "md:grid-cols-[5.5rem_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_7rem_7.5rem_1rem]";

/**
 * Celular: tarjeta de dos líneas. Desde md: un renglón con columnas. Todo el
 * renglón es el enlace al detalle (área grande para tocar).
 */
export function VentaList({ ventas, vacio }: { ventas: VentaLista[]; vacio: string }) {
  if (ventas.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-base text-muted">
        {vacio}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div
        aria-hidden
        className={`hidden gap-3 border-b border-border bg-surface-muted px-4 py-2 text-xs font-medium text-muted md:grid ${COLS}`}
      >
        <span>Folio</span>
        <span>Fecha y hora</span>
        <span>Atendió</span>
        <span>Método</span>
        <span>Estado</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      <ul className="divide-y divide-border">
        {ventas.map((v) => (
          <li key={v.id}>
            <Link
              href={`/panel/ventas/${v.id}`}
              className="block px-4 py-3 transition-colors duration-150 ease-out hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              {/* Celular */}
              <div className="flex flex-col gap-1 md:hidden">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold tabular-nums">Folio {formatFolio(v.folio)}</span>
                  {v.estado === "cancelada" ? <EstadoBadge estado={v.estado} /> : null}
                  <span className="ml-auto text-base">
                    <Total venta={v} />
                  </span>
                </div>
                <p className="text-[13px] text-muted">
                  {formatFechaHora(v.creadoEn)} · {METODO_LABEL[v.metodo]}
                  {v.atendio ? ` · ${v.atendio}` : null}
                </p>
              </div>

              {/* Escritorio */}
              <div className={`hidden items-center gap-3 text-[15px] md:grid ${COLS}`}>
                <span className="font-semibold tabular-nums">{formatFolio(v.folio)}</span>
                <span className="truncate text-muted">{formatFechaHora(v.creadoEn)}</span>
                <span className="truncate">{v.atendio ?? "—"}</span>
                <span>{METODO_LABEL[v.metodo]}</span>
                <span>
                  <EstadoBadge estado={v.estado} />
                </span>
                <span className="text-right">
                  <Total venta={v} />
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
