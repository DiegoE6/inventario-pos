import "server-only";
import { cache } from "react";
import { createClient } from "@/app/lib/supabase/server";
import { DEFAULT_PRIMARY } from "@/app/lib/brand";
import { ilikeContains } from "@/app/lib/search";
import type { Categoria, Configuracion, Producto, Proveedor } from "@/app/lib/types";
import type { Unidad } from "@/app/lib/format";

/**
 * Lecturas para Server Components. Todas con el cliente de servidor (sesión
 * del usuario, pasa por RLS). Nada de service_role.
 */

const CONFIG_DEFAULT: Configuracion = {
  nombre: "Ferretería La Tuerca",
  giro: null,
  logo_url: null,
  color_primario: DEFAULT_PRIMARY,
  telefono: null,
  direccion: null,
};

/** Marca del negocio. `anon` también puede leerla (pantalla de login). */
export const getConfiguracion = cache(async (): Promise<Configuracion> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configuracion_negocio")
    .select("nombre, giro, logo_url, color_primario, telefono, direccion")
    .eq("id", 1)
    .maybeSingle<Configuracion>();
  if (error) console.error("[config]", error);
  return data ?? CONFIG_DEFAULT;
});

export const getCategorias = cache(async (): Promise<Categoria[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, activo")
    .order("nombre");
  if (error) console.error("[categorias]", error);
  return (data ?? []) as Categoria[];
});

export const getProveedores = cache(async (): Promise<Proveedor[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, contacto, telefono, notas, activo")
    .order("nombre");
  if (error) console.error("[proveedores]", error);
  return (data ?? []) as Proveedor[];
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function getProducto(id: string): Promise<Producto | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo, nombre, descripcion, categoria_id, proveedor_id, unidad, costo, precio, stock, stock_minimo, activo"
    )
    .eq("id", id)
    .maybeSingle<Producto>();
  if (error) console.error("[producto]", error);
  return data ?? null;
}

// -----------------------------------------------------------------------------
// Lista paginada de productos
// -----------------------------------------------------------------------------

export const PAGE_SIZE = 20;

export type ProductoLista = {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  stock_minimo: number;
  unidad: Unidad;
  activo: boolean;
  categoria: string | null;
};

export type ProductosQuery = {
  q: string;
  categoria: number | null;
  pagina: number;
  inactivos: boolean;
};

export async function listProductos(query: ProductosQuery) {
  const supabase = await createClient();
  const from = (query.pagina - 1) * PAGE_SIZE;

  let request = supabase
    .from("productos")
    .select("id, codigo, nombre, precio, stock, stock_minimo, unidad, activo, categorias(nombre)", {
      count: "exact",
    });

  if (!query.inactivos) request = request.eq("activo", true);
  if (query.categoria !== null) request = request.eq("categoria_id", query.categoria);
  if (query.q) {
    // Escape para LIKE y para la sintaxis de or=(...) (app/lib/search.ts).
    const v = ilikeContains(query.q);
    request = request.or(`nombre.ilike.${v},codigo.ilike.${v}`);
  }

  const { data, count, error } = await request
    .order("nombre")
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  // PGRST103: la página pedida está fuera de rango (por ejemplo ?pagina=99).
  if (error && error.code !== "PGRST103") console.error("[productos]", error);

  type Row = Omit<ProductoLista, "categoria"> & { categorias: { nombre: string } | null };
  const rows = ((error ? [] : data) ?? []) as unknown as Row[];

  return {
    productos: rows.map(({ categorias, ...p }) => ({
      ...p,
      categoria: categorias?.nombre ?? null,
    })) as ProductoLista[],
    total: count ?? 0,
    paginas: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

/** Lee y sanea los searchParams de /panel/productos. */
export function parseProductosQuery(sp: Record<string, string | string[] | undefined>): ProductosQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).trim().slice(0, 100);
  const cat = one(sp.categoria);
  const pag = Number.parseInt(one(sp.pagina), 10);
  return {
    q,
    categoria: /^\d{1,9}$/.test(cat) ? Number(cat) : null,
    pagina: Number.isFinite(pag) && pag >= 1 && pag <= 10_000 ? pag : 1,
    inactivos: one(sp.inactivos) === "1",
  };
}
