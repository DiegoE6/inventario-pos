/**
 * Destino después del login (?next=...). Solo se aceptan rutas internas del
 * panel: nada de "//otro-sitio.com", "https://...", "\\" ni rutas fuera de
 * /panel. Cualquier otra cosa → /panel.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) return "/panel";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/panel";

  try {
    const base = "http://interno.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return "/panel";
    const { pathname } = url;
    if (pathname !== "/panel" && !pathname.startsWith("/panel/")) return "/panel";
    // Endpoints JSON (no son páginas).
    if (pathname.startsWith("/panel/vender/productos")) return "/panel";
    return `${pathname}${url.search}`;
  } catch {
    return "/panel";
  }
}
