import type { Metadata } from "next";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { getCategorias, getProveedores } from "@/app/lib/data";
import { crearProducto } from "../actions";
import { EMPTY_PRODUCT, ProductForm } from "../_components/product-form";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NuevoProductoPage() {
  await requireDueno();
  const [categorias, proveedores] = await Promise.all([getCategorias(), getProveedores()]);

  return (
    <>
      <PageHeader title="Nuevo producto" back={{ href: "/panel/productos", label: "Productos" }} />
      <ProductForm
        mode="crear"
        action={crearProducto}
        initial={EMPTY_PRODUCT}
        categorias={categorias.filter((c) => c.activo)}
        proveedores={proveedores.filter((p) => p.activo)}
      />
    </>
  );
}
