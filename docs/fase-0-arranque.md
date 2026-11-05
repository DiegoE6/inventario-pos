# Fase 0 — Arranque

## Qué se hizo
- Proyecto creado con `create-next-app@16.3.6` y actualizado después a **Next.js 16.4.5** (con `eslint-config-next@16.4.5`), por seguridad (ver Decisiones). App Router + TypeScript + Tailwind v4 + ESLint. Carpeta `app/` en la raíz, sin `src/`, alias `@/*`.
- Dependencias: `@supabase/supabase-js`, `@supabase/ssr` y `server-only`.
- Clientes de Supabase:
  - `app/lib/supabase/client.ts` → `createClient()` para Client Components (`createBrowserClient`).
  - `app/lib/supabase/server.ts` → `createClient()` asíncrono para Server Components, Server Actions y Route Handlers (`createServerClient` + `await cookies()`). Marcado con `server-only`.
- `app/lib/env.ts`: lee `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y lanza un error claro si falta alguna.
- `.env.example` con los nombres de las variables, sin valores. `.env.local` creado con los valores del proyecto de Supabase. `.gitignore` ignora `.env*` excepto `.env.example`.
- Página temporal en `/` con el nombre "Ferretería La Tuerca". `lang="es"`.
- Colores de marca en `@theme` (`app/globals.css`): `--color-primary` (naranja `#ea580c`) y colores base. No hay `tailwind.config.ts`.
- Se quitaron los SVG de ejemplo de `public/`.
- `CLAUDE.md`: se agregó al final la sección **Referencias**, que apunta a `@AGENTS.md`. Si hay contradicciones, manda `CLAUDE.md`.
- Skills de Supabase para agentes (`supabase/agent-skills`) instaladas a nivel de proyecto, solo para Claude Code:
  - `.claude/skills/supabase/`: uso de Supabase (Auth, SSR, RLS, CLI, MCP) y checklist de seguridad.
  - `.claude/skills/supabase-postgres-best-practices/`: diseño de esquema, índices, RLS, bloqueos y rendimiento.
  - `skills-lock.json`: origen y hash de cada skill, para reinstalarlas igual.

## Verificación
- `npm run lint`, `npx tsc --noEmit` y `npm run build`: sin errores. El build detecta `.env.local`.
- `npm run dev`: `/` responde 200 con "Ferretería La Tuerca" y el log no muestra errores.
- Variables: la página temporal todavía no importa Supabase, así que se comprobaron aparte. Se cargaron con `@next/env` (igual que Next) y la publishable key fue aceptada por Supabase: Auth `GET /auth/v1/settings` → 200; PostgREST respondió 404 por una tabla inexistente, no 401 por llave inválida.
- `.env.local` está ignorado por git (`.gitignore:34`) y no aparece en `git status`.
- `npm audit`: 0 críticas, 0 altas, 8 moderadas. Las 8 vienen de un solo problema: `minimatch` 10.x (DoS por patrones glob), que llega por `eslint-config-next` → `typescript-eslint`. Es una dependencia de desarrollo que solo corre en `npm run lint` con patrones nuestros; no llega al build ni a producción. La única "solución" que ofrece npm es bajar `eslint-config-next` a la versión 15 (`npm audit fix --force`), que no aplica a Next 16. Se queda así hasta que `typescript-eslint` actualice `minimatch`.

## Decisiones
- **Next 16.4.5.** `npm audit` marcaba una vulnerabilidad crítica en `next` 16.0.0–16.4.0 (cache poisoning en SSG/ISR, fuga de Draft Mode, entre otras). `next` y `eslint-config-next` quedaron fijadas en versión exacta (sin `^`), igual que como las dejó el generador.
- **Variables leídas de forma literal.** Next.js solo incluye en el bundle del navegador `process.env.NEXT_PUBLIC_...` escrito literal; con un acceso dinámico (`process.env[name]`) el valor llega como `undefined` al cliente. Por eso `env.ts` lee cada variable explícitamente y valida después.
- **Publishable key en lugar de anon key.** Es el formato actual de Supabase (`sb_publishable_...`). Es pública por diseño; lo que protege los datos es RLS.
- **No se usó el ejemplo `utils/supabase/` + `middleware.ts` de Supabase.** Los clientes ya están en `app/lib/supabase/`. En Next 16, `middleware.ts` se reemplazó por `proxy.ts`, y la renovación de la sesión con `proxy.ts` y `verifySession()` llega con el login, en la Fase 2. Mientras tanto, el `setAll` del cliente de servidor ignora el error cuando lo llama un Server Component.
- **`AGENTS.md` se conserva y se versiona.** `next dev` reescribe su bloque de reglas en cada versión de Next. Al pasar a 16.4.5 cambió un encabezado. Como `AGENTS.md` existe, `next dev` no toca `CLAUDE.md`.
- **Skills de Supabase versionadas.** `.claude/skills/` y `skills-lock.json` se suben al repo: son solo Markdown (unos 200 KB, sin scripts) y así cualquier clon del proyecto tiene las mismas guías. Se instalaron con `--copy` y no con symlinks, porque en Windows los symlinks fallan o git los guarda como archivos de texto. Para actualizarlas: `npx skills update -p`.
- **Git:** el commit inicial del generador quedó en `main` (la rama `master` del generador se renombró a `main`). El resto del trabajo está en la rama `fase-0-arranque`.

## Pendientes

### 1. Subir el repo a GitHub
1. En GitHub: **New repository** → nombre `inventario-pos` → **sin** README, `.gitignore` ni licencia (el repo local ya los tiene).
2. Conectar y subir las dos ramas:
   ```bash
   git remote add origin https://github.com/<tu-usuario>/inventario-pos.git
   git push -u origin main
   git push -u origin fase-0-arranque
   ```
   (`fase-0-arranque` se sube después de hacer su commit.)
3. En GitHub, abrir un PR de `fase-0-arranque` a `main` y hacer merge cuando esté revisado.

### 2. Conectar a Vercel
1. En vercel.com: **Add New… → Project** → **Import** el repo `inventario-pos`. Si no aparece, autorizar el acceso de Vercel a ese repo en la integración de GitHub.
2. Framework Preset: **Next.js** (lo detecta solo). Root Directory, build command y output se dejan por defecto.
3. En **Environment Variables**, agregar con los mismos valores de `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Marcarlas para **Production** y **Preview**.
4. **Deploy.** La Fase 0 se da por terminada cuando la página "Ferretería La Tuerca" se ve en el link de Vercel.
5. Importante: las variables `NEXT_PUBLIC_` se incluyen en el código al hacer el build. Si después se cambia una en Vercel, hay que hacer **Redeploy** para que tome el valor nuevo.
6. A partir de aquí, cada push a `main` despliega a producción y cada PR genera un preview.

### Para fases siguientes
- **Fase 1:** el plan define las funciones con `SECURITY DEFINER`. La skill de Supabase advierte que en el esquema `public` cualquier rol puede ejecutarlas, incluido `anon`, porque Postgres da `EXECUTE` a `PUBLIC` por defecto. Hay que hacer `REVOKE EXECUTE ... FROM public, anon` y validar `auth.uid()` y el rol dentro de cada función. Las vistas necesitan `WITH (security_invoker = true)` para respetar RLS.
- **Fase 2:** en Supabase → Authentication → URL Configuration, poner la URL de Vercel como Site URL y agregar `http://localhost:3000` en Redirect URLs.
- **Opcional:** la skill de Supabase recomienda fijar las versiones exactas de `@supabase/supabase-js` y `@supabase/ssr`, que hoy usan `^`. El `package-lock.json` ya las fija para `npm ci`.
