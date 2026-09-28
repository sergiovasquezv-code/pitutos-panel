-- Migración para agregar la función de seguimiento del cliente
-- (link público por trabajo, notas, fotos y enlaces) a una base de datos
-- que ya estaba desplegada con el esquema anterior.
--
-- Es seguro correrla aunque ya la hayas corrido antes (usa IF NOT EXISTS
-- donde se puede); la única línea que fallaría en una segunda pasada es el
-- ALTER TABLE ADD COLUMN si la columna ya existe, así que solo corre esta
-- migración UNA vez.

ALTER TABLE trabajos ADD COLUMN public_token TEXT;

CREATE TABLE IF NOT EXISTS avances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    texto TEXT,
    valor TEXT,
    creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_avances_trabajo ON avances(trabajo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajos_public_token ON trabajos(public_token);
