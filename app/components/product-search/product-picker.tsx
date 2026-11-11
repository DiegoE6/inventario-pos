"use client";

import { SearchX } from "lucide-react";
import { EstadoVacio } from "@/app/components/estado";
import { Button } from "@/app/components/ui/button";
import type { PosProduct } from "@/app/lib/cart";
import { formatQuantity } from "@/app/lib/format";
import { ProductSearchInput } from "./search-input";
import { useProductSearch } from "./use-product-search";

/**
 * Elegir un producto (inventario): búsqueda por nombre o código con soporte
 * para lector de barras. Enter con código exacto lo elige directo.
 */
export function ProductPicker({
  id,
  onSelect,
  autoFocus = true,
}: {
  id: string;
  onSelect: (p: PosProduct) => void;
  autoFocus?: boolean;
}) {
  const search = useProductSearch({ onExact: onSelect });
  const { q, results, loading, aviso } = search;

  return (
    <div className="flex flex-col gap-3">
      <ProductSearchInput
        id={id}
        label="Buscar producto por nombre o código"
        placeholder="Buscar o escanear producto"
        autoFocus={autoFocus}
        search={search}
      />
      {aviso ? (
        <p role="status" className="text-sm text-danger">
          {aviso}
        </p>
      ) : null}

      {results && results.length === 0 && !loading ? (
        <EstadoVacio
          icon={SearchX}
          titulo={`Ningún producto coincide con «${q.trim()}»`}
          acciones={
            <Button variant="secondary" onClick={() => search.limpiar()}>
              Limpiar búsqueda
            </Button>
          }
        >
          Revisa el código o búscalo por nombre.
        </EstadoVacio>
      ) : results ? (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ink"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-base font-medium leading-snug">{p.nombre}</span>
                  <span className="font-mono text-[13px] text-muted">{p.codigo}</span>
                </span>
                <span className="shrink-0 text-sm text-muted tabular-nums">
                  {formatQuantity(p.stock, p.unidad)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Escribe el nombre o escanea el código del producto.</p>
      )}
    </div>
  );
}
