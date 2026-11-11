import type { Metadata } from "next";
import { verifySession } from "@/app/lib/auth";
import type { PosProduct } from "@/app/lib/cart";
import { createClient } from "@/app/lib/supabase/server";
import { PosLoader } from "./_components/pos-loader";

export const metadata: Metadata = { title: "Vender" };

export default async function VenderPage() {
  const session = await verifySession();
  const supabase = await createClient();

  // Más vendidos de toda la tienda (sin montos ni costos), para el buscador vacío.
  const { data, error } = await supabase.rpc("productos_frecuentes", { p_limite: 8 });
  if (error) console.error("[vender/frecuentes]", error);
  const frecuentes = ((data ?? []) as Omit<PosProduct, "activo">[]).map((p) => ({
    ...p,
    precio: Number(p.precio),
    stock: Number(p.stock),
    activo: true,
  }));

  return (
    <>
      <h1 className="sr-only">Vender</h1>
      <PosLoader userId={session.userId} esDueno={session.rol === "dueno"} frecuentes={frecuentes} />
    </>
  );
}
