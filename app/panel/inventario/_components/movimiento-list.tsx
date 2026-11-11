import Link from "next/link";
import type { Movimiento, TipoMovimiento } from "@/app/lib/inventario";
import { formatQuantity, unidadCorta } from "@/app/lib/format";
import { formatFechaHora } from "@/app/lib/tz";

export const TIPO_LABEL: Record<TipoMovimiento, string> = {
  entrada: "Entrada",
  venta: "Venta",
  merma: "Merma",
  ajuste: "Ajuste",
  cancelacion_venta: "Cancelación",
};

const TIPO_CLASS: Record<TipoMovimiento, string> = {
  entrada: "bg-success-soft text-success",
  venta: "bg-surface-muted text-muted",
  merma: "bg-danger-soft text-danger",
  ajuste: "bg-primary-soft text-primary-ink",
  cancelacion_venta: "bg-surface-muted text-foreground",
};

const qty = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 });

/** Lista de movimientos: historial, ficha del producto y formularios. */
export function MovimientoList({
  movimientos,
  showProducto = true,
  vacio = "No hay movimientos.",
}: {
  movimientos: Movimiento[];
  showProducto?: boolean;
  vacio?: string;
}) {
  if (movimientos.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-base text-muted">
        {vacio}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      {movimientos.map((m) => {
        const unidad = m.producto?.unidad ?? "pieza";
        const positivo = m.cantidad > 0;
        return (
          <li key={m.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold ${TIPO_CLASS[m.tipo]}`}>
                {TIPO_LABEL[m.tipo]}
              </span>
              <div className="min-w-0 flex-1">
                {showProducto && m.producto ? (
                  <Link
                    href={`/panel/productos/${m.producto.id}`}
                    className="line-clamp-2 text-base font-medium leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-primary-ink"
                  >
                    {m.producto.nombre}
                  </Link>
                ) : null}
                <p className="text-[13px] text-muted tabular-nums">
                  Stock {qty.format(m.stock_anterior)} → {qty.format(m.stock_nuevo)} {unidadCorta(unidad, m.stock_nuevo)}
                </p>
              </div>
              <span
                className={`shrink-0 text-base font-semibold tabular-nums ${positivo ? "text-success" : "text-danger"}`}
              >
                {positivo ? "+" : "−"}
                {formatQuantity(Math.abs(m.cantidad), unidad)}
              </span>
            </div>
            <p className="text-[13px] text-muted">
              {formatFechaHora(m.creado_en)}
              {m.usuario ? ` · ${m.usuario}` : null}
              {m.folio ? ` · Folio ${String(m.folio).padStart(6, "0")}` : null}
            </p>
            {m.nota ? <p className="text-sm text-foreground/80">{m.nota}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
