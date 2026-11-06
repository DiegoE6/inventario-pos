import { NextResponse, type NextRequest } from "next/server";
import { getSessionOrNull } from "@/app/lib/auth";
import type { PosProduct } from "@/app/lib/cart";
import { escapeLike, ilikeContains } from "@/app/lib/search";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Lecturas del punto de venta (las dispara el cliente al escribir/escanear).
 * Corre en el servidor con la sesión del usuario (RLS). Sin service_role.
 *
 *   ?q=texto      hasta 12 productos activos; coincidencia exacta de código primero
 *   ?codigo=XYZ   coincidencia exacta de código (lector de barras); 0 o 1 producto
 *   ?ids=a,b,c    datos frescos de los productos del carrito (incluye inactivos)
 *
 * Sin sesión: 401 (el proxy NO redirige esta ruta). Nunca se cachea.
 */

const NO_STORE = { "Cache-Control": "no-store" };
const COLUMNS = "id, codigo, nombre, precio, stock, unidad, activo";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const session = await getSessionOrNull();
  if (!session) return json({ error: "Sin sesión" }, 401);

  const sp = request.nextUrl.searchParams;
  const supabase = await createClient();

  // --- Datos frescos del carrito --------------------------------------------
  const idsParam = sp.get("ids");
  if (idsParam !== null) {
    const ids = idsParam.split(",").filter((id) => UUID_RE.test(id)).slice(0, 200);
    if (ids.length === 0) return json({ productos: [] });
    const { data, error } = await supabase.from("productos").select(COLUMNS).in("id", ids);
    if (error) return dbError(error);
    return json({ productos: data as PosProduct[] });
  }

  // --- Código exacto (lector de barras) --------------------------------------
  const codigo = sp.get("codigo")?.trim().slice(0, 50);
  if (codigo) {
    // ilike sin comodines = igual sin distinguir mayúsculas. escapeLike evita
    // que un % o _ escaneado actúe como comodín.
    const { data, error } = await supabase
      .from("productos")
      .select(COLUMNS)
      .eq("activo", true)
      .ilike("codigo", escapeLike(codigo))
      .limit(2);
    if (error) return dbError(error);
    const rows = (data ?? []) as PosProduct[];
    // Si hubiera dos que solo difieren en mayúsculas, gana el idéntico.
    const producto = rows.find((p) => p.codigo === codigo) ?? rows[0] ?? null;
    return json({ producto });
  }

  // --- Búsqueda por nombre o código ------------------------------------------
  const q = sp.get("q")?.trim().slice(0, 100) ?? "";
  if (!q) return json({ productos: [] });

  const v = ilikeContains(q);
  const { data, error } = await supabase
    .from("productos")
    .select(COLUMNS)
    .eq("activo", true)
    .or(`nombre.ilike.${v},codigo.ilike.${v}`)
    .order("nombre")
    .limit(12);
  if (error) return dbError(error);

  const lower = q.toLowerCase();
  const productos = ((data ?? []) as PosProduct[]).sort(
    (a, b) => Number(b.codigo.toLowerCase() === lower) - Number(a.codigo.toLowerCase() === lower)
  );
  return json({ productos });
}

function dbError(error: unknown) {
  console.error("[vender/productos]", error);
  return json({ error: "No se pudo buscar. Intenta de nuevo." }, 500);
}
