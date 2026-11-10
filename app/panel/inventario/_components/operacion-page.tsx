import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";
import { getCostoProducto, getProducto } from "@/app/lib/data";
import { movimientosDeProducto } from "@/app/lib/inventario";
import { MovimientoList } from "./movimiento-list";
import { OperacionForm, type Operacion } from "./operacion-form";

const TITULOS: Record<Operacion, { title: string; description: string }> = {
  entrada: { title: "Registrar entrada", description: "Mercancía que llega (compra a proveedor)." },
  merma: { title: "Registrar merma", description: "Lo que se rompió, se perdió o caducó." },
  conteo: { title: "Conteo físico", description: "Captura lo que contaste y ajusta el sistema." },
};

/**
 * Página de una operación de inventario (Server Component). Lee el producto
 * de ?producto=id con requireDueno (el costo para prellenar la entrada se lee
 * aquí, no en la ruta de búsqueda) y sus últimos movimientos.
 */
export async function OperacionPage({
  operacion,
  searchParams,
}: {
  operacion: Operacion;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDueno();
  const sp = await searchParams;
  const id = typeof sp.producto === "string" ? sp.producto : "";
  const producto = id ? await getProducto(id) : null;
  // El costo (para prellenar la entrada) sale de costos_productos, solo dueño.
  const [recientes, costo] = producto
    ? await Promise.all([
        movimientosDeProducto(producto.id, 5),
        operacion === "entrada" ? getCostoProducto(producto.id) : Promise.resolve(null),
      ])
    : [[], null];

  return (
    <>
      <PageHeader {...TITULOS[operacion]} back={{ href: "/panel/inventario", label: "Inventario" }} />
      <OperacionForm
        operacion={operacion}
        producto={
          producto
            ? {
                id: producto.id,
                codigo: producto.codigo,
                nombre: producto.nombre,
                unidad: producto.unidad,
                stock: Number(producto.stock),
                costo,
                activo: producto.activo,
              }
            : null
        }
        recientes={<MovimientoList movimientos={recientes} showProducto={false} vacio="Todavía no tiene movimientos." />}
      />
    </>
  );
}
