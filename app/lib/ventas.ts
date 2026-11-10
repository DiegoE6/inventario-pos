import "server-only";
import { cache } from "react";
import type { MetodoPago } from "@/app/components/ticket";
import { isUuid } from "@/app/lib/data";
import type { Unidad } from "@/app/lib/format";
import { createClient } from "@/app/lib/supabase/server";
import { addDays, dayRange, isYmd } from "@/app/lib/tz";

/**
 * Lecturas de Ventas para Server Components, con la sesión del usuario.
 * La RLS de ventas decide qué se ve: el dueño, todas; el cajero, solo las
 * suyas. venta_detalle hereda esa regla y su costo no se lee (20-costos).
 *
 * ventas tiene dos llaves a perfiles (usuario_id y cancelada_por, 24): el
 * embed se desambigua con el nombre de la columna. La RLS de perfiles solo
 * deja al cajero leer el suyo, así que para él "quién canceló" llega null.
 */

export const METODOS = ["efectivo", "tarjeta", "transferencia"] as const;
export const ESTADOS = ["completada", "cancelada"] as const;
export type EstadoVenta = (typeof ESTADOS)[number];

export const VENTAS_PAGE_SIZE = 25;

export type VentaLista = {
  id: string;
  folio: number;
  creadoEn: string;
  total: number;
  metodo: MetodoPago;
  estado: EstadoVenta;
  atendio: string | null;
};

export type VentasQuery = {
  desde: string | null;
  hasta: string | null;
  estado: EstadoVenta | null;
  metodo: MetodoPago | null;
  pagina: number;
};

/** Sin fechas en la URL: los últimos 7 días (hoy incluido, días de Monterrey). */
export function rangoPorDefecto(hoy: string) {
  return { desde: addDays(hoy, -6), hasta: hoy };
}

/**
 * Lee y sanea los searchParams. Sin desde ni hasta se aplican los últimos 7
 * días: así abrir Ventas no cuenta toda la historia cada vez.
 */
export function parseVentasQuery(sp: Record<string, string | string[] | undefined>, hoy: string): VentasQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  let desde = isYmd(one(sp.desde)) ? one(sp.desde) : null;
  let hasta = isYmd(one(sp.hasta)) ? one(sp.hasta) : null;
  if (!desde && !hasta) ({ desde, hasta } = rangoPorDefecto(hoy));
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const estado = one(sp.estado);
  const metodo = one(sp.metodo);
  const pag = Number.parseInt(one(sp.pagina), 10);
  return {
    desde,
    hasta,
    estado: (ESTADOS as readonly string[]).includes(estado) ? (estado as EstadoVenta) : null,
    metodo: (METODOS as readonly string[]).includes(metodo) ? (metodo as MetodoPago) : null,
    pagina: Number.isFinite(pag) && pag >= 1 && pag <= 10_000 ? pag : 1,
  };
}

type ListaRow = {
  id: string;
  folio: number;
  creado_en: string;
  total: number | string;
  metodo_pago: MetodoPago;
  estado: EstadoVenta;
  atendio: { nombre: string } | null;
};

/** Página de ventas, la más reciente primero. Filtra y pagina la BD. */
export async function listVentas(query: VentasQuery) {
  const supabase = await createClient();
  const from = (query.pagina - 1) * VENTAS_PAGE_SIZE;
  const { gte, lt } = dayRange(query.desde, query.hasta);

  let request = supabase
    .from("ventas")
    .select("id, folio, creado_en, total, metodo_pago, estado, atendio:perfiles!usuario_id(nombre)", {
      count: "exact",
    });
  if (gte) request = request.gte("creado_en", gte);
  if (lt) request = request.lt("creado_en", lt);
  if (query.estado) request = request.eq("estado", query.estado);
  if (query.metodo) request = request.eq("metodo_pago", query.metodo);

  const { data, count, error } = await request
    .order("creado_en", { ascending: false })
    .order("folio", { ascending: false })
    .range(from, from + VENTAS_PAGE_SIZE - 1);

  // PGRST103: página fuera de rango.
  if (error && error.code !== "PGRST103") console.error("[ventas]", error);

  const rows = ((error ? [] : data) ?? []) as unknown as ListaRow[];
  return {
    ventas: rows.map(
      (r): VentaLista => ({
        id: r.id,
        folio: r.folio,
        creadoEn: r.creado_en,
        total: Number(r.total),
        metodo: r.metodo_pago,
        estado: r.estado,
        atendio: r.atendio?.nombre ?? null,
      })
    ),
    total: count ?? 0,
    paginas: Math.max(1, Math.ceil((count ?? 0) / VENTAS_PAGE_SIZE)),
    error: Boolean(error && error.code !== "PGRST103"),
  };
}

// -----------------------------------------------------------------------------
// Detalle
// -----------------------------------------------------------------------------

export type VentaDetalle = VentaLista & {
  recibido: number;
  cambio: number;
  usuarioId: string;
  motivoCancelacion: string | null;
  canceladaEn: string | null;
  /** null si no se puede leer el perfil (el cajero no ve el del dueño). */
  canceladaPor: string | null;
  items: { nombre: string; unidad: Unidad; cantidad: number; precio: number; importe: number }[];
};

type DetalleRow = ListaRow & {
  pago_recibido: number | string;
  cambio: number | string;
  usuario_id: string;
  motivo_cancelacion: string | null;
  cancelada_en: string | null;
  cancelo: { nombre: string } | null;
  venta_detalle: {
    id: number;
    nombre_producto: string;
    unidad: Unidad;
    cantidad: number | string;
    precio_unitario: number | string;
    importe: number | string;
  }[];
};

/**
 * Una venta con sus renglones. null si no existe o la RLS no la deja ver.
 * cache: generateMetadata y la página la piden una sola vez por petición.
 */
export const getVenta = cache(async (id: string): Promise<VentaDetalle | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas")
    .select(
      "id, folio, creado_en, total, metodo_pago, estado, pago_recibido, cambio, usuario_id," +
        " motivo_cancelacion, cancelada_en," +
        " atendio:perfiles!usuario_id(nombre), cancelo:perfiles!cancelada_por(nombre)," +
        " venta_detalle(id, nombre_producto, unidad, cantidad, precio_unitario, importe)"
    )
    .eq("id", id)
    .order("id", { referencedTable: "venta_detalle" })
    .maybeSingle();
  if (error) console.error("[venta]", error);
  if (!data) return null;

  const r = data as unknown as DetalleRow;
  return {
    id: r.id,
    folio: r.folio,
    creadoEn: r.creado_en,
    total: Number(r.total),
    metodo: r.metodo_pago,
    estado: r.estado,
    atendio: r.atendio?.nombre ?? null,
    recibido: Number(r.pago_recibido),
    cambio: Number(r.cambio),
    usuarioId: r.usuario_id,
    motivoCancelacion: r.motivo_cancelacion,
    canceladaEn: r.cancelada_en,
    canceladaPor: r.cancelo?.nombre ?? null,
    items: r.venta_detalle.map((d) => ({
      nombre: d.nombre_producto,
      unidad: d.unidad,
      cantidad: Number(d.cantidad),
      precio: Number(d.precio_unitario),
      importe: Number(d.importe),
    })),
  };
});
