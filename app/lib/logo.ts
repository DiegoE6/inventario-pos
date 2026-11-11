import "server-only";
import sharp from "sharp";

/**
 * Logo del negocio: validación y re-codificación en el servidor.
 *
 *   1. El tipo se decide por la FIRMA del archivo (sus primeros bytes), no
 *      por la extensión ni por el Content-Type que manda el navegador. Solo
 *      PNG, JPG y WEBP. SVG no (puede llevar scripts).
 *   2. El ancho y el alto se leen del encabezado, sin decodificar la imagen.
 *      Más de 4000 px por lado se rechaza antes de que sharp la abra.
 *   3. sharp la vuelve a codificar como WEBP de máximo 512 px por lado. Por
 *      defecto sharp no copia metadatos (EXIF, GPS, ICC): el archivo que se
 *      sube es una imagen nueva, no el original.
 */

export class LogoInvalido extends Error {}

/** Por debajo del límite de 4.5 MB del cuerpo de una función en Vercel. */
export const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const MAX_LADO = 4000;
const LADO_FINAL = 512;
/** El bucket `marca` acepta hasta 512 KB (docs/sql/28). */
const MAX_WEBP_BYTES = 512 * 1024;

export type TipoImagen = "png" | "jpeg" | "webp";

const ascii = (buf: Buffer, from: number, to: number) => buf.subarray(from, to).toString("latin1");

/** Tipo por firma, o null si no es PNG, JPG ni WEBP. */
export function tipoPorFirma(buf: Buffer): TipoImagen | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "webp";
  return null;
}

/** Ancho y alto leídos del encabezado (sin decodificar), o null si no se encuentran. */
export function dimensiones(buf: Buffer, tipo: TipoImagen): { ancho: number; alto: number } | null {
  try {
    if (tipo === "png") {
      // Firma (8) + largo del chunk (4) + "IHDR" (4) + ancho (4) + alto (4).
      if (ascii(buf, 12, 16) !== "IHDR") return null;
      return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
    }

    if (tipo === "jpeg") {
      // Recorre los segmentos hasta un SOFn (C0–CF, menos C4 DHT, C8 y CC DAC).
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        if (marker === 0xff) {
          i++;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const largo = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
        }
        if (largo < 2) return null;
        i += 2 + largo;
      }
      return null;
    }

    // WEBP: el primer chunk dice el formato.
    const chunk = ascii(buf, 12, 16);
    if (chunk === "VP8X") {
      return { ancho: buf.readUIntLE(24, 3) + 1, alto: buf.readUIntLE(27, 3) + 1 };
    }
    if (chunk === "VP8 ") {
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
      return { ancho: buf.readUInt16LE(26) & 0x3fff, alto: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      if (buf[20] !== 0x2f) return null;
      const bits = buf.readUInt32LE(21);
      return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  } catch {
    // Archivo truncado: readUInt* fuera de rango.
    return null;
  }
}

/**
 * Valida y convierte el logo. Regresa el WEBP listo para subir, o lanza
 * LogoInvalido con un mensaje para el usuario.
 */
export async function procesarLogo(buf: Buffer): Promise<Buffer> {
  if (buf.length === 0) throw new LogoInvalido("Elige una imagen.");
  if (buf.length > MAX_LOGO_BYTES) throw new LogoInvalido("La imagen pesa más de 3 MB. Usa una más ligera.");

  const tipo = tipoPorFirma(buf);
  if (!tipo) throw new LogoInvalido("Sube una imagen PNG, JPG o WEBP.");

  const dim = dimensiones(buf, tipo);
  if (!dim || dim.ancho < 1 || dim.alto < 1) throw new LogoInvalido("No se pudo leer la imagen. Prueba con otra.");
  if (dim.ancho > MAX_LADO || dim.alto > MAX_LADO) {
    throw new LogoInvalido(`La imagen mide ${dim.ancho} × ${dim.alto} px. El máximo es ${MAX_LADO} px por lado.`);
  }

  let salida: Buffer;
  try {
    salida = await sharp(buf, {
      // Segunda barrera: aunque el encabezado mintiera, sharp no decodifica más.
      limitInputPixels: MAX_LADO * MAX_LADO,
      failOn: "error",
      // Animados: solo el primer cuadro.
      animated: false,
    })
      .rotate() // aplica la orientación EXIF antes de que se descarte
      .resize({ width: LADO_FINAL, height: LADO_FINAL, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new LogoInvalido("No se pudo leer la imagen. Prueba con otra.");
  }

  if (salida.length > MAX_WEBP_BYTES) throw new LogoInvalido("La imagen es demasiado compleja. Prueba con una más simple.");
  return salida;
}

/** Ruta que se guarda en configuracion_negocio.logo_url (CHECK de docs/sql/28). */
export function rutaLogo(version: number): string {
  return `/storage/v1/object/public/marca/logo?v=${version}`;
}
