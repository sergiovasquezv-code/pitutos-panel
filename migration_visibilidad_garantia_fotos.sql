ALTER TABLE equipos ADD COLUMN visible_cliente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipos ADD COLUMN visible_desde TEXT;
ALTER TABLE fotos_equipo ADD COLUMN visible_cliente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fotos_equipo ADD COLUMN visible_desde TEXT;
ALTER TABLE trabajos ADD COLUMN detalle_visible_desde TEXT;
UPDATE trabajos SET detalle_visible_desde = fecha_creacion WHERE mostrar_detalle_cliente = 1;
