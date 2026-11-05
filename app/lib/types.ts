import type { Unidad } from "@/app/lib/format";

export type { Unidad };

export type Rol = "dueno" | "cajero";

export const UNIDADES: { value: Unidad; label: string }[] = [
  { value: "pieza", label: "Pieza" },
  { value: "caja", label: "Caja" },
  { value: "metro", label: "Metro" },
  { value: "kilo", label: "Kilo" },
  { value: "litro", label: "Litro" },
];

/** Unidades que no aceptan decimales (igual que privado.validar_cantidad). */
export const UNIDADES_ENTERAS: Unidad[] = ["pieza", "caja"];

export type Session = {
  userId: string;
  email: string | null;
  nombre: string;
  rol: Rol;
};

export type Configuracion = {
  nombre: string;
  giro: string | null;
  logo_url: string | null;
  color_primario: string;
};

export type Categoria = { id: number; nombre: string; activo: boolean };

export type Proveedor = {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  notas: string | null;
  activo: boolean;
};

export type Producto = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: number | null;
  proveedor_id: number | null;
  unidad: Unidad;
  costo: number;
  precio: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
};

/** Estado que regresan las Server Actions de formularios. */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
  /** Cambia en cada éxito: sirve de key para limpiar o cerrar formularios. */
  okKey?: number;
};
