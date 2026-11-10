import Link from "next/link";
import { METODO_LABEL } from "@/app/components/ticket";
import { formatCents, formatQuantity } from "@/app/lib/format";
import type { Agrupacion, SinMovimiento, VentaCategoria, VentaMetodo, VentaPeriodo } from "@/app/lib/reportes";
import { SinDatos } from "../../_components/inicio/sections";

/** Margen sobre la venta con 1 decimal, en enteros (sin acumular floats). */
export function margenPct(gananciaCents: number, ventasCents: number): number | null {
  if (ventasCents <= 0) return null;
  return Math.round((gananciaCents * 1000) / ventasCents) / 10;
}

const pct = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
const ventasTexto = (n: number) => `${n.toLocaleString("es-MX")} ${n === 1 ? "venta" : "ventas"}`;

/** Barra fina con la proporción contra el mayor. Una sola serie: un solo color. */
function Barra({ valor, max }: { valor: number; max: number }) {
  return (
    <div aria-hidden className="h-1.5 rounded-full bg-surface-muted">
      {valor > 0 ? (
        <div className="h-full rounded-full bg-primary/70" style={{ width: `max(${(valor / (max || 1)) * 100}%, 4px)` }} />
      ) : null}
    </div>
  );
}

/** Por método: los tres siempre, con su parte del total. */
export function MetodoList({ items }: { items: VentaMetodo[] }) {
  const total = items.reduce((s, m) => s + m.ventasCents, 0);
  if (total === 0) return <SinDatos>Sin ventas en este rango.</SinDatos>;
  const max = Math.max(...items.map((m) => m.ventasCents));
  return (
    <ul className="flex flex-col gap-4">
      {items.map((m) => (
        <li key={m.metodo} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium">{METODO_LABEL[m.metodo]}</span>
              <span className="text-[13px] text-muted tabular-nums">
                {ventasTexto(m.numVentas)} · {pct.format((m.ventasCents * 100) / total)}%
              </span>
            </div>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatCents(m.ventasCents)}</span>
          </div>
          <Barra valor={m.ventasCents} max={max} />
        </li>
      ))}
    </ul>
  );
}

/** Por categoría: venta, ganancia y margen. */
export function CategoriaList({ items }: { items: VentaCategoria[] }) {
  if (items.length === 0) return <SinDatos>Sin ventas en este rango.</SinDatos>;
  const max = Math.max(...items.map((c) => c.ventasCents));
  return (
    <ul className="flex flex-col gap-4">
      {items.map((c) => {
        const margen = margenPct(c.gananciaCents, c.ventasCents);
        return (
          <li key={c.categoriaId ?? "sin"} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-[15px] font-medium ${c.categoriaId === null ? "italic" : ""}`}>
                  {c.nombre}
                </span>
                <span className="text-[13px] text-muted tabular-nums">
                  Ganancia {formatCents(c.gananciaCents)}
                  {margen !== null ? ` · margen ${pct.format(margen)}%` : null}
                </span>
              </div>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatCents(c.ventasCents)}</span>
            </div>
            <Barra valor={c.ventasCents} max={max} />
          </li>
        );
      })}
    </ul>
  );
}

const diaMes = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const mesAnio = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long", year: "numeric" });
const at = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

function periodoTexto(p: VentaPeriodo, agrupacion: Agrupacion) {
  if (agrupacion === "dia") return diaMes.format(at(p.dia));
  if (agrupacion === "mes" && p.desde === p.dia) {
    const ultimo = new Date(Date.UTC(Number(p.dia.slice(0, 4)), Number(p.dia.slice(5, 7)), 0)).getUTCDate();
    if (Number(p.hasta.slice(8)) === ultimo) return mesAnio.format(at(p.dia));
  }
  return diaMes.formatRange(at(p.desde), at(p.hasta));
}

/** La misma información de la gráfica, con costo y ganancia, como tabla. */
export function PeriodoTable({ periodos, agrupacion }: { periodos: VentaPeriodo[]; agrupacion: Agrupacion }) {
  const titulo = agrupacion === "dia" ? "Día" : agrupacion === "semana" ? "Semana" : "Mes";
  return (
    <details className="group rounded-[var(--radius-control)] border border-border">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Ver como tabla
        <span aria-hidden className="text-muted transition-transform duration-150 ease-out group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[480px] text-sm tabular-nums">
          <thead className="bg-surface-muted text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{titulo}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Ventas</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Importe</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Costo</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Ganancia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {periodos.map((p) => (
              <tr key={p.dia}>
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal">
                  {periodoTexto(p, agrupacion)}
                </th>
                <td className="px-3 py-2 text-right">{p.numVentas}</td>
                <td className="px-3 py-2 text-right">{formatCents(p.ventasCents)}</td>
                <td className="px-3 py-2 text-right text-muted">{formatCents(p.costoCents)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCents(p.gananciaCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const fechaCorta = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Monterrey",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Lo que no se vendió en el rango, del que más dinero tiene detenido al que menos. */
export function SinMovimientoList({ items, limite }: { items: SinMovimiento[]; limite: number }) {
  if (items.length === 0) {
    return <SinDatos>Todo lo que tiene existencias se vendió al menos una vez en este rango.</SinDatos>;
  }
  return (
    <>
      <p className="-mt-2 text-sm text-muted">
        Productos con existencias que no se vendieron en este rango.
        {items.length >= limite ? ` Se muestran los ${limite} con más dinero detenido.` : null}
      </p>
      <ul className="-my-1 flex flex-col divide-y divide-border">
        {items.map((p) => (
          <li key={p.productoId} className="flex items-start gap-3 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link
                href={`/panel/productos/${p.productoId}`}
                className="line-clamp-2 text-[15px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {p.nombre}
              </Link>
              <span className="text-[13px] text-muted tabular-nums">
                {formatQuantity(p.stock, p.unidad)} en existencia
                {p.categoria ? ` · ${p.categoria}` : null}
              </span>
              <span className="text-[13px] text-muted">
                {p.ultimaVenta
                  ? `Última venta: ${fechaCorta.format(new Date(p.ultimaVenta)).replace(/\./g, "")}`
                  : "Nunca se ha vendido"}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-[15px] font-semibold tabular-nums">{formatCents(p.valorCents)}</span>
              <span className="text-[12px] text-muted">detenido</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
