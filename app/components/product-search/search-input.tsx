"use client";

import type { Ref } from "react";
import { LoaderCircle, ScanBarcode, Search, X } from "lucide-react";

/** Campo de búsqueda de productos (lupa, spinner, borrar, ícono de escáner). */
export function ProductSearchInput({
  id,
  inputRef,
  label,
  placeholder,
  autoFocus,
  search,
}: {
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  placeholder: string;
  autoFocus?: boolean;
  search: {
    q: string;
    loading: boolean;
    onChange: (v: string) => void;
    onEnter: () => Promise<void>;
    limpiar: () => void;
  };
}) {
  const { q, loading, onChange, onEnter, limpiar } = search;
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={q}
          maxLength={100}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onEnter();
            } else if (e.key === "Escape" && q) {
              limpiar();
            }
          }}
          className="h-12 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pl-11 pr-11 text-base text-foreground placeholder:text-muted/70 focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
          {loading ? (
            <LoaderCircle aria-label="Buscando" className="mr-1.5 size-5 animate-spin text-muted" />
          ) : q ? (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={limpiar}
              className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : (
            <ScanBarcode aria-hidden className="mr-2 size-5 text-muted" />
          )}
        </span>
      </div>
    </>
  );
}
