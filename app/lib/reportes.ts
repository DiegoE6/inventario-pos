import "server-only";
import type { MetodoPago } from "@/app/components/ticket";
import type { Unidad } from "@/app/lib/format";
import { createClient } from "@/app/lib/supabase/server";
import { addDays, isYmd } from "@/app/lib/tz";

/**
 * Lecturas de Reportes (solo dueño). Todo se calcula en la base con las
 * funciones de 24-ventas-y-reportes.sql (SECURITY DEFINER, validan el rol y
 * el rango); aquí solo se piden con la sesión del usuario y se pasan a
 * centavos. Nunca se traen ventas sueltas ni costos de las tablas.
 */

const cents = (value: number | string | null | undefined) => Math.round(Number(value ?? 0) * 100);

// -----------------------------------------------------------------------------
// Rango
// -----------------------------------------------------------------------------

/** Igual que privado.rango_reporte: hasta 366 días contando ambos extremos. */
export const MAX_DIAS = 366;

export type Atajo = "hoy" | "semana" | "mes" | "mes-pasado";

export const ATAJOS: { valor: Atajo; label: string }[] = [
  { valor: "hoy", label: "Hoy" },
  { valor: "semana", label: "Esta semana" },
  { valor: "mes", label: "Este mes" },
  { valor: "mes-pasado", label: "Mes pasado" },
];

/** Días entre dos fechas "YYYY-MM-DD", contando ambos. */
export function diasEnRango(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Rango de cada atajo, con la semana de lunes a domingo (igual que la BD). */
export function rangoDeAtajo(atajo: Atajo, hoy: string): { desde: string; hasta: string } {
  const primeroDelMes = `${hoy.slice(0, 8)}01`;
  switch (atajo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "semana": {
      const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
      return { desde: addDays(hoy, -((dow + 6) % 7)), hasta: hoy };
    }
    case "mes":
      return { desde: primeroDelMes, hasta: hoy };
    case "mes-pasado": {
      const hasta = addDays(primeroDelMes, -1);
      return { desde: `${hasta.slice(0, 8)}01`, hasta };
    }
  }
}

export type RangoReporte =
  | { ok: true; desde: string; hasta: string; atajo: Atajo | null }
  | { ok: false; desde: string; hasta: string; error: string };

/** Lee ?desde=&hasta= (o ?rango=atajo). Sin nada: este mes. */
export function parseRango(sp: Record<string, string | string[] | undefined>, hoy: string): RangoReporte {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const atajoParam = one(sp.rango);
  let desde = one(sp.desde);
  let hasta = one(sp.hasta);

  if (!isYmd(desde) || !isYmd(hasta)) {
    const atajo = ATAJOS.some((a) => a.valor === atajoParam) ? (atajoParam as Atajo) : "mes";
    return { ok: true, ...rangoDeAtajo(atajo, hoy), atajo };
  }
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (diasEnRango(desde, hasta) > MAX_DIAS) {
    return { ok: false, desde, hasta, error: `El rango no puede ser mayor a ${MAX_DIAS} días. Elige uno más corto.` };
  }
  const atajo =
    ATAJOS.find((a) => {
      const r = rangoDeAtajo(a.valor, hoy);
      return r.desde === desde && r.hasta === hasta;
    })?.valor ?? null;
  return { ok: true, desde, hasta, atajo };
}

// -----------------------------------------------------------------------------
// Consultas
// -----------------------------------------------------------------------------

export type ReporteResumen = {
  numVentas: number;
  ventasCents: number;
  costoCents: number;
  gananciaCents: number;
  ticketPromedioCents: number;
  numCanceladas: number;
  canceladasCents: number;
};

export async function getReporteResumen(desde: string, hasta: string): Promise<ReporteResumen | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reporte_resumen", { p_desde: desde, p_hasta: hasta })
    .single<{
      num_ventas: number;
      ventas: number | string;
      costo: number | string;
      ganancia: number | string;
      ticket_promedio: number | string;
      num_canceladas: number;
      canceladas: number | string;
    }>();
  if (error || !data) {
    console.error("[reporte_resumen]", error);
    return null;
  }
  return {
    numVentas: data.num_ventas,
    ventasCents: cents(data.ventas),
    costoCents: cents(data.costo),
    gananciaCents: cents(data.ganancia),
    ticketPromedioCents: cents(data.ticket_promedio),
    numCanceladas: data.num_canceladas,
    canceladasCents: cents(data.canceladas),
  };
}

