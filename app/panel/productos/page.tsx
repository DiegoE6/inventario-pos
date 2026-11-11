import type { Metadata } from "next";
import Link from "next/link";
import { Download, PackageSearch, Plus, Upload } from "lucide-react";
import { EstadoVacio } from "@/app/components/estado";
import { PageHeader } from "@/app/components/page-header";
import { ProductCard } from "@/app/components/product-card";
import { buttonClasses } from "@/app/components/ui/button";
import { StockBadge } from "@/app/components/ui/stock-badge";
import { verifySession } from "@/app/lib/auth";
import { getCategorias, listProductos, PAGE_SIZE, parseProductosQuery } from "@/app/lib/data";
import { formatMoney, formatQuantity } from "@/app/lib/format";
import { Pagination } from "./_components/pagination";
import { ProductFilters } from "./_components/product-filters";

export const metadata: Metadata = { title: "Productos" };

export default async function ProductosPage({ searchParams }: PageProps<"/panel/productos">) {
  const [session, sp] = await Promise.all([verifySession(), searchParams]);
  const esDueno = session.rol === "dueno";
  const parsed = parseProductosQuery(sp);
  // Solo el dueño puede pedir los inactivos.
  const query = { ...parsed, inactivos: esDueno && parsed.inactivos };

  const [{ productos, total, paginas }, categorias] = await Promise.all([
    listProductos(query),
    getCategorias(),
  ]);

  const filtrando = Boolean(query.q || query.categoria !== null);
  const desde = (query.pagina - 1) * PAGE_SIZE + 1;
  const hasta = desde + productos.length - 1;

  // Exportar con la misma búsqueda y filtros de la lista.
  const exportParams = new URLSearchParams();
  if (query.q) exportParams.set("q", query.q);
  if (query.categoria !== null) exportParams.set("categoria", String(query.categoria));
  if (query.inactivos) exportParams.set("inactivos", "1");
  const exportHref = `/panel/productos/exportar${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <>
      <PageHeader
        title="Productos"
        actions={
          esDueno ? (
            <>
              <a
                href={exportHref}
                download
                className={buttonClasses({ variant: "secondary", className: "px-3" })}
                aria-label="Exportar a Excel"
                title="Exportar a Excel"
              >
                <Download aria-hidden className="size-[18px]" />
                <span className="hidden sm:inline">Exportar</span>
              </a>
              <Link
                href="/panel/productos/importar"
                className={buttonClasses({ variant: "secondary", className: "px-3" })}
                aria-label="Importar desde Excel"
                title="Importar desde Excel"
              >
                <Upload aria-hidden className="size-[18px]" />
                <span className="hidden sm:inline">Importar</span>
              </Link>
              <Link href="/panel/productos/nuevo" className={buttonClasses()}>
                <Plus aria-hidden className="size-[18px]" />
                Nuevo
              </Link>
            </>
          ) : undefined
        }
      />

      <ProductFilters
        current={{
          q: query.q,
          categoria: query.categoria === null ? "" : String(query.categoria),
          inactivos: query.inactivos,
        }}
        categorias={categorias.filter((c) => c.activo || c.id === query.categoria)}
        showInactivosToggle={esDueno}
      />

      {productos.length === 0 ? (
        total > 0 ? (
          <EstadoVacio
            icon={PackageSearch}
            titulo="No hay productos en esta página"
            acciones={
              <Link href="/panel/productos" className={buttonClasses({ variant: "secondary" })}>
                Ir a la primera página
              </Link>
            }
          />
        ) : filtrando ? (
          <EstadoVacio
            icon={PackageSearch}
            titulo={query.q ? `Ningún producto coincide con «${query.q}»` : "No hay productos en esta categoría"}
            acciones={
              <>
                <Link href="/panel/productos" className={buttonClasses({ variant: "secondary" })}>
                  Quitar filtros
                </Link>
                {esDueno ? (
                  <Link href="/panel/productos/nuevo" className={buttonClasses()}>
                    <Plus aria-hidden className="size-[18px]" />
                    Nuevo producto
                  </Link>
                ) : null}
              </>
            }
          >
            Revisa cómo está escrito o busca por código.
          </EstadoVacio>
        ) : (
          <EstadoVacio
            icon={PackageSearch}
            titulo="Todavía no tienes productos"
            acciones={
              esDueno ? (
                <>
                  <Link href="/panel/productos/nuevo" className={buttonClasses()}>
                    <Plus aria-hidden className="size-[18px]" />
                    Agregar el primero
                  </Link>
                  <Link href="/panel/productos/importar" className={buttonClasses({ variant: "secondary" })}>
                    <Upload aria-hidden className="size-[18px]" />
                    Importar desde Excel
                  </Link>
                </>
              ) : null
            }
          >
            {esDueno ? "Agrégalos uno por uno o carga tu lista completa desde Excel." : "El dueño todavía no ha dado de alta productos."}
          </EstadoVacio>
        )
      ) : (
        <>
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {total === productos.length
              ? `${total} ${total === 1 ? "producto" : "productos"}`
              : `${desde}–${hasta} de ${total} productos`}
          </p>

          {/* Celular: tarjetas */}
          <ul className="flex flex-col gap-3 md:hidden">
            {productos.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} href={`/panel/productos/${p.id}`} />
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla */}
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-border bg-surface-muted text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Producto</th>
                  <th scope="col" className="px-4 py-3 font-medium">Categoría</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Precio</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Stock</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Estado</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {productos.map((p) => (
                  <tr key={p.id} className={`relative transition-colors duration-150 hover:bg-surface-muted ${p.activo ? "" : "opacity-60"}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/panel/productos/${p.id}`}
                        // Enlace estirado: toda la fila abre el producto (un solo enlace para el teclado).
                        className="font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-primary-ink"
                      >
                        {p.nombre}
                      </Link>
                      <p className="font-mono text-[13px] text-muted">
                        {p.codigo}
                        {p.activo ? null : <span className="font-sans"> · Inactivo</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.categoria ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(p.precio)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(p.stock, p.unidad)}</td>
                    <td className="px-4 py-3">
                      <StockBadge stock={p.stock} minimo={p.stock_minimo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination query={query} paginas={paginas} />
    </>
  );
}
