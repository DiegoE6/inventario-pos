import type { LucideIcon } from "lucide-react";

/** Sección que todavía no existe. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mx-auto max-w-sm text-base text-muted">{description}</p>
      </div>
      <span className="rounded-full bg-surface-muted px-3 py-1 text-[13px] font-medium text-muted">
        Próximamente
      </span>
    </div>
  );
}
