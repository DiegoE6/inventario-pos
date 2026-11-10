import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { buttonClasses } from "@/app/components/ui/button";
import { StockBadge } from "@/app/components/ui/stock-badge";
import { verifySession } from "@/app/lib/auth";
import { getCategorias, getCostoProducto, getProducto, getProveedores } from "@/app/lib/data";
import { movimientosDeProducto } from "@/app/lib/inventario";
import { MovimientoList } from "../../inventario/_components/movimiento-list";
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
  // El costo solo se pide para el dueño (la BD se lo niega al cajero).
  const [categorias, proveedores, costo] = await Promise.all([
    getCategorias(),
    getProveedores(),
    session.rol === "dueno" ? getCostoProducto(producto.id) : Promise.resolve(null),
  ]);
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
  // Solo dueño (RLS de movimientos): historial y accesos a inventario.
  const movimientos = await movimientosDeProducto(producto.id, 10);
  const q = `?producto=${producto.id}`;

  return (
    <>
      <PageHeader title={producto.nombre} back={back} />
      {creado ? <Notice tone="success">Producto creado.</Notice> : null}
      {stockCard}
      <div className="flex flex-wrap gap-2">
        <Link href={`/panel/inventario/entrada${q}`} className={buttonClasses()}>
          <PackagePlus aria-hidden className="size-[18px]" />
          Registrar entrada
        </Link>
        <Link href={`/panel/inventario/merma${q}`} className={buttonClasses({ variant: "secondary" })}>
          Merma
        </Link>
        <Link href={`/panel/inventario/conteo${q}`} className={buttonClasses({ variant: "secondary" })}>
          Conteo
        </Link>
      </div>
      {costo === null ? (
        // Sin el costo no se muestra el formulario: guardar lo pide y se
        // sobrescribiría con lo que alguien escriba sin ver el actual.
        <Notice tone="danger">No se pudo cargar el costo del producto. Recarga la página.</Notice>
      ) : (
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
            costo: costo.toFixed(2),
            precio: Number(producto.precio).toFixed(2),
            stock_minimo: String(Number(producto.stock_minimo)),
            stock_inicial: "0",
            activo: producto.activo,
          }}
          // Activas, más la que ya tiene asignada aunque esté desactivada.
          categorias={categorias.filter((c) => c.activo || c.id === producto.categoria_id)}
          proveedores={proveedores.filter((p) => p.activo || p.id === producto.proveedor_id)}
        />
      )}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Historial</h2>
          <Link
            href={`/panel/inventario${q}`}
            className="text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Ver todo
          </Link>
        </div>
        <MovimientoList movimientos={movimientos} showProducto={false} vacio="Todavía no tiene movimientos." />
      </section>
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
