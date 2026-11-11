import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { verifySession } from "@/app/lib/auth";
import {
  cambioPct,
  getHoy,
  getMasVendidos,
  getStockBajo,
  getValorInventario,
  getVentasPorDia,
  parsePeriodo,
} from "@/app/lib/inicio";
import { addDays, todayYmd, TZ } from "@/app/lib/tz";
import { SalesChart } from "./_components/inicio/sales-chart";
import { LowStockList, PeriodTabs, Section, SinDatos, TopProducts } from "./_components/inicio/sections";
import { Delta, MoneyFigure, StatCard } from "./_components/inicio/stat-card";

export const metadata: Metadata = { title: "Inicio" };

const AVISOS: Record<string, string> = {
  "solo-dueno": "Esa sección es solo para el dueño del negocio.",
};

const fechaHoy = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

const NO_CARGO = "No se pudo cargar. Recarga la página.";

export default async function InicioPage({ searchParams }: PageProps<"/panel">) {
  const [session, sp] = await Promise.all([verifySession(), searchParams]);
  const aviso = typeof sp.aviso === "string" ? AVISOS[sp.aviso] : undefined;
  const nombre = session.nombre.split(" ")[0];
  const esDueno = session.rol === "dueno";

  const now = new Date();
  const hoy = todayYmd(now);
  const periodo = parsePeriodo(sp.periodo);
  const desde = addDays(hoy, -(periodo - 1));

  // Todo en paralelo. Lo que es solo del dueño ni se pide para el cajero.
  const [resumen, stockBajo, ventasDia, top, valor] = await Promise.all([
    getHoy(hoy, now, esDueno),
    getStockBajo(),
    esDueno ? getVentasPorDia(desde, hoy) : Promise.resolve(null),
    esDueno ? getMasVendidos(desde, hoy, 5) : Promise.resolve(null),
    esDueno ? getValorInventario() : Promise.resolve(null),
  ]);
  const { hoy: rHoy, antes: rAntes, diaAntes } = resumen;

  const header = (
    <>
      <PageHeader title={nombre ? `Hola, ${nombre}` : "Inicio"} description={capitalize(fechaHoy.format(now))} />
      {aviso ? <Notice tone="danger">{aviso}</Notice> : null}
    </>
  );

  const ventasCard = (label: string) => (
    <StatCard
      label={label}
      value={rHoy ? <MoneyFigure cents={rHoy.ventasCents} ajustar /> : "—"}
      footer={
        !rHoy ? (
          <span className="text-muted">{NO_CARGO}</span>
        ) : rHoy.numVentas === 0 ? (
          <Link href="/panel/vender" className="font-medium text-primary-ink hover:underline">
            Todavía no hay ventas hoy
          </Link>
        ) : esDueno ? (
          <Delta pct={cambioPct(rHoy.ventasCents, rAntes?.ventasCents)} dia={diaAntes} />
        ) : null
      }
    />
  );

  const numVentasCard = (
    <StatCard
      label="Número de ventas"
      value={rHoy ? rHoy.numVentas.toLocaleString("es-MX") : "—"}
    />
  );

  const stockBajoLista = (
    <Section id="stock-bajo" title="Se está acabando">
      {stockBajo ? (
        <>
          {!esDueno && stockBajo.items.length > 0 ? (
            <p className="-mt-2 text-sm text-muted">Avísale al dueño para que lo pida.</p>
          ) : null}
          <LowStockList items={stockBajo.items} puedeRegistrar={esDueno} />
        </>
      ) : (
        <SinDatos>{NO_CARGO}</SinDatos>
      )}
    </Section>
  );

  // ---------------------------------------------------------------------------
  // Cajero: vender primero, sus ventas de hoy y lo que se acaba (sin costos).
  // ---------------------------------------------------------------------------
  if (!esDueno) {
    return (
      <>
        {header}
        <Link
          href="/panel/vender"
          className="flex h-16 w-full items-center justify-center gap-3 rounded-[var(--radius-card)] bg-primary text-lg font-semibold text-on-primary transition-[transform,background-color] duration-150 ease-out hover:bg-primary-hover motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
        >
          <ShoppingCart aria-hidden className="size-6" />
          Vender
        </Link>
        <div className="grid grid-cols-2 gap-3">
          {ventasCard("Tus ventas de hoy")}
          {numVentasCard}
        </div>
        {stockBajoLista}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Dueño
  // ---------------------------------------------------------------------------
  const gananciaPct = cambioPct(rHoy?.gananciaCents, rAntes?.gananciaCents);

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ventasCard("Ventas de hoy")}
        <StatCard
          label="Ganancia de hoy"
          value={rHoy?.gananciaCents != null ? <MoneyFigure cents={rHoy.gananciaCents} ajustar /> : "—"}
          footer={
            !rHoy ? (
              <span className="text-muted">{NO_CARGO}</span>
            ) : rHoy.numVentas > 0 ? (
              <Delta pct={gananciaPct} dia={diaAntes} />
            ) : null
          }
        />
        {numVentasCard}
        <StatCard
          label="Stock bajo"
          href="#stock-bajo"
          value={stockBajo ? stockBajo.total.toLocaleString("es-MX") : "—"}
          footer={
            <span className="text-muted">
              {!stockBajo
                ? NO_CARGO
                : stockBajo.total === 0
                  ? "Todo en orden"
                  : stockBajo.total === 1
                    ? "producto por pedir"
                    : "productos por pedir"}
            </span>
          }
        />
      </div>

      <Section title="Ventas" actions={<PeriodTabs periodo={periodo} />}>
        {ventasDia ? <SalesChart key={periodo} dias={ventasDia} hoy={hoy} /> : <SinDatos>{NO_CARGO}</SinDatos>}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Section title={`Más vendidos · ${periodo} días`}>
          {top ? <TopProducts items={top} /> : <SinDatos>{NO_CARGO}</SinDatos>}
        </Section>
        {stockBajoLista}
      </div>

      <StatCard
        label="Valor del inventario a costo"
        value={valor ? <MoneyFigure cents={valor.valorCents} /> : "—"}
        footer={
          <span className="text-muted">
            {valor
              ? `Lo que te costó la mercancía que tienes hoy · ${valor.productos.toLocaleString("es-MX")} ${valor.productos === 1 ? "producto activo" : "productos activos"}`
              : NO_CARGO}
          </span>
        }
      />
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
