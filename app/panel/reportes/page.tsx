import type { Metadata } from "next";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { formatCents } from "@/app/lib/format";
import { getMasVendidos } from "@/app/lib/inicio";
import {
  ATAJOS,
  diasEnRango,
  getReporteResumen,
  getSinMovimiento,
  getVentasPorCategoria,
  getVentasPorMetodo,
  getVentasPorPeriodo,
  parseRango,
  SIN_MOVIMIENTO_LIMITE,
} from "@/app/lib/reportes";
import { todayYmd } from "@/app/lib/tz";
import { SalesChart } from "../_components/inicio/sales-chart";
import { Section, SinDatos, TopProducts } from "../_components/inicio/sections";
import { MoneyFigure, StatCard } from "../_components/inicio/stat-card";
import { RangePicker } from "./_components/range-picker";
import {
  CategoriaList,
  margenPct,
  MetodoList,
  PeriodoTable,
  SinMovimientoList,
} from "./_components/report-sections";

export const metadata: Metadata = { title: "Reportes" };

const NO_CARGO = "No se pudo cargar. Recarga la página.";
const AGRUPADO = { dia: "por día", semana: "por semana", mes: "por mes" } as const;

const rangoFmt = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const at = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/**
 * Reportes del dueño. Todos los números salen de funciones de la base
 * (24-ventas-y-reportes.sql) que validan el rol y el rango; la página solo
 * las pide en paralelo. Si una falla, solo esa sección dice que no cargó.
 */
export default async function ReportesPage({ searchParams }: PageProps<"/panel/reportes">) {
  const [, sp] = await Promise.all([requireDueno(), searchParams]);
  const hoy = todayYmd();
  const rango = parseRango(sp, hoy);
  const { desde, hasta } = rango;

  const picker = (resumen: string) => (
    <RangePicker
      atajos={ATAJOS}
      atajo={rango.ok ? rango.atajo : null}
      desde={desde}
      hasta={hasta}
      hoy={hoy}
      resumen={resumen}
    />
  );

  if (!rango.ok) {
    return (
      <>
        <PageHeader title="Reportes" />
        {picker("")}
        <Notice tone="danger">{rango.error}</Notice>
      </>
    );
  }

  const [resumen, porPeriodo, porCategoria, porMetodo, top, sinMov] = await Promise.all([
    getReporteResumen(desde, hasta),
    getVentasPorPeriodo(desde, hasta),
    getVentasPorCategoria(desde, hasta),
    getVentasPorMetodo(desde, hasta),
    getMasVendidos(desde, hasta, 10),
    getSinMovimiento(desde, hasta),
  ]);

  const dias = diasEnRango(desde, hasta);
  const textoRango = [
    desde === hasta ? rangoFmt.format(at(desde)) : rangoFmt.formatRange(at(desde), at(hasta)),
    `${dias} ${dias === 1 ? "día" : "días"}`,
    porPeriodo && dias > 1 ? `agrupado ${AGRUPADO[porPeriodo.agrupacion]}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .replace(/\./g, "");

  const margen = resumen ? margenPct(resumen.gananciaCents, resumen.ventasCents) : null;
  const money = (cents: number | undefined) => (cents === undefined ? "—" : <MoneyFigure cents={cents} ajustar />);
  const noCargo = resumen ? null : <span className="text-muted">{NO_CARGO}</span>;

  return (
    <>
      <PageHeader title="Reportes" />
      {picker(textoRango)}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Ventas" value={money(resumen?.ventasCents)} footer={noCargo} />
        <StatCard label="Costo de lo vendido" value={money(resumen?.costoCents)} footer={noCargo} />
        <StatCard
          label="Ganancia"
          value={money(resumen?.gananciaCents)}
          footer={
            noCargo ??
            (margen !== null ? (
              <span className="font-medium text-success">Margen {margen.toLocaleString("es-MX")}%</span>
            ) : null)
          }
        />
        <StatCard
          label="Número de ventas"
          value={resumen ? resumen.numVentas.toLocaleString("es-MX") : "—"}
          footer={noCargo}
        />
        <StatCard label="Ticket promedio" value={money(resumen?.ticketPromedioCents)} footer={noCargo} />
        <StatCard
          label="Canceladas"
          value={resumen ? resumen.numCanceladas.toLocaleString("es-MX") : "—"}
          footer={
            noCargo ??
            (resumen && resumen.numCanceladas > 0 ? (
              <span className="text-muted">{formatCents(resumen.canceladasCents)} · no cuentan en el reporte</span>
            ) : (
              <span className="text-muted">Ninguna en este rango</span>
            ))
          }
        />
      </div>

      <Section title="Ventas en el periodo">
        {porPeriodo ? (
          <>
            <SalesChart
              key={`${desde}:${hasta}`}
              dias={porPeriodo.periodos}
              hoy={hoy}
              agrupacion={porPeriodo.agrupacion}
            />
            <PeriodoTable periodos={porPeriodo.periodos} agrupacion={porPeriodo.agrupacion} />
          </>
        ) : (
          <SinDatos>{NO_CARGO}</SinDatos>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Section title="Por método de pago">
          {porMetodo ? <MetodoList items={porMetodo} /> : <SinDatos>{NO_CARGO}</SinDatos>}
        </Section>
        <Section title="Por categoría">
          {porCategoria ? <CategoriaList items={porCategoria} /> : <SinDatos>{NO_CARGO}</SinDatos>}
        </Section>
        <Section title="Más vendidos">
          {top ? <TopProducts items={top} /> : <SinDatos>{NO_CARGO}</SinDatos>}
        </Section>
        <Section title="Sin movimiento">
          {sinMov ? (
            <SinMovimientoList items={sinMov} limite={SIN_MOVIMIENTO_LIMITE} />
          ) : (
            <SinDatos>{NO_CARGO}</SinDatos>
          )}
        </Section>
      </div>
    </>
  );
}
