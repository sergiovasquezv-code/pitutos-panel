-- Segunda migración de seguimiento: agrega edición de notas/enlaces y el
-- historial automático de cambios de estado.
--
-- Solo corre esto UNA vez, y solo después de haber corrido ya
-- migration_seguimiento.sql (la que crea la tabla avances).

ALTER TABLE avances ADD COLUMN editado_en TEXT;
