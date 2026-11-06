/**
 * Lógica del carrito del punto de venta, sin React. Todo en enteros:
 *   - cantidades en milésimas (milli): 2.5 m → 2500
 *   - dinero en centavos: $12.50 → 1250
 * El total del carrito es un ESTIMADO para mostrar; el total real (y el del
 * ticket) lo calcula la BD con precios de la BD.
 */

import { formatQuantity, type Unidad } from "@/app/lib/format";
import { toCents } from "@/app/lib/money";

const UNIDADES_ENTERAS: Unidad[] = ["pieza", "caja"];

export type PosProduct = {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  unidad: Unidad;
  activo: boolean;
};

export type CartLine = {
  producto: PosProduct;
  /** Lo que el usuario capturó, tal cual ("2", "2.5", "2."). */
  cantidad: string;
  /** Problema que reportó la BD al intentar cobrar. */
  problema?: string;
};

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";

const ENTERO_RE = /^\d{1,6}$/;
const DECIMAL_RE = /^\d{1,6}(\.\d{1,3})?$/;

export function aceptaDecimales(unidad: Unidad): boolean {
  return !UNIDADES_ENTERAS.includes(unidad);
}

/** "2.5" → 2500. null si no es válida para la unidad o es 0. */
export function parseQtyMilli(value: string, unidad: Unidad): number | null {
  const v = value.trim();
  if (!(aceptaDecimales(unidad) ? DECIMAL_RE : ENTERO_RE).test(v)) return null;
  const [ent, dec = ""] = v.split(".");
  const milli = Number(ent) * 1000 + Number(dec.padEnd(3, "0"));
  return milli > 0 ? milli : null;
}

/** 2500 → "2.5"; 3000 → "3". */
export function milliToString(milli: number): string {
  const ent = Math.floor(milli / 1000);
  const dec = milli % 1000;
  return dec ? `${ent}.${String(dec).padStart(3, "0").replace(/0+$/, "")}` : String(ent);
}

export function priceCents(precio: number): number {
  return Math.round(precio * 100);
}

export function stockMilli(stock: number): number {
  return Math.round(stock * 1000);
}

/** Importe del renglón, redondeado igual que la BD: round(cantidad * precio, 2). */
export function lineCents(precio: number, milli: number): number {
  return Math.round((priceCents(precio) * milli) / 1000);
}

/** +1 / −1 sobre la cantidad. Nunca baja de 1 (para quitar está el botón de quitar). */
export function stepQty(value: string, unidad: Unidad, delta: 1 | -1): string {
  const milli = parseQtyMilli(value, unidad) ?? 0;
  const next = milli + delta * 1000;
  if (next <= 0) return value;
  return milliToString(next);
}

/** Problema del renglón, o null si se puede cobrar. */
export function lineIssue(line: CartLine): string | null {
  const { producto } = line;
  if (!producto.activo) return "Producto desactivado";
  const milli = parseQtyMilli(line.cantidad, producto.unidad);
  if (milli === null) {
    return aceptaDecimales(producto.unidad)
      ? "Cantidad no válida (hasta 3 decimales)"
      : "Solo cantidades enteras";
  }
  if (milli > stockMilli(producto.stock)) {
    return producto.stock <= 0
      ? "Sin existencias"
      : `Solo hay ${formatQuantity(producto.stock, producto.unidad)}`;
  }
  return line.problema ?? null;
}

export function cartSummary(lines: CartLine[]) {
  let totalCents = 0;
  let valid = lines.length > 0;
  for (const line of lines) {
    const milli = parseQtyMilli(line.cantidad, line.producto.unidad);
    if (milli !== null) totalCents += lineCents(line.producto.precio, milli);
    if (lineIssue(line)) valid = false;
  }
  return { totalCents, valid, count: lines.length };
}

export function paymentSummary(metodo: MetodoPago, recibido: string, totalCents: number) {
  if (metodo !== "efectivo") return { valid: true, recibidoCents: totalCents, cambioCents: 0 };
  const recibidoCents = toCents(recibido);
  const valid = recibidoCents !== null && recibidoCents >= totalCents;
  return {
    valid,
    recibidoCents,
    cambioCents: valid && recibidoCents !== null ? recibidoCents - totalCents : 0,
  };
}

const BILLETES = [2000, 5000, 10000, 20000, 50000, 100000];

/** Billetes que alcanzan para el total (hasta 3), para tocar en vez de teclear. */
export function suggestedBills(totalCents: number): number[] {
  if (totalCents <= 0) return [];
  const out = BILLETES.filter((b) => b > totalCents).slice(0, 3);
  if (out.length === 0) out.push(Math.ceil(totalCents / 50000) * 50000);
  return out;
}

/** Agrega un producto (o suma 1 si ya está). */
export function addToCart(lines: CartLine[], producto: PosProduct): CartLine[] {
  const i = lines.findIndex((l) => l.producto.id === producto.id);
  if (i === -1) return [...lines, { producto, cantidad: "1" }];
  return lines.map((l, j) =>
    j === i
      ? { ...l, producto, cantidad: stepQty(l.cantidad, producto.unidad, 1), problema: undefined }
      : l
  );
}

export function cantidadEnCarrito(lines: CartLine[], id: string): string | null {
  return lines.find((l) => l.producto.id === id)?.cantidad ?? null;
}
