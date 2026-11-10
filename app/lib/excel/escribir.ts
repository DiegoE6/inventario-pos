import "server-only";
import writeXlsxFile, { type Cell, type Row, type Sheet } from "write-excel-file/node";
import { TZ } from "@/app/lib/tz";
import { textoSeguro } from "./seguro";

/**
 * Hojas de Excel para exportar. Cada columna dice su tipo y así cada celda
 * sale como número, fecha o texto de verdad (nunca un número como texto).
 * Todo texto pasa por textoSeguro (inyección de fórmulas).
 */

export type Tipo = "texto" | "dinero" | "numero" | "entero" | "folio" | "porcentaje" | "fecha" | "fechaHora";

export type Columna<T> = {
  titulo: string;
  tipo: Tipo;
  ancho?: number;
  valor: (fila: T) => string | number | null | undefined;
};

const FORMATO: Partial<Record<Tipo, string>> = {
  dinero: '"$"#,##0.00',
  entero: "#,##0",
  // Igual que el ticket (000230) y sigue siendo número.
  folio: "000000",
  porcentaje: "0.0%",
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
};

const ANCHO: Record<Tipo, number> = {
  texto: 24,
  dinero: 14,
  numero: 12,
  entero: 10,
  folio: 9,
  porcentaje: 10,
  fecha: 12,
  fechaHora: 17,
};

const partes = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Excel no tiene zonas horarias: guarda la hora "de pared". write-excel-file
 * convierte con el reloj UTC, así que se le da un Date cuyos campos UTC son
 * la hora de Monterrey de ese instante.
 */
export function horaMonterrey(iso: string): Date {
  const p = Object.fromEntries(partes.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
}

/** "YYYY-MM-DD" (día ya calculado en Monterrey) como fecha de Excel. */
export function diaExcel(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function celda(tipo: Tipo, v: string | number | null | undefined): Cell {
  if (v === null || v === undefined || v === "") return null;
  switch (tipo) {
    case "texto":
      return { value: textoSeguro(String(v)), type: String };
    case "fecha":
      return { value: diaExcel(String(v)), type: Date, format: FORMATO.fecha };
    case "fechaHora":
      return { value: horaMonterrey(String(v)), type: Date, format: FORMATO.fechaHora };
    default: {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return { value: n, type: Number, format: FORMATO[tipo] };
    }
  }
}

const ENCABEZADO = { fontWeight: "bold", backgroundColor: "#EEEEEE", borderStyle: "thin", borderColor: "#BBBBBB" } as const;

/** Una hoja con encabezado en negritas y fijo, y una fila por elemento. */
export function hoja<T>(nombre: string, columnas: Columna<T>[], filas: T[]): Sheet<never> {
  const data: Row[] = [
    columnas.map((c) => ({ value: c.titulo, type: String, ...ENCABEZADO })),
    ...filas.map((f) => columnas.map((c) => celda(c.tipo, c.valor(f)))),
  ];
  return {
    sheet: nombre,
    data,
    columns: columnas.map((c) => ({ width: c.ancho ?? ANCHO[c.tipo] })),
    stickyRowsCount: 1,
  };
}

/** Hoja de dos columnas (dato, valor) para resúmenes e instrucciones. */
export function hojaResumen(
  nombre: string,
  filas: { dato: string; valor: string | number | null; tipo?: Tipo; titulo?: boolean }[],
  anchos: [number, number] = [32, 22]
): Sheet<never> {
  return {
    sheet: nombre,
    data: filas.map((f) =>
      f.titulo
        ? [{ value: textoSeguro(f.dato), type: String, fontWeight: "bold" as const }, null]
        : [{ value: textoSeguro(f.dato), type: String }, celda(f.tipo ?? "texto", f.valor)]
    ),
    columns: [{ width: anchos[0] }, { width: anchos[1] }],
  };
}

export async function xlsxBuffer(hojas: Sheet<never>[]): Promise<Buffer> {
  return writeXlsxFile(hojas).toBuffer();
}

/** Respuesta de descarga: sin caché (lleva datos del negocio) y sin adivinar tipo. */
export async function xlsxResponse(hojas: Sheet<never>[], archivo: string): Promise<Response> {
  const buffer = await xlsxBuffer(hojas);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Error de una exportación, en texto plano (el usuario lo ve en la pestaña). */
export function exportError(mensaje: string, status = 400): Response {
  return new Response(mensaje, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
