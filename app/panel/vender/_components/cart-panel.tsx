"use client";

import { ArrowLeftRight, Banknote, CreditCard, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import {
  aceptaDecimales,
  lineCents,
  lineIssue,
  parseQtyMilli,
  stepQty,
  suggestedBills,
  type CartLine,
  type MetodoPago,
} from "@/app/lib/cart";
import { formatCents, formatMoney, UNIDAD_CORTA, unidadCorta } from "@/app/lib/format";

const METODOS: { value: MetodoPago; label: string; icon: typeof Banknote }[] = [
  { value: "efectivo", label: "Efectivo", icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { value: "transferencia", label: "Transferencia", icon: ArrowLeftRight },
];

/**
 * Carrito + pago + cobrar. Un solo componente: en celular/tablet vertical es
 * una hoja a pantalla completa (open); desde 1024px es la columna derecha.
 * Sin animaciones: cobrar tiene que sentirse inmediato.
 */
export function CartPanel({
  open,
  onClose,
  lines,
  onQty,
  onRemove,
  onClear,
  metodo,
  onMetodo,
  recibido,
  onRecibido,
  totalCents,
  cartValid,
  payment,
  error,
  cobrando,
  onCobrar,
}: {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
  onQty: (id: string, cantidad: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  metodo: MetodoPago;
  onMetodo: (m: MetodoPago) => void;
  recibido: string;
  onRecibido: (v: string) => void;
  totalCents: number;
  cartValid: boolean;
  payment: { valid: boolean; recibidoCents: number | null; cambioCents: number };
  error: string | null;
  cobrando: boolean;
  onCobrar: () => void;
}) {
  const puedeCobrar = cartValid && payment.valid && !cobrando;
  const faltaCents =
    metodo === "efectivo" && payment.recibidoCents !== null && payment.recibidoCents < totalCents
      ? totalCents - payment.recibidoCents
      : 0;

  return (
    <section
      aria-label="Carrito"
      className={`${
        open ? "hoja-carrito fixed inset-0 z-50 flex" : "hidden"
      } flex-col bg-background lg:sticky lg:top-6 lg:z-auto lg:flex lg:max-h-[calc(100dvh-3rem)] lg:rounded-[var(--radius-card)] lg:border lg:border-border lg:bg-surface`}
    >
      {/* Encabezado */}
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="flex-1 text-lg font-semibold">
          Carrito{lines.length ? <span className="text-muted"> · {lines.length}</span> : null}
        </h2>
        {lines.length ? (
          <Button
            variant="ghost"
            className="px-3 text-danger"
            onClick={() => {
              if (window.confirm("¿Vaciar el carrito?")) onClear();
            }}
            icon={<Trash2 aria-hidden className="size-[18px]" />}
          >
            Vaciar
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose} aria-label="Cerrar carrito" className="px-3 lg:hidden">
          <X aria-hidden className="size-5" />
        </Button>
      </header>

      {/* Renglones */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted">
            <ShoppingCart aria-hidden className="size-8" />
            <p className="text-base">Busca o escanea un producto para agregarlo.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <CartRow key={line.producto.id} line={line} onQty={onQty} onRemove={onRemove} />
            ))}
          </ul>
        )}
      </div>

      {/* Pago y cobro */}
      <footer className="flex flex-col gap-3 border-t border-border bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 lg:rounded-b-[var(--radius-card)] lg:pb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base text-muted">Total</span>
          <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">
            {formatCents(totalCents)}
          </span>
        </div>

        <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-3 gap-2">
          {METODOS.map(({ value, label, icon: Icon }) => {
            const active = metodo === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onMetodo(value)}
                className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border text-[13px] font-medium transition-[transform,background-color,border-color] duration-150 ease-out motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink ${
                  active
                    ? "border-primary-ink bg-primary-soft text-primary-ink"
                    : "border-border-strong bg-surface text-foreground"
                }`}
              >
                <Icon aria-hidden className="size-[18px]" />
                {label}
              </button>
            );
          })}
        </div>

        {metodo === "efectivo" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label htmlFor="pos-recibido" className="shrink-0 text-base">
                Recibido
              </label>
              <div className="relative flex-1">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                  $
                </span>
                <input
                  id="pos-recibido"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder="0.00"
                  value={recibido}
                  onChange={(e) => onRecibido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && puedeCobrar) {
                      e.preventDefault();
                      onCobrar();
                    }
                  }}
                  className="h-12 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pl-7 pr-3 text-right text-lg font-medium tabular-nums focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            {totalCents > 0 ? (
              <div className="flex flex-wrap gap-2">
                <QuickAmount onClick={() => onRecibido((totalCents / 100).toFixed(2))}>Exacto</QuickAmount>
                {suggestedBills(totalCents).map((b) => (
                  <QuickAmount key={b} onClick={() => onRecibido(String(b / 100))}>
                    {formatCents(b)}
                  </QuickAmount>
                ))}
              </div>
            ) : null}
            <div className="flex items-baseline justify-between" aria-live="polite">
              {faltaCents > 0 ? (
                <>
                  <span className="text-base text-danger">Faltan</span>
                  <span className="text-xl font-semibold text-danger tabular-nums">{formatCents(faltaCents)}</span>
                </>
              ) : (
                <>
                  <span className="text-base text-muted">Cambio</span>
                  <span className="text-2xl font-semibold text-success tabular-nums">
                    {formatCents(payment.cambioCents)}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <Button
          size="lg"
          className="h-14 w-full text-lg"
          disabled={!puedeCobrar}
          pending={cobrando}
          pendingLabel="Cobrando…"
          onClick={onCobrar}
        >
          Cobrar {formatCents(totalCents)}
        </Button>
      </footer>
    </section>
  );
}

function QuickAmount({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-full border border-border-strong bg-surface px-3.5 text-sm font-medium tabular-nums transition-[transform,background-color] duration-150 ease-out hover:bg-surface-muted motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
    >
      {children}
    </button>
  );
}

function CartRow({
  line,
  onQty,
  onRemove,
}: {
  line: CartLine;
  onQty: (id: string, cantidad: string) => void;
  onRemove: (id: string) => void;
}) {
  const { producto, cantidad } = line;
  const milli = parseQtyMilli(cantidad, producto.unidad);
  const issue = lineIssue(line);
  const u = UNIDAD_CORTA[producto.unidad];
  const inputId = `qty-${producto.id}`;

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 ${issue ? "bg-danger-soft/60" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-base font-medium leading-snug">{producto.nombre}</p>
          <p className="text-[13px] text-muted tabular-nums">
            {formatMoney(producto.precio)} / {u}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(producto.id)}
          aria-label={`Quitar ${producto.nombre}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-primary-ink"
        >
          <X aria-hidden className="size-[18px]" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-[var(--radius-control)] border border-border-strong bg-surface">
          <StepButton
            label="Uno menos"
            disabled={milli === null || milli <= 1000}
            onClick={() => onQty(producto.id, stepQty(cantidad, producto.unidad, -1))}
          >
            <Minus aria-hidden className="size-[18px]" />
          </StepButton>
          <label htmlFor={inputId} className="sr-only">
            Cantidad de {producto.nombre}
          </label>
          <input
            id={inputId}
            inputMode={aceptaDecimales(producto.unidad) ? "decimal" : "numeric"}
            autoComplete="off"
            value={cantidad}
            onChange={(e) => onQty(producto.id, e.target.value.replace(",", "."))}
            onFocus={(e) => e.target.select()}
            aria-invalid={issue ? true : undefined}
            className="h-11 w-16 border-x border-border-strong bg-transparent text-center text-base font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-ink"
          />
          <StepButton label="Uno más" onClick={() => onQty(producto.id, stepQty(cantidad, producto.unidad, 1))}>
            <Plus aria-hidden className="size-[18px]" />
          </StepButton>
        </div>
        <span className="text-sm text-muted">{unidadCorta(producto.unidad, milli === null ? undefined : milli / 1000)}</span>
        <span className="ml-auto text-base font-semibold tabular-nums">
          {milli === null ? "—" : formatCents(lineCents(producto.precio, milli))}
        </span>
      </div>

      {issue ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {issue}
        </p>
      ) : null}
    </li>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center text-foreground transition-transform duration-150 ease-out motion-safe:active:scale-[0.95] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
