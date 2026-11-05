import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo aplica en desarrollo: deja abrir el servidor local desde un celular
  // en la misma red (Wi-Fi). Next 16 bloquea por defecto otros orígenes.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
