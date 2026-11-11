import type { NextConfig } from "next";

/**
 * Encabezados de seguridad fijos, en todas las rutas (también archivos
 * estáticos y /api). La CSP no va aquí: lleva un nonce por petición y la pone
 * proxy.ts.
 */
const SECURITY_HEADERS = [
  // Nadie puede meter la app en un iframe (respaldo de frame-ancestors 'none').
  { key: "X-Frame-Options", value: "DENY" },
  // A otros sitios solo se manda el origen, nunca la ruta ni los filtros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Cámara solo para esta app (un lector por cámara en el futuro); lo demás, apagado.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Sin "X-Powered-By: Next.js": no hace falta anunciar el framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Solo aplica en desarrollo: deja abrir el servidor local desde un celular
  // en la misma red (Wi-Fi). Next 16 bloquea por defecto otros orígenes.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  experimental: {
    serverActions: {
      // Importar productos: el archivo se limita a 1 MB (app/lib/excel/leer.ts).
      // Logo: 3 MB (app/lib/logo.ts). El resto es margen para el formulario,
      // y queda debajo del límite de 4.5 MB de Vercel para el cuerpo.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
