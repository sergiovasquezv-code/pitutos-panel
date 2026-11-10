
        CREATE TRIGGER IF NOT EXISTS trg_precio_cambiado AFTER UPDATE OF precio_venta ON productos
        WHEN old.precio_venta <> new.precio_venta
        BEGIN UPDATE productos SET precio_cambiado_en = strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime') WHERE id = new.id; END;
        CREATE TRIGGER IF NOT EXISTS trg_precio_nuevo AFTER INSERT ON productos
        BEGIN UPDATE productos SET precio_cambiado_en = strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime') WHERE id = new.id; END;
        CREATE INDEX IF NOT EXISTS idx_productos_plu ON productos(plu);
        