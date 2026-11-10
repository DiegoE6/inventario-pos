/**
 * Inyección de fórmulas (CSV/Excel injection, OWASP). Un texto que empieza
 * con =, +, -, @, tabulador o retorno de carro (también después de espacios)
 * puede convertirse en fórmula si alguien edita la celda o guarda el archivo
 * como CSV. Al exportar se le antepone un apóstrofo; al importar, ese mismo
 * apóstrofo se quita para que exportar → importar regrese el texto original.
 */

const PELIGROSO = /^[\s]*[=+\-@]|^[\t\r]/;

/** Texto listo para una celda: con apóstrofo si podría leerse como fórmula. */
export function textoSeguro(valor: string | null | undefined): string {
  const s = valor ?? "";
  return PELIGROSO.test(s) ? `'${s}` : s;
}

/** Quita el apóstrofo que puso textoSeguro (solo si lo que sigue es peligroso). */
export function quitarApostrofo(valor: string): string {
  return valor.startsWith("'") && PELIGROSO.test(valor.slice(1)) ? valor.slice(1) : valor;
}
