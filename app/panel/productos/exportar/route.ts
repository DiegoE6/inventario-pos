import type { NextRequest } from "next/server";
import { requireDueno } from "@/app/lib/auth";
import { nombreArchivo } from "@/app/lib/brand";
import { getConfiguracion, parseProductosQuery } from "@/app/lib/data";
import { exportError, hoja, xlsxResponse } from "@/app/lib/excel/escribir";
import { ilikeContains } from "@/app/lib/search";
import { createClient } from "@/app/lib/supabase/server";
import { todayYmd } from "@/app/lib/tz";

/**
 * Productos a Excel con la búsqueda y los filtros de la lista. Solo dueño.
 * El costo no se lee de la tabla (no se puede): sale de costos_productos(),
 * la función de dueño, en tandas de 500.
 */

const PAGINA = 1000;
const MAX_PRODUCTOS = 10_000;

type Producto = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  precio: number | string;
  stock: number | string;
  stock_minimo: number | string;
  activo: boolean;
  categorias: { nombre: string } | null;
  proveedores: { nombre: string } | null;
};

export async function GET(request: NextRequest) {
  await requireDueno();
  const q = parseProductosQuery(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();

  const productos: Producto[] = [];
  for (let from = 0; ; from += PAGINA) {
    let req = supabase
      .from("productos")
      .select(
        "id, codigo, nombre, descripcion, unidad, precio, stock, stock_minimo, activo, categorias(nombre), proveedores(nombre)"
      );
    if (!q.inactivos) req = req.eq("activo", true);
    if (q.categoria !== null) req = req.eq("categoria_id", q.categoria);
    if (q.q) {
      const v = ilikeContains(q.q);
      req = req.or(`nombre.ilike.${v},codigo.ilike.${v}`);
    }
    const { data, error } = await req.order("nombre").order("id").range(from, from + PAGINA - 1);
    if (error) {
      console.error("[exportar productos]", error);
      return exportError("No se pudieron leer los productos. Intenta de nuevo.", 500);
    }
    productos.push(...(data as unknown as Producto[]));
    if (productos.length > MAX_PRODUCTOS) return exportError("Hay demasiados productos. Filtra por categoría.");
    if (!data || data.length < PAGINA) break;
  }

  // Costos en centavos, desde la función de dueño.
  const costo = new Map<string, number>();
  for (let i = 0; i < productos.length; i += 500) {
    const { data, error } = await supabase.rpc("costos_productos", {
      p_ids: productos.slice(i, i + 500).map((p) => p.id),
    });
    if (error) {
      console.error("[exportar costos]", error);
      return exportError("No se pudieron leer los costos. Intenta de nuevo.", 500);
    }
    for (const c of (data ?? []) as { id: string; costo: number | string }[]) {
      costo.set(c.id, Math.round(Number(c.costo) * 100));
    }
  }

  const cents = (v: number | string) => Math.round(Number(v) * 100);
  /** stock (3 decimales) × costo (centavos) en enteros, redondeado a centavos. */
  const valorCents = (p: Producto) =>
    Math.round((Math.round(Number(p.stock) * 1000) * (costo.get(p.id) ?? 0)) / 1000);

  const sheet = hoja<Producto>(
    "Productos",
    [
      { titulo: "Código", tipo: "texto", ancho: 14, valor: (p) => p.codigo },
      { titulo: "Nombre", tipo: "texto", ancho: 36, valor: (p) => p.nombre },
      { titulo: "Categoría", tipo: "texto", ancho: 18, valor: (p) => p.categorias?.nombre },
      { titulo: "Proveedor", tipo: "texto", ancho: 20, valor: (p) => p.proveedores?.nombre },
      { titulo: "Unidad", tipo: "texto", ancho: 10, valor: (p) => p.unidad },
      { titulo: "Costo", tipo: "dinero", valor: (p) => (costo.has(p.id) ? costo.get(p.id)! / 100 : null) },
      { titulo: "Precio", tipo: "dinero", valor: (p) => p.precio },
      {
        titulo: "Margen",
        tipo: "porcentaje",
        valor: (p) => {
          const pr = cents(p.precio);
          return pr > 0 && costo.has(p.id) ? (pr - costo.get(p.id)!) / pr : null;
        },
      },
      { titulo: "Stock", tipo: "numero", valor: (p) => p.stock },
      { titulo: "Stock mínimo", tipo: "numero", valor: (p) => p.stock_minimo },
      { titulo: "Valor a costo", tipo: "dinero", ancho: 15, valor: (p) => valorCents(p) / 100 },
      { titulo: "Activo", tipo: "texto", ancho: 8, valor: (p) => (p.activo ? "Sí" : "No") },
      { titulo: "Descripción", tipo: "texto", ancho: 36, valor: (p) => p.descripcion },
    ],
    productos
  );

  const config = await getConfiguracion();
  return xlsxResponse([sheet], nombreArchivo(config.nombre, `productos-${todayYmd()}`));
}
