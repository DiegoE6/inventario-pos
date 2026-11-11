import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium " +
  "select-none whitespace-nowrap " +
  // Respuesta al presionar (Emil): escala sutil, rápida, solo transform.
  "transition-[transform,background-color,border-color,color] duration-150 ease-out " +
  "motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary:
    "bg-surface text-foreground border border-border-strong hover:bg-surface-muted",
  ghost: "text-foreground hover:bg-surface-muted",
  danger: "bg-danger text-white hover:bg-danger-hover focus-visible:outline-danger",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-base",
};

/** Clases de botón, para usarlas también en <Link>. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Muestra el spinner, deshabilita el botón y cambia el texto. */
  pending?: boolean;
  pendingLabel?: ReactNode;
  icon?: ReactNode;
};

export function Button({
  variant,
  size,
  pending = false,
  pendingLabel,
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {pending ? (
        <LoaderCircle aria-hidden className="size-[18px] animate-spin" />
      ) : (
        icon
      )}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
