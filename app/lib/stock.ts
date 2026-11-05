export type StockStatus = "agotado" | "bajo" | "ok";

/**
 * Agotado: no hay nada (urgente). Bajo: hay, pero en o debajo del mínimo
 * (mismo criterio que la vista v_stock_bajo: stock <= stock_minimo).
 */
export function stockStatus(stock: number | string, minimo: number | string): StockStatus {
  const s = Number(stock);
  if (s <= 0) return "agotado";
  if (s <= Number(minimo)) return "bajo";
  return "ok";
}
