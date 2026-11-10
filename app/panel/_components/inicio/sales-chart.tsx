"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { formatCents } from "@/app/lib/format";
import { MoneyFigure } from "./stat-card";

export type ChartDay = {
  /** Inicio del periodo, "YYYY-MM-DD". */
  dia: string;
  numVentas: number;
  ventasCents: number;
  /** Semana o mes: primer y último día dentro del rango (pueden venir recortados). */
  desde?: string;
  hasta?: string;
};

export type Agrupacion = "dia" | "semana" | "mes";

// Las fechas llegan como "YYYY-MM-DD" (día de Monterrey ya calculado en la BD):
// se formatean en UTC al mediodía para que la zona del navegador no las mueva.
const at = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const corto = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short" });
const diaMes = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" });
const largo = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const mesCorto = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "short" });
const mesAnio = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "short", year: "2-digit" });
const mesLargo = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long", year: "numeric" });
const sinPunto = (s: string) => s.replace(/\./g, "");

const UNIDAD: Record<Agrupacion, [string, string]> = {
  dia: ["día", "días"],
  semana: ["semana", "semanas"],
  mes: ["mes", "meses"],
};

/** Texto completo del periodo: encabezado al elegirlo y tabla accesible. */
function nombrePeriodo(d: ChartDay, agrupacion: Agrupacion) {
  if (agrupacion === "dia") return largo.format(at(d.dia));
  if (agrupacion === "mes") {
    const mes = mesLargo.format(at(d.dia));
    if (!d.desde || !d.hasta) return mes;
    // Primer y último mes del rango pueden venir recortados: se dice desde qué día.
    const ultimo = new Date(Date.UTC(Number(d.dia.slice(0, 4)), Number(d.dia.slice(5, 7)), 0)).getUTCDate();
    const completo = d.desde === d.dia && Number(d.hasta.slice(8)) === ultimo;
    return completo ? mes : `${mes} (${sinPunto(diaMes.format(at(d.desde)))} – ${sinPunto(diaMes.format(at(d.hasta)))})`;
  }
  const ini = d.desde ?? d.dia;
  return d.hasta && d.hasta !== ini
    ? `${sinPunto(diaMes.format(at(ini)))} – ${sinPunto(diaMes.format(at(d.hasta)))}`
    : sinPunto(diaMes.format(at(ini)));
}

/** Tope "redondo" del eje y sus dos marcas (paso de 1, 1.5, 2, 2.5, 3, 4, 5, 6 u 8 × 10ⁿ pesos). */
function escala(maxCents: number) {
  const maxPesos = maxCents / 100;
  if (maxPesos <= 0) return { topCents: 0, ticks: [] as number[] };
  const bruto = maxPesos / 2;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * pot).find((s) => s >= bruto) ?? 10 * pot;
  return { topCents: paso * 2 * 100, ticks: [paso * 100, paso * 2 * 100] };
}

