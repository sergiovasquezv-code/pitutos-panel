-- Líneas del trabajo con cantidad. El panel también agrega esta columna
-- sola la primera vez que se usa un trabajo, así que este archivo es el
-- mismo cambio por si quieres aplicarlo a mano:
--
--   npx wrangler d1 execute pitutos-db --remote --file=migration_casos.sql
--
-- El total del trabajo (trabajos.monto) lo recalcula la aplicación como la
-- suma de items_trabajo.valor cada vez que se agrega o se borra una línea.

ALTER TABLE items_trabajo ADD COLUMN cantidad INTEGER NOT NULL DEFAULT 1;
