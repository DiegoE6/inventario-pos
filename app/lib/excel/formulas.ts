import "server-only";

/**
 * Celdas con fórmula que la librería lee como vacías: la que no trae su
 * resultado guardado (archivos que no salen de Excel o de Sheets, o que
 * nunca se recalcularon) y la que guardó un error (#DIV/0!, #REF!…).
 *
 * Se revisa el XML de la PRIMERA hoja del libro (la misma que lee
 * readSheet), buscándola por workbook.xml y sus relaciones, no por nombre de
 * archivo. Solo se miran las etiquetas <c>; no se evalúa nada.
 */

export type CeldaSinResultado = {
  /** Dirección como la ve el usuario en Excel: "C4". */
  celda: string;
  /** Fila de la hoja (1 = primera). */
  fila: number;
  /** Columna, desde 0 (A = 0). */
  columna: number;
  /** "formula": sin resultado guardado; si no, el error que guardó (#DIV/0!…). */
  motivo: "formula" | string;
};

const texto = (b: Buffer | undefined) => (b ? b.toString("utf8") : "");

function columnaDe(letras: string): number {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Ruta interna de la primera hoja, o null si el libro no la declara bien. */
function primeraHoja(partes: Map<string, Buffer>): string | null {
  const libro = texto(partes.get("xl/workbook.xml"));
  const rels = texto(partes.get("xl/_rels/workbook.xml.rels"));
  const hoja = libro.match(/<sheet\b[^>]*?\br:id="([^"]+)"/);
  if (!hoja) return null;
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((r) => r.includes(`Id="${hoja[1]}"`));
  const destino = rel?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!destino) return null;
  return destino.startsWith("/") ? destino.slice(1) : `xl/${destino.replace(/^\.\//, "")}`;
}

export function celdasSinResultado(partes: Map<string, Buffer>): CeldaSinResultado[] {
  const ruta = primeraHoja(partes);
  const xml = ruta ? texto(partes.get(ruta)) : "";
  if (!xml) return [];

  const salida: CeldaSinResultado[] = [];
  // <c r="C4" t="e"><f>…</f><v>#DIV/0!</v></c>, <c r="C4"><f>…</f></c>, <c r="C4"><f t="shared" si="0"/></c>
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const atributos = m[1];
    const dentro = m[2] ?? "";
    const tieneFormula = /<f[\s>/]/.test(dentro);
    const tipo = atributos.match(/\bt="([^"]+)"/)?.[1];
    const valor = dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
    let motivo: string | null = null;
    if (tipo === "e") motivo = valor || "#ERROR";
    else if (tieneFormula && valor === "") motivo = "formula";
    if (!motivo) continue;

    const ref = atributos.match(/\br="([A-Z]{1,3})(\d+)"/);
    if (!ref) continue;
    salida.push({ celda: `${ref[1]}${ref[2]}`, fila: Number(ref[2]), columna: columnaDe(ref[1]), motivo });
    if (salida.length >= 1000) break; // de sobra para 500 filas
  }
  return salida;
}

/** Texto para el usuario: "la celda C4 tiene una fórmula sin resultado…". */
export function mensajeCelda(c: CeldaSinResultado, columna: string): string {
  return c.motivo === "formula"
    ? `${columna} (celda ${c.celda}) tiene una fórmula sin resultado guardado. Ábrelo en Excel, guárdalo otra vez y vuelve a subirlo.`
    : `${columna} (celda ${c.celda}) tiene un error de fórmula (${c.motivo}). Corrígelo en Excel y vuelve a subirlo.`;
}
