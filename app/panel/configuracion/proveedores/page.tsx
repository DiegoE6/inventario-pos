import type { Metadata } from "next";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { getProveedores } from "@/app/lib/data";
import { actualizarProveedor, cambiarEstadoProveedor, crearProveedor } from "../actions";
import { CatalogManager } from "../_components/catalog-manager";

export const metadata: Metadata = { title: "Proveedores" };

export default async function ProveedoresPage() {
  await requireDueno();
  const proveedores = await getProveedores();

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="A quién le compras. Un proveedor desactivado ya no se puede elegir en productos nuevos."
        back={{ href: "/panel/configuracion", label: "Configuración" }}
      />
      <CatalogManager
        items={proveedores.map((p) => ({
          id: p.id,
          activo: p.activo,
          values: {
            nombre: p.nombre,
            contacto: p.contacto ?? "",
            telefono: p.telefono ?? "",
            notas: p.notas ?? "",
          },
          subtitle: [p.contacto, p.telefono, p.notas].filter(Boolean).join(" · ") || undefined,
        }))}
        fields={[
          { name: "nombre", label: "Nombre", maxLength: 120, placeholder: "Ej. Distribuidora del Norte" },
          { name: "contacto", label: "Contacto (opcional)", maxLength: 120 },
          { name: "telefono", label: "Teléfono (opcional)", maxLength: 30, type: "tel" },
          { name: "notas", label: "Notas (opcional)", maxLength: 500, multiline: true },
        ]}
        labels={{
          nuevo: "Nuevo proveedor",
          agregar: "Agregar proveedor",
          vacio: "Todavía no hay proveedores.",
        }}
        crear={crearProveedor}
        actualizar={actualizarProveedor}
        cambiarEstado={cambiarEstadoProveedor}
      />
    </>
  );
}
