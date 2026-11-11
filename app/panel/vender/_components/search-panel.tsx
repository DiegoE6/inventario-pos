"use client";

import type { Ref } from "react";
import { ProductSearchInput } from "@/app/components/product-search/search-input";
import { useProductSearch } from "@/app/components/product-search/use-product-search";
import { cantidadEnCarrito, type CartLine, type PosProduct } from "@/app/lib/cart";
import { formatMoney, formatQuantity } from "@/app/lib/format";

/**
 * Buscador del punto de venta, con foco automático. La lógica (retardo,
 * respuestas viejas descartadas, Enter con código exacto) vive en
 * useProductSearch, compartida con inventario.
 */
export function SearchPanel({
  inputRef,
  frecuentes,
  lines,
  onAdd,
}: {
  inputRef: Ref<HTMLInputElement>;
  frecuentes: PosProduct[];
  lines: CartLine[];
  onAdd: (p: PosProduct, opts?: { fromScan?: boolean }) => void;
}) {
  const search = useProductSearch({ onExact: (p) => onAdd(p, { fromScan: true }) });
  const { q, results, loading, aviso } = search;

  const lista = results ?? frecuentes;
  const titulo = results ? null : frecuentes.length ? "Más vendidos" : null;

  return (
    <section aria-label="Buscar productos" className="flex flex-col gap-3">
      <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pb-2 pt-1 backdrop-blur md:-mx-6 md:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <ProductSearchInput
          id="pos-buscar"
          inputRef={inputRef}
          label="Buscar por nombre o escanear código"
          placeholder="Buscar o escanear código"
          autoFocus
          search={search}
        />
        {aviso ? (
          <p role="status" className="mt-2 text-sm text-danger">
            {aviso}
          </p>
        ) : null}
      </div>

      {titulo ? <h2 className="text-sm font-medium text-muted">{titulo}</h2> : null}

      {results && results.length === 0 && !loading ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-base text-muted">
          Ningún producto coincide con “{q.trim()}”.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((p) => (
            <li key={p.id}>
              <ResultCard producto={p} enCarrito={cantidadEnCarrito(lines, p.id)} onAdd={onAdd} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultCard({
  producto,
  enCarrito,
  onAdd,
}: {
  producto: PosProduct;
  enCarrito: string | null;
  onAdd: (p: PosProduct) => void;
}) {
  const agotado = producto.stock <= 0;
  return (
    <button
      type="button"
      disabled={agotado}
      onClick={() => onAdd(producto)}
      className="flex min-h-[84px] w-full items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3.5 text-left transition-[transform,border-color] duration-150 ease-out hover:border-border-strong motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-base font-medium leading-snug">{producto.nombre}</span>
        <span className="text-[13px] text-muted">
          <span className="font-mono">{producto.codigo}</span>
          {" · "}
          {agotado ? (
            <span className="font-semibold text-danger">Agotado</span>
          ) : (
            <span className="tabular-nums">Hay {formatQuantity(producto.stock, producto.unidad)}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-lg font-semibold tabular-nums">{formatMoney(producto.precio)}</span>
        {enCarrito ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-ink tabular-nums">
            En carrito: {enCarrito}
          </span>
        ) : null}
      </span>
    </button>
  );
}
