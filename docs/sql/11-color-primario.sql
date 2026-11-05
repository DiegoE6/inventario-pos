-- =============================================================================
-- 11-color-primario.sql — Nuevo naranja de marca por defecto
-- Fase 2 · Requiere: 01
--
-- #ea580c con texto blanco tiene contraste 3.6:1 (no pasa AA para texto
-- normal). #c2410c tiene 5.2:1.
--
-- Solo cambia el default de la columna y la fila del negocio SI todavía tiene
-- el naranja anterior (no pisa un color que alguien ya personalizó).
-- No toca ningún otro dato. Idempotente.
-- =============================================================================

alter table public.configuracion_negocio
  alter column color_primario set default '#c2410c';

update public.configuracion_negocio
set color_primario = '#c2410c'
where id = 1
  and lower(color_primario) = '#ea580c';

select id, nombre, color_primario from public.configuracion_negocio;
