/**
 * CSV a filas de texto. Sin dependencias.
 * - Codificación: UTF-8 (con o sin BOM); si no es UTF-8 válido, Windows-1252
 *   (así guarda Excel en español "CSV delimitado por comas").
 * - Separador: el que más aparezca fuera de comillas en la primera línea
 *   entre coma, punto y coma y tabulador (Excel en es-MX puede usar ";").
 * - Comillas dobles con "" como escape y saltos de línea dentro de comillas.
 */

export function decodificar(buf: Uint8Array): string {
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function separador(texto: string): string {
  const cuenta: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let comillas = false;
  for (const ch of texto) {
    if (ch === '"') comillas = !comillas;
    else if (!comillas && (ch === "\n" || ch === "\r")) break;
    else if (!comillas && ch in cuenta) cuenta[ch]++;
  }
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0]
    : ",";
}

/** Filas del CSV. `maxFilas` corta la lectura (con +1 para saber que se pasó). */
export function leerCsv(texto: string, maxFilas = Infinity): string[][] {
  const sep = separador(texto);
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"' && campo === "") comillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      if (filas.length > maxFilas) return filas;
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}
