-- Tercera migración de seguimiento: permite que el CLIENTE marque una
-- nota/enlace/foto como "revisado" desde su link público.
--
-- Solo corre esto UNA vez, y solo después de haber corrido ya
-- migration_seguimiento.sql y migration_avances_editable.sql.

ALTER TABLE avances ADD COLUMN revisado_en TEXT;
