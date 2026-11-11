"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert, WifiOff } from "lucide-react";
import { Button, buttonClasses } from "@/app/components/ui/button";

/**
 * Pantalla de error de una sección (la usan los error.tsx). Mensaje en
 * español, sin detalles técnicos: el error completo queda en el log del
 * servidor (Next manda al cliente solo un mensaje genérico y su `digest`).
 * Si el navegador está sin conexión, lo dice: es la causa más común.
 */
export function ErrorDeSeccion({
  error,
  retry,
  seccion,
  inicio = { href: "/panel", label: "Ir al inicio" },
}: {
  error: unknown;
  retry: () => void;
  /** "las ventas", "el punto de venta"… Completa "No se pudo cargar …". */
  seccion: string;
  /** A dónde lleva el segundo botón. */
  inicio?: { href: string; label: string };
}) {
  const [sinRed, setSinRed] = useState(false);

  useEffect(() => {
    // Para quien revise la consola del navegador; no se muestra en la pantalla.
    console.error(error);
    const actualizar = () => setSinRed(!navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, [error]);

  const Icon = sinRed ? WifiOff : TriangleAlert;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-border bg-surface px-6 py-10 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-lg font-semibold">No se pudo cargar {seccion}</p>
        <p className="text-base text-muted">
          {sinRed
            ? "No hay conexión a internet. Revisa el Wi-Fi o los datos y vuelve a intentar."
            : "Algo falló de nuestro lado. Vuelve a intentar; si sigue pasando, recarga la página."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()} icon={<RotateCcw aria-hidden className="size-[18px]" />}>
          Reintentar
        </Button>
        <Link href={inicio.href} className={buttonClasses({ variant: "secondary" })}>
          {inicio.label}
        </Link>
      </div>
    </div>
  );
}
