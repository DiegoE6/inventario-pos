import {
  ChartColumn,
  Ellipsis,
  House,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Rol } from "@/app/lib/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Si es true, solo lo ve el dueño (la página también lo valida en servidor). */
  soloDueno?: boolean;
};

/** Secciones principales: barra inferior en celular y lateral en escritorio. */
export const MAIN_NAV: NavItem[] = [
  { href: "/panel", label: "Inicio", icon: House },
  { href: "/panel/vender", label: "Vender", icon: ShoppingCart },
  { href: "/panel/productos", label: "Productos", icon: Package },
  { href: "/panel/inventario", label: "Inventario", icon: Warehouse },
  { href: "/panel/mas", label: "Más", icon: Ellipsis },
];

/** Lo que vive en "Más" (celular) y en la parte baja de la barra lateral. */
export const MORE_NAV: NavItem[] = [
  { href: "/panel/ventas", label: "Ventas", icon: Receipt },
  { href: "/panel/reportes", label: "Reportes", icon: ChartColumn, soloDueno: true },
  { href: "/panel/configuracion/categorias", label: "Categorías", icon: Tags, soloDueno: true },
  { href: "/panel/configuracion/proveedores", label: "Proveedores", icon: Truck, soloDueno: true },
  { href: "/panel/configuracion", label: "Configuración", icon: Settings, soloDueno: true },
];

export function navFor(items: NavItem[], rol: Rol): NavItem[] {
  return items.filter((item) => !item.soloDueno || rol === "dueno");
}

/**
 * Sección activa. Inicio y Configuración, por coincidencia exacta (sus
 * subrutas tienen su propia entrada); el resto, por prefijo.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/panel" || href === "/panel/configuracion") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** En celular, "Más" queda activo cuando estás en cualquiera de sus secciones. */
export function isMoreActive(pathname: string): boolean {
  return pathname === "/panel/mas" || MORE_NAV.some((i) => isActive(i.href, pathname) || pathname.startsWith(`${i.href}/`));
}
