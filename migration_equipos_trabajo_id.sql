-- Ejecuta esto una sola vez en tu base de datos ya desplegada, desde la
-- carpeta pitutos-cf:
--
--   npx wrangler d1 execute pitutos-db --remote --file=migration_equipos_trabajo_id.sql
--
-- Agrega la columna trabajo_id a equipos, para poder saber de qué trabajo
-- salió un equipo/producto en garantía (ej: el disco duro cambiado en una
-- reparación) y así mostrar esa garantía en la página de seguimiento del
-- cliente, junto con el detalle y el pago.

ALTER TABLE equipos ADD COLUMN trabajo_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_equipos_trabajo ON equipos(trabajo_id);
