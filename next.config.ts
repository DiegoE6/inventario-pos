import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
