import type { Metadata } from "next";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { getCategorias } from "@/app/lib/data";
import { actualizarCategoria, cambiarEstadoCategoria, crearCategoria } from "../actions";
import { CatalogManager } from "../_components/catalog-manager";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriasPage() {
  await requireDueno();
  const categorias = await getCategorias();

  return (
    <>
      <PageHeader
        title="Categorías"
        description="Agrupan tus productos. Una categoría desactivada ya no se puede elegir en productos nuevos."
        back={{ href: "/panel/configuracion", label: "Configuración" }}
      />
      <CatalogManager
        items={categorias.map((c) => ({ id: c.id, activo: c.activo, values: { nombre: c.nombre } }))}
        fields={[{ name: "nombre", label: "Nombre", maxLength: 60, placeholder: "Ej. Herramienta" }]}
        labels={{
          nuevo: "Nueva categoría",
          agregar: "Agregar categoría",
          vacio: "Todavía no hay categorías.",
        }}
        crear={crearCategoria}
        actualizar={actualizarCategoria}
        cambiarEstado={cambiarEstadoCategoria}
      />
    </>
  );
}
