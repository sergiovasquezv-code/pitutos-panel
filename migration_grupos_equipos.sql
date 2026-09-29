-- Agrupación de equipos: cuando se vende un "sistema" con varios
-- componentes (ej: Mini PC + Monitor + Lector + Impresora) que comparten
-- la misma garantía, se pueden agrupar para que el panel los muestre
-- compactados en vez de una tarjeta completa repetida por cada uno, y para
-- poder generar UN solo link público con los componentes que el negocio
-- elija enviarle al cliente. No reemplaza nada existente: un equipo sin
-- grupo (grupo_id NULL) se sigue viendo exactamente igual que antes.

CREATE TABLE IF NOT EXISTS grupos_equipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grupos_equipos_cliente ON grupos_equipos(cliente_id);

ALTER TABLE equipos ADD COLUMN grupo_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_equipos_grupo ON equipos(grupo_id);

-- Un link público puede mostrar cualquier subconjunto de equipos de un
-- mismo cliente (no necesariamente todo el grupo) — así el negocio elige
-- exactamente qué le manda al cliente cada vez que genera un link.
CREATE TABLE IF NOT EXISTS links_combinados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    equipo_ids TEXT NOT NULL,
    public_token TEXT NOT NULL UNIQUE,
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_combinados_token ON links_combinados(public_token);
