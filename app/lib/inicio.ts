import "server-only";
import { createClient } from "@/app/lib/supabase/server";
import type { Unidad } from "@/app/lib/format";
import { addDays, startOfDay, TZ } from "@/app/lib/tz";

/**
 * Lecturas de Inicio. Todos los cálculos se hacen en la base (16-inicio.sql,
 * mas_vendidos y v_stock_bajo); aquí solo se piden y se pasan a centavos.
 * Con la sesión del usuario: las funciones validan rol y perfil activo.
 */

/** numeric de PostgREST → centavos enteros (solo para mostrar y comparar). */
const cents = (value: number | string | null | undefined) => Math.round(Number(value ?? 0) * 100);

export type Periodo = 7 | 30;

export function parsePeriodo(value: unknown): Periodo {
  return value === "30" ? 30 : 7;
}

// -----------------------------------------------------------------------------
// Hoy y la comparación contra el mismo día de la semana pasada
// -----------------------------------------------------------------------------

export type Resumen = { numVentas: number; ventasCents: number; gananciaCents: number | null };

async function resumenVentas(desde: Date, hasta: Date): Promise<Resumen | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("resumen_ventas", { p_desde: desde.toISOString(), p_hasta: hasta.toISOString() })
    .single<{ num_ventas: number; ventas: number | string; ganancia: number | string | null }>();
  if (error || !data) {
    console.error("[resumen_ventas]", error);
    return null;
  }
  return {
    numVentas: data.num_ventas,
    ventasCents: cents(data.ventas),
    gananciaCents: data.ganancia === null ? null : cents(data.ganancia),
  };
}

const weekdayFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long" });

export type Hoy = {
  hoy: Resumen | null;
  /** Mismo día de la semana pasada, de las 00:00 a la misma hora que ahora. */
  antes: Resumen | null;
  /** "jueves" */
  diaAntes: string;
};

/**
 * Hoy (de las 00:00 de Monterrey a ahora) y el mismo día de hace una semana
 * hasta la misma hora. Dueño: todo el negocio. Cajero: solo sus ventas
 * (y sin ganancia); `comparar = false` evita la segunda consulta.
 */
export async function getHoy(hoyYmd: string, now: Date, comparar: boolean): Promise<Hoy> {
  const inicioHoy = startOfDay(hoyYmd);
  const inicioAntes = startOfDay(addDays(hoyYmd, -7));
  const finAntes = new Date(inicioAntes.getTime() + (now.getTime() - inicioHoy.getTime()));
  // resumen_ventas usa [desde, hasta): +1 ms para incluir una venta de este mismo instante.
  const hasta = new Date(now.getTime() + 1);

  const [hoy, antes] = await Promise.all([
    resumenVentas(inicioHoy, hasta),
    comparar ? resumenVentas(inicioAntes, new Date(finAntes.getTime() + 1)) : Promise.resolve(null),
  ]);
  return { hoy, antes, diaAntes: weekdayFmt.format(inicioAntes) };
}

/**
 * Cambio porcentual contra la semana pasada, redondeado a entero.
 * null si no hay con qué comparar (antes fue 0, negativo o no se pudo leer).
 */
export function cambioPct(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null || anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

// -----------------------------------------------------------------------------
// Gráfica, más vendidos y valor del inventario (solo dueño)
// -----------------------------------------------------------------------------

export type VentaDia = { dia: string; numVentas: number; ventasCents: number };

export async function getVentasPorDia(desde: string, hasta: string): Promise<VentaDia[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ventas_por_dia", { p_desde: desde, p_hasta: hasta });
  if (error || !data) {
    console.error("[ventas_por_dia]", error);
    return null;
  }
  return (data as { dia: string; num_ventas: number; ventas: number | string }[]).map((d) => ({
    dia: d.dia,
    numVentas: d.num_ventas,
    ventasCents: cents(d.ventas),
  }));
}

export type MasVendido = {
  productoId: string;
  nombre: string;
  unidad: Unidad;
  cantidad: number;
  importeCents: number;
};

/** Top por importe vendido (mas_vendidos ya ordena así). */
export async function getMasVendidos(desde: string, hasta: string, limite = 5): Promise<MasVendido[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mas_vendidos", {
    p_desde: desde,
    p_hasta: hasta,
    p_limite: limite,
  });
  if (error || !data) {
    console.error("[mas_vendidos]", error);
    return null;
  }
  return (
    data as { producto_id: string; nombre: string; unidad: Unidad; cantidad: number | string; importe: number | string }[]
  ).map((m) => ({
    productoId: m.producto_id,
    nombre: m.nombre,
    unidad: m.unidad,
    cantidad: Number(m.cantidad),
    importeCents: cents(m.importe),
  }));
}

export async function getValorInventario(): Promise<{ valorCents: number; productos: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("valor_inventario")
    .single<{ valor: number | string; productos: number }>();
  if (error || !data) {
    console.error("[valor_inventario]", error);
    return null;
  }
  return { valorCents: cents(data.valor), productos: data.productos };
}

// -----------------------------------------------------------------------------
// Stock bajo (dueño y cajero: v_stock_bajo no tiene costos)
// -----------------------------------------------------------------------------

export type StockBajo = {
  id: string;
  nombre: string;
  unidad: Unidad;
  stock: number;
  stockMinimo: number;
};

const STOCK_BAJO_LIMITE = 50;

/** Agotados primero; luego los que tienen menos stock respecto a su mínimo. */
export async function getStockBajo(): Promise<{ items: StockBajo[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("v_stock_bajo")
    .select("id, nombre, unidad, stock, stock_minimo", { count: "exact" })
    .order("nombre")
    .limit(STOCK_BAJO_LIMITE);
  if (error || !data) {
    console.error("[v_stock_bajo]", error);
    return null;
  }
  const items = data
    .map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      unidad: p.unidad as Unidad,
      stock: Number(p.stock),
      stockMinimo: Number(p.stock_minimo),
    }))
    .sort((a, b) => ratio(a) - ratio(b));
  return { items, total: count ?? items.length };
}

function ratio(p: StockBajo) {
  if (p.stock <= 0) return -1;
  return p.stockMinimo > 0 ? p.stock / p.stockMinimo : 1;
}
