import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/app/components/ui/button";

export const metadata: Metadata = { title: "Página no encontrada" };

/**
 * 404 general (rutas que no existen y notFound() sin uno propio). Mismo estilo
 * que el de Ventas. El enlace va al panel; sin sesión, el proxy manda al login.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface p-6">
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="text-base text-muted">Puede que la dirección esté mal escrita o que la página ya no exista.</p>
        <Link href="/panel" className={buttonClasses({ variant: "secondary" })}>
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
