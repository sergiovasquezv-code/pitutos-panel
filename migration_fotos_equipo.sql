-- Migración: agrega fotos del estado del equipo, visibles para el cliente
-- en su link público de garantía (junto con el estado de pago).
--
-- Es segura de correr sobre una base ya en uso: solo agrega la tabla e
-- índice nuevos, no toca nada existente. Solo corre esto UNA vez.

CREATE TABLE IF NOT EXISTS fotos_equipo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipo_id INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    descripcion TEXT,
    creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fotos_equipo_equipo ON fotos_equipo(equipo_id);
