import type { Metadata } from "next";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { MAX_BYTES, MAX_FILAS } from "@/app/lib/excel/leer";
import { Importador } from "./_components/importador";

export const metadata: Metadata = { title: "Importar productos" };

export default async function ImportarPage() {
  await requireDueno();
  return (
    <>
      <PageHeader
        back={{ href: "/panel/productos", label: "Productos" }}
        title="Importar productos"
        description="Carga tu lista desde Excel o CSV. Antes de guardar ves qué se va a crear."
      />
      <Importador maxBytes={MAX_BYTES} maxFilas={MAX_FILAS} />
    </>
  );
}
