-- Ejecuta esto una sola vez en tu base de datos ya desplegada (igual que
-- hiciste con migration_clientes_rut.sql), desde la carpeta pitutos-cf:
--
--   npx wrangler d1 execute pitutos-db --remote --file=migration_items_trabajo.sql
--
-- Agrega la tabla de desglose de trabajos (repuestos/servicios con su
-- valor, ej: "Disco duro" $20.000 + "Formateo e instalación" $15.000).

CREATE TABLE IF NOT EXISTS items_trabajo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    valor INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_trabajo_trabajo ON items_trabajo(trabajo_id);
