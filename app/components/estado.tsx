import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Estado vacío útil: qué pasó y qué hacer después. `acciones` son botones o
 * enlaces (buttonClasses); si no hay nada que hacer, se omiten.
 */
export function EstadoVacio({
  icon: Icon,
  titulo,
  children,
  acciones,
  compacto = false,
}: {
  icon?: LucideIcon;
  titulo: ReactNode;
  children?: ReactNode;
  acciones?: ReactNode;
  /** Dentro de una tarjeta o lista: sin borde propio y con menos aire. */
  compacto?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 text-center ${
        compacto
          ? "px-4 py-8"
          : "rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-10"
      }`}
    >
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted">
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-base font-semibold [overflow-wrap:anywhere]">{titulo}</p>
        {children ? <div className="text-sm text-muted">{children}</div> : null}
      </div>
      {acciones ? <div className="flex flex-wrap justify-center gap-2">{acciones}</div> : null}
    </div>
  );
}

/**
 * Bloque gris de esqueleto. El pulso se apaga con prefers-reduced-motion:
 * queda el bloque fijo, que igual dice "aquí va algo".
 */
export function Bloque({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none ${className}`} />;
}

/** Contenedor de un esqueleto: lo anuncia una sola vez a lectores de pantalla. */
export function Cargando({ children, etiqueta = "Cargando…" }: { children: ReactNode; etiqueta?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{etiqueta}</span>
      {children}
    </div>
  );
}
