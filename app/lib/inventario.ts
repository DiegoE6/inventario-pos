import "server-only";
import { createClient } from "@/app/lib/supabase/server";
import type { Unidad } from "@/app/lib/format";
import { dayRange, isYmd } from "@/app/lib/tz";

/**
 * Lecturas de inventario para Server Components (solo dueño: RLS de
 * movimientos_inventario solo deja leer al dueño). Sin service_role.
 */

export const TIPOS = ["entrada", "venta", "merma", "ajuste", "cancelacion_venta"] as const;
export type TipoMovimiento = (typeof TIPOS)[number];

export type Movimiento = {
  id: number;
  creado_en: string;
  tipo: TipoMovimiento;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  costo_unitario: number | null;
  nota: string | null;
  producto: { id: string; codigo: string; nombre: string; unidad: Unidad } | null;
  usuario: string | null;
  folio: number | null;
};

const SELECT =
  "id, creado_en, tipo, cantidad, stock_anterior, stock_nuevo, costo_unitario, nota, producto_id," +
  " productos(id, codigo, nombre, unidad), perfiles(nombre), ventas(folio)";

type Row = Omit<Movimiento, "producto" | "usuario" | "folio"> & {
  productos: Movimiento["producto"];
  perfiles: { nombre: string } | null;
  ventas: { folio: number } | null;
};

function toMovimiento(r: Row): Movimiento {
  return {
    id: r.id,
    creado_en: r.creado_en,
    tipo: r.tipo,
    cantidad: Number(r.cantidad),
    stock_anterior: Number(r.stock_anterior),
    stock_nuevo: Number(r.stock_nuevo),
    costo_unitario: r.costo_unitario === null ? null : Number(r.costo_unitario),
    nota: r.nota,
    producto: r.productos,
    usuario: r.perfiles?.nombre ?? null,
    folio: r.ventas?.folio ?? null,
  };
}

/** Últimos movimientos de un producto (ficha y formularios de inventario). */
export async function movimientosDeProducto(productoId: string, limite = 10): Promise<Movimiento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("movimientos_inventario")
    .select(SELECT)
    .eq("producto_id", productoId)
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite);
  if (error) console.error("[movimientos producto]", error);
  return ((data ?? []) as unknown as Row[]).map(toMovimiento);
}

// -----------------------------------------------------------------------------
// Historial paginado con filtros
// -----------------------------------------------------------------------------

export const MOV_PAGE_SIZE = 25;

export type MovimientosQuery = {
  desde: string | null;
  hasta: string | null;
  tipo: TipoMovimiento | null;
  producto: string | null;
  pagina: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMovimientosQuery(sp: Record<string, string | string[] | undefined>): MovimientosQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  let desde = isYmd(one(sp.desde)) ? one(sp.desde) : null;
  let hasta = isYmd(one(sp.hasta)) ? one(sp.hasta) : null;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const tipo = one(sp.tipo);
  const producto = one(sp.producto);
  const pag = Number.parseInt(one(sp.pagina), 10);
  return {
    desde,
    hasta,
    tipo: (TIPOS as readonly string[]).includes(tipo) ? (tipo as TipoMovimiento) : null,
    producto: UUID_RE.test(producto) ? producto : null,
    pagina: Number.isFinite(pag) && pag >= 1 && pag <= 10_000 ? pag : 1,
  };
}

export async function listMovimientos(query: MovimientosQuery) {
  const supabase = await createClient();
  const from = (query.pagina - 1) * MOV_PAGE_SIZE;
  // Días de Monterrey → rango UTC sobre creado_en (usa su índice).
  const { gte, lt } = dayRange(query.desde, query.hasta);

  let request = supabase.from("movimientos_inventario").select(SELECT, { count: "exact" });
  if (gte) request = request.gte("creado_en", gte);
  if (lt) request = request.lt("creado_en", lt);
  if (query.tipo) request = request.eq("tipo", query.tipo);
  if (query.producto) request = request.eq("producto_id", query.producto);

  const { data, count, error } = await request
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + MOV_PAGE_SIZE - 1);

  // PGRST103: página fuera de rango.
  if (error && error.code !== "PGRST103") console.error("[movimientos]", error);

  return {
    movimientos: ((error ? [] : data) ?? []).map((r) => toMovimiento(r as unknown as Row)),
    total: count ?? 0,
    paginas: Math.max(1, Math.ceil((count ?? 0) / MOV_PAGE_SIZE)),
  };
}
