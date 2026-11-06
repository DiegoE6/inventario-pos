"use client";

import { ShoppingCart } from "lucide-react";
import { formatCents } from "@/app/lib/format";

/**
 * Barra fija con el total, siempre visible en celular y tablet vertical.
 * En celular va encima de la barra de navegación; en tablet vertical (con
 * barra lateral) va al fondo. Desde 1024px no se usa (dos columnas).
 */
export function CartBar({
  count,
  totalCents,
  onOpen,
}: {
  count: number;
  totalCents: number;
  onOpen: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-2.5 backdrop-blur md:bottom-0 md:left-60 md:pb-[calc(0.625rem+env(safe-area-inset-bottom))] lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-14 w-full items-center gap-3 rounded-[var(--radius-control)] bg-primary px-4 text-on-primary transition-transform duration-150 ease-out motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="relative">
          <ShoppingCart aria-hidden className="size-6" />
          {count > 0 ? (
            <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-on-primary text-[11px] font-bold text-primary tabular-nums">
              {count}
            </span>
          ) : null}
        </span>
        <span className="flex-1 text-left text-base font-medium">
          {count === 0 ? "Carrito vacío" : count === 1 ? "1 producto" : `${count} productos`}
        </span>
        <span className="text-xl font-semibold tabular-nums">{formatCents(totalCents)}</span>
      </button>
    </div>
  );
}
