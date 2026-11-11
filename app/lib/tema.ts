/**
 * Tema de la app: "claro", "oscuro" o "sistema" (sigue al sistema operativo).
 * Se guarda por dispositivo en la cookie `tema` (un año): la lee el servidor
 * para poner data-theme en <html> desde el primer HTML, sin parpadeo. No es
 * un dato del negocio, así que no va a la base.
 */

export type Tema = "claro" | "oscuro" | "sistema";

export const COOKIE_TEMA = "tema";

export function parseTema(valor: string | undefined | null): Tema {
  return valor === "claro" || valor === "oscuro" ? valor : "sistema";
}
