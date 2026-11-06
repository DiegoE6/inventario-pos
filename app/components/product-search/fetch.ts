import type { PosProduct } from "@/app/lib/cart";

/** La sesión venció: el Route Handler respondió 401. */
export class SinSesionError extends Error {}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (res.status === 401) throw new SinSesionError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Números de la BD como number (PostgREST manda numeric como número). */
function normalize(p: PosProduct): PosProduct {
  return { ...p, precio: Number(p.precio), stock: Number(p.stock) };
}

const BASE = "/panel/vender/productos";

export async function buscarProductos(q: string, signal?: AbortSignal) {
  const { productos } = await getJson<{ productos: PosProduct[] }>(
    `${BASE}?q=${encodeURIComponent(q)}`,
    signal
  );
  return productos.map(normalize);
}

export async function buscarPorCodigo(codigo: string) {
  const { producto } = await getJson<{ producto: PosProduct | null }>(
    `${BASE}?codigo=${encodeURIComponent(codigo)}`
  );
  return producto ? normalize(producto) : null;
}

export async function refrescarProductos(ids: string[]) {
  const { productos } = await getJson<{ productos: PosProduct[] }>(
    `${BASE}?ids=${ids.map(encodeURIComponent).join(",")}`
  );
  return productos.map(normalize);
}

/**
 * 401 → al login, con ?next para regresar a la página actual (el servidor lo
 * valida con safeNext). En el punto de venta el carrito queda guardado en este
 * navegador. Navegación completa a propósito: descarta la caché del router,
 * que tiene datos de una sesión que ya no es válida.
 */
export function irAlLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${next}`);
}
