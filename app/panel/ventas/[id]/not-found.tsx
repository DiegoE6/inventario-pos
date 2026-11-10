import Link from "next/link";
import { buttonClasses } from "@/app/components/ui/button";

/** Venta que no existe o que el usuario no puede ver (venta de otro cajero). */
export default function VentaNoEncontrada() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface p-6">
      <h1 className="text-xl font-semibold">No encontramos esta venta</h1>
      <p className="text-base text-muted">Puede que no exista o que no tengas permiso para verla.</p>
      <Link href="/panel/ventas" className={buttonClasses({ variant: "secondary" })}>
        Ver ventas
      </Link>
    </div>
  );
}
