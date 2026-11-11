import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * Revisión de un .xlsx (un .zip) ANTES de dárselo a la librería, contra
 * "bombas zip": un archivo chico que al descomprimirse ocupa gigas.
 *
 * Se lee el directorio central y se descomprime cada parte con
 * maxOutputLength: el límite lo aplica zlib, no lo que el archivo dice de sí
 * mismo. Si algo no cuadra, el archivo se rechaza.
 *
 * Regresa las partes ya descomprimidas (nombre → contenido), para revisar
 * el XML sin volver a abrir el archivo (ver formulas.ts).
 */

export const MAX_PARTES = 100;
export const MAX_DESCOMPRIMIDO = 20 * 1024 * 1024;

export class ZipInvalido extends Error {}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function revisarZip(buf: Buffer): Map<string, Buffer> {
  const contenidos = new Map<string, Buffer>();
  // Fin del directorio central: en los últimos 22 + 65535 bytes (comentario).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipInvalido("El archivo no es un Excel válido.");

  const partes = buf.readUInt16LE(eocd + 10);
  const tamDir = buf.readUInt32LE(eocd + 12);
  const inicioDir = buf.readUInt32LE(eocd + 16);
  if (partes === 0 || partes > MAX_PARTES) {
    throw new ZipInvalido(`El archivo tiene ${partes} partes internas; el máximo es ${MAX_PARTES}.`);
  }
  if (inicioDir + tamDir > buf.length) throw new ZipInvalido("El archivo está dañado.");

  let total = 0;
  let p = inicioDir;
  for (let n = 0; n < partes; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new ZipInvalido("El archivo está dañado.");
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + largoNombre).toString("utf8");
    p += 46 + largoNombre + largoExtra + largoComentario;

    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) throw new ZipInvalido("El archivo está dañado.");
    const datos = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (datos + comprimido > buf.length) throw new ZipInvalido("El archivo está dañado.");
    const contenido = buf.subarray(datos, datos + comprimido);

    let parte: Buffer;
    if (metodo === 0) {
      parte = contenido;
    } else if (metodo === 8) {
      const restante = MAX_DESCOMPRIMIDO - total;
      try {
        parte = inflateRawSync(contenido, { maxOutputLength: Math.max(1, restante) });
      } catch {
        throw new ZipInvalido("El archivo es demasiado grande al abrirlo (más de 20 MB) o está dañado.");
      }
    } else {
      throw new ZipInvalido("El archivo usa una compresión que no se acepta.");
    }
    total += parte.length;
    if (total > MAX_DESCOMPRIMIDO) {
      throw new ZipInvalido("El archivo es demasiado grande al abrirlo (más de 20 MB).");
    }
    contenidos.set(nombre, parte);
  }
  return contenidos;
}
