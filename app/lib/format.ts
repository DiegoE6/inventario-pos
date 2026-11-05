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

/** Formatea un monto. Solo para mostrar: no usar para sumar dinero. */
export function formatMoney(value: number | string): string {
  return money.format(Number(value));
}

/** Formatea centavos enteros como dinero ($1,234.50). */
export function formatCents(cents: number): string {
  return money.format(cents / 100);
}

/** "12.5 m", "3 pza", "1 caja". */
export function formatQuantity(value: number | string, unidad: Unidad): string {
  return `${quantity.format(Number(value))} ${UNIDAD_CORTA[unidad]}`;
}
