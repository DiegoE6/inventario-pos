import Link from "next/link";
import { buttonClasses } from "@/app/components/ui/button";

/** Producto que no existe (o un id mal escrito). Dentro del panel: el menú sigue. */
export default function ProductoNoEncontrado() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface p-6">
      <h1 className="text-xl font-semibold">No encontramos este producto</h1>
      <p className="text-base text-muted">Puede que la liga esté mal o que el producto se haya importado de nuevo con otro código.</p>
      <Link href="/panel/productos" className={buttonClasses({ variant: "secondary" })}>
        Ver productos
      </Link>
    </div>
  );
}
