"use client";

import { useEffect, useRef, useState } from "react";
import type { PosProduct } from "@/app/lib/cart";
import { buscarPorCodigo, buscarProductos, irAlLogin, SinSesionError } from "./fetch";

/**
 * Búsqueda de productos compartida (punto de venta e inventario):
 * - busca 150 ms después de dejar de escribir;
 * - cada búsqueda lleva un número y las respuestas viejas se descartan;
 * - Enter (lo que manda un lector de barras al final) busca el código exacto:
 *   si existe llama a onExact y limpia; si no, avisa y muestra parecidos;
 * - 401 → al login.
 * Lee de GET /panel/vender/productos (sesión del usuario, sin costos).
 */
export function useProductSearch({ onExact }: { onExact: (p: PosProduct) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const reqId = useRef(0);

  function fallo(e: unknown) {
    if (e instanceof SinSesionError) irAlLogin();
    else if (!(e instanceof DOMException && e.name === "AbortError")) {
      setAviso("No se pudo buscar. Revisa tu conexión.");
    }
  }

  // Búsqueda con retardo (150 ms).
  useEffect(() => {
    const texto = q.trim();
    if (!texto) return;
    const id = ++reqId.current;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const productos = await buscarProductos(texto, ctrl.signal);
        if (id === reqId.current) setResults(productos);
      } catch (e) {
        if (id === reqId.current) fallo(e);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function limpiar() {
    reqId.current++; // descarta búsquedas en curso
    setQ("");
    setResults(null);
    setLoading(false);
  }

  function onChange(value: string) {
    setQ(value);
    setAviso(null);
    if (!value.trim()) {
      reqId.current++;
      setResults(null);
      setLoading(false);
    }
  }

  async function onEnter() {
    const codigo = q.trim();
    if (!codigo) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const producto = await buscarPorCodigo(codigo);
      if (id !== reqId.current) return;
      if (producto) {
        onExact(producto);
        setAviso(null);
        limpiar();
        return;
      }
      setAviso(`No hay un producto activo con el código "${codigo}".`);
      setResults(await buscarProductos(codigo));
    } catch (e) {
      fallo(e);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  return { q, results, loading, aviso, onChange, onEnter, limpiar };
}
