import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { buttonClasses } from "@/app/components/ui/button";
import { StockBadge } from "@/app/components/ui/stock-badge";
import { formatCents, formatQuantity } from "@/app/lib/format";
import type { MasVendido, Periodo, StockBajo } from "@/app/lib/inicio";

export function Section({
  id,
  title,
  actions,
  children,
}: {
  id?: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-titulo` : undefined}
      className="flex min-w-0 scroll-mt-6 flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id ? `${id}-titulo` : undefined} className="text-lg font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function SinDatos({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** 7 / 30 días: enlaces (el servidor recalcula), sin mover el scroll. */
export function PeriodTabs({ periodo }: { periodo: Periodo }) {
  const opciones: { valor: Periodo; label: string; href: string }[] = [
    { valor: 7, label: "7 días", href: "/panel" },
    { valor: 30, label: "30 días", href: "/panel?periodo=30" },
  ];
  return (
    <nav aria-label="Periodo" className="flex rounded-[var(--radius-control)] bg-surface-muted p-1">
      {opciones.map((o) => {
        const actual = o.valor === periodo;
        return (
          <Link
            key={o.valor}
            href={o.href}
            scroll={false}
            replace
            aria-current={actual ? "page" : undefined}
            className={`flex h-10 items-center rounded-[8px] px-3 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-out motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary-ink ${
              actual ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Top por importe. La cantidad con su unidad es el dato secundario. */
export function TopProducts({ items }: { items: MasVendido[] }) {
  if (items.length === 0) return <SinDatos>Todavía no hay ventas en este periodo.</SinDatos>;
  const max = items[0].importeCents || 1;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((p, i) => (
        <li key={p.productoId} className="relative flex flex-col gap-1.5">
          <div className="flex items-baseline gap-3">
            <span className="w-4 shrink-0 text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                href={`/panel/productos/${p.productoId}`}
                className="truncate text-[15px] font-medium after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-primary-ink"
              >
                {p.nombre}
              </Link>
              <span className="text-[13px] text-muted tabular-nums">{formatQuantity(p.cantidad, p.unidad)}</span>
            </div>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatCents(p.importeCents)}</span>
          </div>
          {/* Barra fina: proporción contra el primero, para leer el top de un vistazo. */}
          <div aria-hidden className="ml-7 h-1 rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary-ink" style={{ width: `${(p.importeCents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Lo que se está acabando. El dueño tiene "Registrar entrada" por producto;
 * el cajero no (no puede registrarla) y ve la nota para avisar.
 */
export function LowStockList({ items, puedeRegistrar }: { items: StockBajo[]; puedeRegistrar: boolean }) {
  if (items.length === 0) return <SinDatos>Todo en orden: ningún producto está por debajo de su mínimo.</SinDatos>;
  return (
    <ul className="-my-1 flex flex-col divide-y divide-border">
      {items.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3">
          {/* relative: el enlace estirado cubre el nombre y los datos (de alto, también el
              padding de la fila), pero no el botón de entrada. */}
          <div className="relative flex min-w-0 flex-1 flex-col gap-1">
            <Link
              href={`/panel/productos/${p.id}`}
              className="line-clamp-2 text-[15px] font-medium after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-primary-ink"
            >
              {p.nombre}
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted tabular-nums">
              <StockBadge stock={p.stock} minimo={p.stockMinimo} />
              <span>
                Quedan {formatQuantity(p.stock, p.unidad)} · mín. {formatQuantity(p.stockMinimo, p.unidad)}
              </span>
            </div>
          </div>
          {puedeRegistrar ? (
            <Link
              href={`/panel/inventario/entrada?producto=${p.id}`}
              className={buttonClasses({ variant: "secondary", className: "shrink-0" })}
              aria-label={`Registrar entrada de ${p.nombre}`}
            >
              <PackagePlus aria-hidden className="size-[18px]" />
              <span className="hidden min-[400px]:inline">Registrar entrada</span>
              <span className="min-[400px]:hidden">Entrada</span>
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
