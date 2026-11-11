import Link from "next/link";
import { buttonClasses } from "@/app/components/ui/button";

/** notFound() dentro del panel sin uno propio: se queda con el menú del panel. */
export default function PanelNoEncontrado() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface p-6">
      <h1 className="text-xl font-semibold">No encontramos lo que buscas</h1>
      <p className="text-base text-muted">Puede que la liga esté mal escrita o que ya no exista.</p>
      <Link href="/panel" className={buttonClasses({ variant: "secondary" })}>
        Ir al inicio
      </Link>
    </div>
  );
}
