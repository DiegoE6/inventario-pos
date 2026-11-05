import { redirect } from "next/navigation";

// No hay portada pública: el proxy manda a /login si no hay sesión.
export default function Home() {
  redirect("/panel");
}
