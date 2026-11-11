import "server-only";
import { readSheet } from "read-excel-file/node";
import { decodificar, leerCsv } from "./csv";
import { celdasSinResultado, type CeldaSinResultado } from "./formulas";
import { revisarZip, ZipInvalido } from "./zip";

/**
 * Lectura en el servidor de un archivo subido (.xlsx o .csv) como filas de
 * texto. Límites: 1 MB de archivo, 20 MB descomprimido, 100 partes internas
 * y MAX_FILAS filas de datos. El tipo se decide por el contenido (firma del
 * zip), no por el nombre ni por lo que diga el navegador.
 */

export const MAX_BYTES = 1024 * 1024;
export const MAX_FILAS = 500;

export class ArchivoInvalido extends Error {}

/**
 * Filas como texto. En un .xlsx, `sinResultado` trae las celdas con fórmula
 * que se leyeron vacías (sin resultado guardado o con error), para avisarlo.
 */
export type Hoja = string[][] & { sinResultado?: CeldaSinResultado[] };

function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export async function leerArchivo(file: File): Promise<Hoja> {
  if (file.size === 0) throw new ArchivoInvalido("El archivo está vacío.");
  if (file.size > MAX_BYTES) throw new ArchivoInvalido("El archivo pesa más de 1 MB. Divídelo en partes.");

  const buf = Buffer.from(await file.arrayBuffer());
  const esZip = buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;

  if (esZip) {
    let partes: Map<string, Buffer>;
    try {
      partes = revisarZip(buf);
    } catch (e) {
      if (e instanceof ZipInvalido) throw new ArchivoInvalido(e.message);
      throw e;
    }
    try {
      // Siempre un Buffer: un string sería una ruta del disco para la librería.
      // parseNumber deja los números como el texto exacto que guardó Excel.
      const data = await readSheet(buf, 1, { parseNumber: (s: string) => s, trim: true });
      const hoja: Hoja = data.map((fila) => fila.map(aTexto));
      hoja.sinResultado = celdasSinResultado(partes);
      return hoja;
    } catch {
      throw new ArchivoInvalido("No se pudo leer el Excel. Guárdalo como .xlsx y vuelve a intentar.");
    }
  }

  // No es zip: tiene que ser texto (CSV). Un binario cualquiera trae bytes nulos.
  if (buf.includes(0)) throw new ArchivoInvalido("Sube un archivo de Excel (.xlsx) o CSV.");
  return leerCsv(decodificar(buf), MAX_FILAS + 50);
}
