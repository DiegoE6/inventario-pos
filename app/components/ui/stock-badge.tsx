import { stockStatus, type StockStatus } from "@/app/lib/stock";

const styles: Record<Exclude<StockStatus, "ok">, { label: string; className: string }> = {
  // Urgente: rojo sólido, salta a la vista.
  agotado: { label: "Agotado", className: "bg-danger text-white" },
  // Aviso: rojo suave, se nota sin gritar.
  bajo: { label: "Stock bajo", className: "bg-danger-soft text-danger" },
};

/** No muestra nada cuando el stock está bien: menos ruido en la lista. */
export function StockBadge({
  stock,
  minimo,
}: {
  stock: number | string;
  minimo: number | string;
}) {
  const status = stockStatus(stock, minimo);
  if (status === "ok") return null;
  const { label, className } = styles[status];
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