export type Agrupacion = "dia" | "semana" | "mes";

export type VentaPeriodo = {
  dia: string;
  desde: string;
  hasta: string;
  numVentas: number;
  ventasCents: number;
  costoCents: number;
  gananciaCents: number;
};

/** Un renglón por día, semana o mes; la BD decide la agrupación por el largo del rango. */
export async function getVentasPorPeriodo(
  desde: string,
  hasta: string
): Promise<{ agrupacion: Agrupacion; periodos: VentaPeriodo[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporte_ventas_por_periodo", { p_desde: desde, p_hasta: hasta });
  if (error || !data) {
    console.error("[reporte_ventas_por_periodo]", error);
    return null;
  }
  const rows = data as {
    agrupacion: Agrupacion;
    periodo: string;
    desde: string;
    hasta: string;
    num_ventas: number;
    ventas: number | string;
    costo: number | string;
    ganancia: number | string;
  }[];
  return {
    agrupacion: rows[0]?.agrupacion ?? "dia",
    periodos: rows.map((r) => ({
      dia: r.periodo,
      desde: r.desde,
      hasta: r.hasta,
      numVentas: r.num_ventas,
      ventasCents: cents(r.ventas),
      costoCents: cents(r.costo),
      gananciaCents: cents(r.ganancia),
    })),
  };
}

export type VentaCategoria = {
  categoriaId: number | null;
  nombre: string;
  numVentas: number;
  ventasCents: number;
  costoCents: number;
  gananciaCents: number;
};

export async function getVentasPorCategoria(desde: string, hasta: string): Promise<VentaCategoria[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporte_por_categoria", { p_desde: desde, p_hasta: hasta });
  if (error || !data) {
    console.error("[reporte_por_categoria]", error);
    return null;
  }
  return (
    data as {
      categoria_id: number | null;
      categoria: string;
      num_ventas: number;
      ventas: number | string;
      costo: number | string;
      ganancia: number | string;
    }[]
  ).map((r) => ({
    categoriaId: r.categoria_id,
    nombre: r.categoria,
    numVentas: r.num_ventas,
    ventasCents: cents(r.ventas),
    costoCents: cents(r.costo),
    gananciaCents: cents(r.ganancia),
  }));
}

export type VentaMetodo = { metodo: MetodoPago; numVentas: number; ventasCents: number };

export async function getVentasPorMetodo(desde: string, hasta: string): Promise<VentaMetodo[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporte_por_metodo", { p_desde: desde, p_hasta: hasta });
  if (error || !data) {
    console.error("[reporte_por_metodo]", error);
    return null;
  }
  return (data as { metodo_pago: MetodoPago; num_ventas: number; ventas: number | string }[]).map((r) => ({
    metodo: r.metodo_pago,
    numVentas: r.num_ventas,
    ventasCents: cents(r.ventas),
  }));
}

export type SinMovimiento = {
  productoId: string;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  categoria: string | null;
  stock: number;
  valorCents: number;
  ultimaVenta: string | null;
};

export const SIN_MOVIMIENTO_LIMITE = 50;

/** Productos con stock que no se vendieron en el rango, del de más dinero detenido al de menos. */
export async function getSinMovimiento(desde: string, hasta: string): Promise<SinMovimiento[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporte_sin_movimiento", {
    p_desde: desde,
    p_hasta: hasta,
    p_limite: SIN_MOVIMIENTO_LIMITE,
  });
  if (error || !data) {
    console.error("[reporte_sin_movimiento]", error);
    return null;
  }
  return (
    data as {
      producto_id: string;
      codigo: string;
      nombre: string;
      unidad: Unidad;
      categoria: string | null;
      stock: number | string;
      valor_detenido: number | string;
      ultima_venta: string | null;
    }[]
  ).map((r) => ({
    productoId: r.producto_id,
    codigo: r.codigo,
    nombre: r.nombre,
    unidad: r.unidad,
    categoria: r.categoria,
    stock: Number(r.stock),
    valorCents: cents(r.valor_detenido),
    ultimaVenta: r.ultima_venta,
  }));
}
