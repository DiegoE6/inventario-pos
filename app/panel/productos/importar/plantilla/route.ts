import { requireDueno } from "@/app/lib/auth";
import { getCategorias, getProveedores } from "@/app/lib/data";
import { hoja, hojaResumen, xlsxResponse } from "@/app/lib/excel/escribir";
import { MAX_FILAS } from "@/app/lib/excel/leer";
import { CAMPOS, CODIGO_EJEMPLO, OBLIGATORIOS, TITULOS } from "@/app/lib/importar";

/** Plantilla para importar: encabezados, una fila de ejemplo e instrucciones. Solo dueño. */

const EJEMPLO: Record<(typeof CAMPOS)[number], string | number> = {
  codigo: CODIGO_EJEMPLO,
  nombre: "Flexómetro 5 m (borra esta fila de ejemplo)",
  unidad: "pieza",
  costo: 70,
  precio: 115,
  stock_inicial: 12,
  stock_minimo: 3,
  categoria: "Herramienta",
  proveedor: "Truper",
  descripcion: "Cinta métrica de 5 m con freno",
};

const NUMERICOS = new Set(["costo", "precio", "stock_inicial", "stock_minimo"]);

export async function GET() {
  await requireDueno();
  const [categorias, proveedores] = await Promise.all([getCategorias(), getProveedores()]);

  const productos = hoja<typeof EJEMPLO>(
    "Productos",
    CAMPOS.map((c) => ({
      titulo: TITULOS[c],
      tipo: c === "costo" || c === "precio" ? "dinero" : NUMERICOS.has(c) ? "numero" : "texto",
      ancho: c === "nombre" || c === "descripcion" ? 36 : 15,
      valor: (f) => f[c],
    })),
    [EJEMPLO]
  );

  const instrucciones = hojaResumen(
    "Instrucciones",
    [
      { dato: "Cómo llenar la hoja Productos", valor: null, titulo: true },
      { dato: "Una fila por producto, con los encabezados en la fila 1.", valor: null },
      { dato: `Hasta ${MAX_FILAS} productos y 1 MB por archivo (.xlsx o .csv).`, valor: null },
      { dato: "Si un código ya existe, la fila se omite (o se actualizan precio y costo si lo eliges).", valor: null },
      { dato: `La fila de ejemplo (${CODIGO_EJEMPLO}) se ignora al importar.`, valor: null },
      { dato: "", valor: null },
      { dato: "Columna", valor: "Qué va", titulo: false },
      ...CAMPOS.map((c) => ({
        dato: `${TITULOS[c]}${OBLIGATORIOS.includes(c) ? " (obligatoria)" : ""}`,
        valor: {
          codigo: "Hasta 50 caracteres. No se puede repetir.",
          nombre: "Hasta 150 caracteres.",
          unidad: "pieza, caja, metro, kilo o litro (también pza, m, kg, L).",
          costo: "Lo que te cuesta, en pesos. Hasta 2 decimales.",
          precio: "Precio de venta, en pesos. Hasta 2 decimales.",
          stock_inicial: "Lo que tienes hoy. Entra como entrada de inventario. Pieza y caja sin decimales.",
          stock_minimo: "Debajo de esto se marca como stock bajo.",
          categoria: "Si no existe, se crea. Se compara sin importar mayúsculas ni acentos.",
          proveedor: "Si no existe, se crea. Se compara sin importar mayúsculas ni acentos.",
          descripcion: "Opcional. Hasta 500 caracteres.",
        }[c],
      })),
      { dato: "", valor: null },
      { dato: "Categorías activas", valor: null, titulo: true },
      ...categorias.filter((c) => c.activo).map((c) => ({ dato: c.nombre, valor: null })),
      { dato: "", valor: null },
      { dato: "Proveedores activos", valor: null, titulo: true },
      ...proveedores.filter((p) => p.activo).map((p) => ({ dato: p.nombre, valor: null })),
    ],
    [34, 80]
  );

  return xlsxResponse([productos, instrucciones], "plantilla-productos.xlsx");
}