/** "$500", "$2.5 mil": etiquetas del eje, cortas. */
function compacto(cents: number) {
  const pesos = cents / 100;
  if (pesos < 1000) return `$${pesos.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
  return `$${(pesos / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} mil`;
}

const ventasTexto = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;

/**
 * Ventas por periodo (día, semana o mes) en columnas. Una sola serie (sin
 * leyenda): el título la nombra. Si hoy está en la gráfica va en el color de
 * marca y los demás más claros; si no, todas iguales. Al tocar o pasar sobre
 * una columna, el encabezado muestra ese periodo. Teclado: flechas y Esc.
 * Sin animaciones: Inicio es la pantalla que más se abre.
 */
export function SalesChart({
  dias,
  hoy,
  agrupacion = "dia",
}: {
  dias: ChartDay[];
  hoy: string;
  agrupacion?: Agrupacion;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const pointer = useRef<string>("mouse");

  const totalCents = dias.reduce((s, d) => s + d.ventasCents, 0);
  const totalVentas = dias.reduce((s, d) => s + d.numVentas, 0);
  const { topCents, ticks } = escala(Math.max(0, ...dias.map((d) => d.ventasCents)));
  const hoyIdx = agrupacion === "dia" ? dias.findIndex((d) => d.dia === hoy) : -1;
  // Columna resaltada: la elegida, o hoy; sin ninguna, todas en color pleno.
  const activo = sel ?? (hoyIdx >= 0 ? hoyIdx : null);
  const elegido = sel === null ? null : dias[sel];
  const pocos = dias.length <= 7;
  const [uno, varios] = UNIDAD[agrupacion];
  const cadaCuanto = agrupacion === "dia" ? (pocos ? 1 : 7) : dias.length <= 7 ? 1 : Math.ceil(dias.length / 6);
  const variosAnios = dias.length > 0 && dias[0].dia.slice(0, 4) !== dias[dias.length - 1].dia.slice(0, 4);

  function etiqueta(d: ChartDay) {
    if (agrupacion === "mes") return sinPunto((variosAnios ? mesAnio : mesCorto).format(at(d.dia)));
    if (agrupacion === "semana") return sinPunto(diaMes.format(at(d.desde ?? d.dia)));
    return sinPunto(pocos ? corto.format(at(d.dia)) : diaMes.format(at(d.dia)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") return setSel(null);
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const base = sel ?? (hoyIdx >= 0 ? hoyIdx : dias.length - 1);
    setSel(Math.min(dias.length - 1, Math.max(0, base + (sel === null ? 0 : paso))));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado: total del periodo, o el día elegido. */}
      <div aria-live="polite" className="flex min-h-[52px] flex-col gap-1">
        <p className="text-[26px] font-semibold leading-none tracking-tight">
          <MoneyFigure cents={elegido ? elegido.ventasCents : totalCents} />
        </p>
        <p className="text-sm text-muted">
          {elegido
            ? `${nombrePeriodo(elegido, agrupacion)} · ${ventasTexto(elegido.numVentas)}`
            : `${ventasTexto(totalVentas)} en ${dias.length} ${dias.length === 1 ? uno : varios}`}
        </p>
      </div>

      {topCents === 0 ? (
        <p className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-6 text-center text-sm text-muted">
          Sin ventas en este periodo.
        </p>
      ) : (
        <div>
          <div
            role="group"
            aria-label={`Ventas por ${uno}. Usa las flechas para recorrer los ${varios}.`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerLeave={() => {
              if (pointer.current === "mouse") setSel(null);
            }}
            className="relative mt-5 h-44 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {/* Rejilla: dos líneas finas. Su monto va en el margen izquierdo,
                fuera del área de las barras, para no taparlas. */}
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className="pointer-events-none absolute right-0 left-13 border-t border-border"
                style={{ bottom: `${(t / topCents) * 100}%` }}
              >
                <span className="absolute top-0 right-full -translate-y-1/2 whitespace-nowrap pr-1.5 text-[11px] tabular-nums text-muted">
                  {compacto(t)}
                </span>
              </div>
            ))}
            <div aria-hidden className="absolute right-0 bottom-0 left-13 border-t border-border-strong" />

            {/* Columnas. Toda la franja del día es el área para tocar. */}
            <div className="absolute inset-y-0 right-0 left-13 flex items-end">
              {dias.map((d, i) => {
                const alto = (d.ventasCents / topCents) * 100;
                return (
                  <div
                    key={d.dia}
                    aria-hidden
                    onPointerDown={(e) => {
                      pointer.current = e.pointerType;
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") setSel(i);
                    }}
                    onClick={() => setSel((prev) => (prev === i && pointer.current !== "mouse" ? null : i))}
                    className="flex h-full flex-1 cursor-pointer items-end justify-center px-px"
                  >
                    {d.ventasCents > 0 ? (
                      <div
                        className={`w-full max-w-6 rounded-t-[4px] ${activo === null || i === activo ? "bg-primary" : "bg-primary/35"}`}
                        style={{ height: `max(${alto}%, 2px)` }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Etiquetas: todas si son pocas; si no, una de cada tantas (contando desde la última). */}
          <div aria-hidden className="mt-2 flex pl-13">
            {dias.map((d, i) => {
              const mostrar = (dias.length - 1 - i) % cadaCuanto === 0;
              return (
                <span
                  key={d.dia}
                  className={`flex-1 whitespace-nowrap text-center text-[11px] ${
                    i === activo ? "font-semibold text-foreground" : "text-muted"
                  }`}
                >
                  {mostrar ? etiqueta(d) : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Los mismos datos para lectores de pantalla. */}
      {/* sr-only va en un div: una <table> no respeta width: 1px y ensancharía la página. */}
      <div className="sr-only">
        <table>
          <caption>Ventas por {uno}</caption>
          <thead>
            <tr>
              <th scope="col">{uno.charAt(0).toUpperCase() + uno.slice(1)}</th>
              <th scope="col">Ventas</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia}>
                <th scope="row">{nombrePeriodo(d, agrupacion)}</th>
                <td>{d.numVentas}</td>
                <td>{formatCents(d.ventasCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
