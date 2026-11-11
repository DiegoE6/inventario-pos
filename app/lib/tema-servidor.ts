import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { COOKIE_TEMA, parseTema, type Tema } from "@/app/lib/tema";

/** Tema guardado en la cookie del dispositivo (una lectura por petición). */
export const getTema = cache(async (): Promise<Tema> => parseTema((await cookies()).get(COOKIE_TEMA)?.value));
