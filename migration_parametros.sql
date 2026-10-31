-- Opciones de los pasos del caso. La aplicación también crea estas tablas
-- sola la primera vez que abres un trabajo o Parámetros.
--
--   npx wrangler d1 execute pitutos-db --remote --file=migration_parametros.sql

CREATE TABLE IF NOT EXISTS parametros_paso (
    clave TEXT PRIMARY KEY,
    orden INTEGER NOT NULL,
    nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parametros_opcion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paso TEXT NOT NULL,
    orden INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    frase TEXT,
    grupo TEXT,
    activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS trabajo_eleccion (
    trabajo_id INTEGER NOT NULL,
    opcion_id INTEGER NOT NULL,
    PRIMARY KEY (trabajo_id, opcion_id)
);
