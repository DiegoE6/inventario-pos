import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brandStyle, paletaMarca } from "@/app/lib/brand";
import { getConfiguracion } from "@/app/lib/data";
import { getTema } from "@/app/lib/tema-servidor";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * La marca (nombre y color) sale de configuracion_negocio en CADA petición:
 * getConfiguracion usa cache() de React, que dura solo esa petición, y el
 * cliente de Supabase lee cookies, así que Next no guarda esta página entre
 * peticiones. Un cambio en Configuración se ve en la siguiente navegación.
 */

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfiguracion();
  return {
    title: { template: `%s · ${config.nombre}`, default: config.nombre },
    description: "Inventario y punto de venta",
  };
}

export async function generateViewport(): Promise<Viewport> {
  const [config, tema] = await Promise.all([getConfiguracion(), getTema()]);
  const p = paletaMarca(config.color_primario);
  return {
    // Color de la barra del navegador: el de marca, en su versión para el tema.
    themeColor:
      tema === "claro"
        ? p.primary
        : tema === "oscuro"
          ? p.primaryDark
          : [
              { media: "(prefers-color-scheme: light)", color: p.primary },
              { media: "(prefers-color-scheme: dark)", color: p.primaryDark },
            ],
    // Permite usar env(safe-area-inset-*) para la barra inferior en iPhone.
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [config, tema] = await Promise.all([getConfiguracion(), getTema()]);

  return (
    // La marca va en <html> desde el HTML del servidor: sin parpadeo del color
    // por defecto. brandStyle valida el #RRGGBB antes de ponerlo en `style`.
    <html
      lang="es"
      data-brand
      // Sin elección ("sistema") no hay atributo: decide prefers-color-scheme.
      data-theme={tema === "sistema" ? undefined : tema}
      style={brandStyle(config.color_primario)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
