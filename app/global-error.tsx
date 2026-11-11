"use client";

import { useEffect } from "react";

/**
 * Último recurso: falló el layout raíz (por ejemplo, la configuración del
 * negocio). Reemplaza todo el documento y NO recibe los estilos globales,
 * así que lleva estilos en línea, neutros, que siguen el modo del sistema.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          colorScheme: "light dark",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <title>Algo falló</title>
        <main role="alert" style={{ maxWidth: 380, textAlign: "center", display: "grid", gap: 12 }}>
          <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>No se pudo cargar el sistema</p>
          <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
            Revisa tu conexión a internet y vuelve a intentar. Si sigue pasando, recarga la página.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ height: 44, padding: "0 16px", borderRadius: 10, border: 0, font: "inherit", fontWeight: 500, background: "#1c1917", color: "#fff", cursor: "pointer" }}
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ height: 44, padding: "0 16px", borderRadius: 10, border: "1px solid #a8a29e", font: "inherit", fontWeight: 500, background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              Recargar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
