import Link from "next/link";
import { formatMoney, formatQuantity, type Unidad } from "@/app/lib/format";
import { StockBadge } from "@/app/components/ui/stock-badge";

export type ProductCardData = {
  id: string;
  codigo: string;
  nombre: string;
  precio: number | string;
  stock: number | string;
  stock_minimo: number | string;
  unidad: Unidad;
  categoria?: string | null;
  activo?: boolean;
};

/** Tarjeta de producto para celular. Con `href`, toda la tarjeta es tocable. */
export function ProductCard({ product, href }: { product: ProductCardData; href?: string }) {
  const content = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-base font-medium leading-snug text-foreground">
          {product.nombre}
        </p>
        <p className="truncate text-[13px] text-muted">
          <span className="font-mono">{product.codigo}</span>
          {product.categoria ? ` · ${product.categoria}` : null}
          {product.activo === false ? " · Inactivo" : null}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted tabular-nums">
            Stock: <span className="font-medium text-foreground">
              {formatQuantity(product.stock, product.unidad)}
            </span>
          </span>
          <StockBadge stock={product.stock} minimo={product.stock_minimo} />
        </div>
      </div>
      <p className="shrink-0 text-lg font-semibold text-foreground tabular-nums">
        {formatMoney(product.precio)}
      </p>
    </>
  );

  const className =
    "flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4";

  if (!href) return <article className={className}>{content}</article>;

  return (
    <Link
      href={href}
      className={`${className} transition-[transform,border-color] duration-150 ease-out hover:border-border-strong motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink ${
        product.activo === false ? "opacity-60" : ""
      }`}
    >
      {content}
    </Link>
  );
}
