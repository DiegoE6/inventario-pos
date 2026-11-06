/** Formatos de dinero y cantidades para la UI (es-MX). */

export type Unidad = "pieza" | "caja" | "metro" | "kilo" | "litro";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const quantity = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 });

/** Abreviatura de la unidad para mostrar junto a una cantidad. */
export const UNIDAD_CORTA: Record<Unidad, string> = {
  pieza: "pza",
  caja: "caja",
  metro: "m",
  kilo: "kg",
  litro: "L",
};

/**
 * Unidad corta que concuerda con la cantidad: "1 caja", "3 cajas". pza, m, kg
 * y L son abreviaturas y no cambian. Sin cantidad (etiquetas como
 * "Cantidad (cajas)") va en plural.
 */
export function unidadCorta(unidad: Unidad, cantidad?: number | string): string {
  if (unidad === "caja" && (cantidad === undefined || Number(cantidad) !== 1)) return "cajas";
  return UNIDAD_CORTA[unidad];
}

/** Formatea un monto. Solo para mostrar: no usar para sumar dinero. */
export function formatMoney(value: number | string): string {
  return money.format(Number(value));
}

/** Formatea centavos enteros como dinero ($1,234.50). */
export function formatCents(cents: number): string {
  return money.format(cents / 100);
}

/** "12.5 m", "3 pza", "1 caja", "3 cajas". */
export function formatQuantity(value: number | string, unidad: Unidad): string {
  return `${quantity.format(Number(value))} ${unidadCorta(unidad, value)}`;
}
