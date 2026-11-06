/**
 * Escape de texto para filtros de PostgREST. Probado contra el PostgREST real
 * con comas, paréntesis, comillas, %, _ y \ (ver docs/fase-2-panel-productos.md).
 */

/** Escapa los comodines de LIKE (% _ \) para buscarlos literalmente. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/** Envuelve en comillas dobles (escapando " y \) para la sintaxis de or=(...). */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/** Valor para `campo.ilike.<valor>` dentro de .or(): contiene el texto. */
export function ilikeContains(text: string): string {
  return quoteFilterValue(`%${escapeLike(text)}%`);
}
