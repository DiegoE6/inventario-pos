import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { StockBadge } from "@/app/components/ui/stock-badge";
import { verifySession } from "@/app/lib/auth";
import { getCategorias, getProducto, getProveedores } from "@/app/lib/data";
import { formatMoney, formatQuantity } from "@/app/lib/format";
import { actualizarProducto } from "../actions";
import { ProductForm } from "../_components/product-form";

export async function generateMetadata({ params }: PageProps<"/panel/productos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const producto = await getProducto(id);
  return { title: producto?.nombre ?? "Producto" };
}

export default async function ProductoPage({ params, searchParams }: PageProps<"/panel/productos/[id]">) {
  const [session, { id }, sp] = await Promise.all([verifySession(), params, searchParams]);
  const producto = await getProducto(id);
  if (!producto) notFound();

  const back = { href: "/panel/productos", label: "Productos" };
  const [categorias, proveedores] = await Promise.all([getCategorias(), getProveedores()]);
  const categoria = categorias.find((c) => c.id === producto.categoria_id)?.nombre ?? null;

  const stockCard = (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">Stock actual</p>
        <p className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">
          {formatQuantity(producto.stock, producto.unidad)}
        </p>
        <p className="text-sm text-muted tabular-nums">
          Mínimo: {formatQuantity(producto.stock_minimo, producto.unidad)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <StockBadge stock={producto.stock} minimo={producto.stock_minimo} />
        <p className="max-w-56 text-right text-[13px] text-muted">
          El stock cambia con ventas, entradas, mermas y ajustes.
        </p>
      </div>
    </section>
  );

  // Cajero: solo lectura. (La página lo decide aquí; la BD lo vuelve a impedir.)
  if (session.rol !== "dueno") {
    return (
      <>
        <PageHeader title={producto.nombre} back={back} />
        {stockCard}
        <dl className="grid grid-cols-2 gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-base">
          <Dato label="Precio" value={<span className="tabular-nums">{formatMoney(producto.precio)}</span>} />
          <Dato label="Código" value={<span className="font-mono">{producto.codigo}</span>} />
          <Dato label="Categoría" value={categoria ?? "—"} />
          <Dato label="Estado" value={producto.activo ? "Activo" : "Inactivo"} />
          {producto.descripcion ? (
            <div className="col-span-2">
              <Dato label="Descripción" value={producto.descripcion} />
            </div>
          ) : null}
        </dl>
      </>
    );
  }

  const creado = sp.guardado === "creado";

  return (
    <>
      <PageHeader title={producto.nombre} back={back} />
      {creado ? <Notice tone="success">Producto creado.</Notice> : null}
      {stockCard}
      <ProductForm
        key={producto.id}
        mode="editar"
        action={actualizarProducto.bind(null, producto.id)}
        initial={{
          codigo: producto.codigo,
          nombre: producto.nombre,
          descripcion: producto.descripcion ?? "",
          categoria_id: producto.categoria_id === null ? "" : String(producto.categoria_id),
          proveedor_id: producto.proveedor_id === null ? "" : String(producto.proveedor_id),
          unidad: producto.unidad,
          costo: Number(producto.costo).toFixed(2),
          precio: Number(producto.precio).toFixed(2),
          stock_minimo: String(Number(producto.stock_minimo)),
          stock_inicial: "0",
          activo: producto.activo,
        }}
        // Activas, más la que ya tiene asignada aunque esté desactivada.
        categorias={categorias.filter((c) => c.activo || c.id === producto.categoria_id)}
        proveedores={proveedores.filter((p) => p.activo || p.id === producto.proveedor_id)}
      />
    </>
  );
}

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
