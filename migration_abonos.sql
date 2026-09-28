-- Migración: agrega el control de abonos (pagos parciales o completos) a
-- trabajos, equipos y mensualidades, con un link público de comprobante
-- para cada abono que registres.
--
-- Es segura de correr sobre una base ya en uso: solo agrega la tabla nueva
-- y trae tu historial de pagos de mensualidades ya registrados a ella (no
-- borra ni toca `pagos_mensualidad`, por si acaso). Solo corre esto UNA vez.

CREATE TABLE IF NOT EXISTS abonos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,       -- 'trabajo' | 'equipo' | 'mensualidad'
    referencia_id INTEGER NOT NULL, -- id en trabajos/equipos/mensualidades
    periodo TEXT,                   -- solo mensualidad: 'YYYY-MM'
    monto INTEGER NOT NULL,
    fecha_pago TEXT NOT NULL,
    nota TEXT,
    public_token TEXT,
    creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_abonos_cat_ref ON abonos(categoria, referencia_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_abonos_public_token ON abonos(public_token);

-- Trae tu historial de pagos de mensualidades ya cobrados a la tabla
-- nueva, para que el control de abonos y el resumen de Finanzas incluyan
-- también lo que ya habías cobrado antes de esta actualización.
INSERT INTO abonos (categoria, referencia_id, periodo, monto, fecha_pago, nota, creado_en)
SELECT 'mensualidad', mensualidad_id, periodo, monto_pagado, fecha_pago,
       'Pago migrado (mes completo)', fecha_pago || 'T00:00:00.000Z'
FROM pagos_mensualidad;
