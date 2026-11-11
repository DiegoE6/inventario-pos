import type { Metadata } from "next";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { getCategorias, getProveedores } from "@/app/lib/data";
import { crearProducto } from "../actions";
import { EMPTY_PRODUCT, ProductForm } from "../_components/product-form";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NuevoProductoPage({ searchParams }: PageProps<"/panel/productos/nuevo">) {
  await requireDueno();
  // Desde Vender: "Dar de alta" un código que no se encontró. Solo se usa como
  // valor inicial del campo (React lo escapa); el servidor lo valida al guardar.
  const sp = await searchParams;
  const codigo = typeof sp.codigo === "string" ? sp.codigo.trim().slice(0, 50) : "";
  const [categorias, proveedores] = await Promise.all([getCategorias(), getProveedores()]);

  return (
    <>
      <PageHeader title="Nuevo producto" back={{ href: "/panel/productos", label: "Productos" }} />
      <ProductForm
        mode="crear"
        action={crearProducto}
        // EMPTY_PRODUCT viene de un módulo "use client": aquí es una referencia,
        // no el objeto, así que el código va aparte y el formulario lo combina.
        initial={EMPTY_PRODUCT}
        codigoInicial={codigo || undefined}
        categorias={categorias.filter((c) => c.activo)}
        proveedores={proveedores.filter((p) => p.activo)}
      />
    </>
  );
}
