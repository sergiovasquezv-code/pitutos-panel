CREATE TABLE IF NOT EXISTS envios_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_envios_trabajo ON envios_cliente(trabajo_id);
