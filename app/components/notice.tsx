import type { ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

/** Aviso en línea: éxito (verde) o error (rojo). */
export function Notice({ tone, children }: { tone: "success" | "danger"; children: ReactNode }) {
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm ${
        tone === "success" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
