import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";

/**
 * Etiqueta arriba, ayuda o error abajo. `id` es obligatorio para ligar la
 * etiqueta y el mensaje al control (accesibilidad).
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const control =
  "h-11 w-full rounded-[var(--radius-control)] border bg-surface px-3 " +
  // 16px mínimo: en iOS un input más chico hace zoom al tocarlo.
  "text-base text-foreground placeholder:text-muted/70 " +
  "transition-[border-color,box-shadow] duration-150 ease-out " +
  "focus:outline-none focus:ring-2 focus:ring-offset-0 " +
  "disabled:bg-surface-muted disabled:text-muted";

function stateClasses(invalid?: boolean) {
  return invalid
    ? "border-danger focus:border-danger focus:ring-danger/20"
    : "border-border-strong focus:border-primary-ink focus:ring-primary/20";
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  invalid?: boolean;
  /** Texto fijo antes del valor, por ejemplo "$". */
  prefix?: string;
  describedBy?: "error" | "hint";
};

export function Input({ id, invalid, prefix, describedBy, className = "", ...props }: InputProps) {
  const input = (
    <input
      id={id}
      name={props.name ?? id}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy ? `${id}-${describedBy}` : undefined}
      className={`${control} ${stateClasses(invalid)} ${prefix ? "pl-7" : ""} ${className}`}
      {...props}
    />
  );
  if (!prefix) return input;
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted"
      >
        {prefix}
      </span>
      {input}
    </div>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  invalid?: boolean;
  describedBy?: "error" | "hint";
};

export function Select({ id, invalid, describedBy, className = "", children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        name={props.name ?? id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy ? `${id}-${describedBy}` : undefined}
        className={`${control} ${stateClasses(invalid)} appearance-none pr-10 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
