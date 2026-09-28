-- Ejecuta esto una sola vez en tu base de datos ya desplegada, desde la
-- carpeta pitutos-cf:
--
--   npx wrangler d1 execute pitutos-db --remote --file=migration_trabajos_mostrar_detalle.sql
--
-- Agrega un interruptor por trabajo para mostrar u ocultar el "Detalle y
-- pago" en la página de seguimiento del cliente. Queda en 0 (oculto) por
-- defecto para todos los trabajos existentes y los nuevos — tú decides
-- cuándo activarlo desde la ficha del trabajo.

ALTER TABLE trabajos ADD COLUMN mostrar_detalle_cliente INTEGER NOT NULL DEFAULT 0;
