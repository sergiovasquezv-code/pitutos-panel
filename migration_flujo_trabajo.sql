-- Flujo natural de un trabajo: Recibido -> En preparación -> Equipo listo ->
-- Entrega fijada -> Entregado. Agrega la fecha de entrega y convierte los
-- estados antiguos (Pendiente/En curso/Terminado) a los nuevos.
ALTER TABLE trabajos ADD COLUMN fecha_entrega TEXT;

UPDATE trabajos SET estado = 'Recibido' WHERE estado = 'Pendiente';
UPDATE trabajos SET estado = 'En preparación' WHERE estado = 'En curso';
UPDATE trabajos SET estado = 'Entregado' WHERE estado = 'Terminado';

UPDATE avances SET texto = 'Estado actualizado a "Recibido"', valor = 'Recibido' WHERE tipo = 'estado' AND valor = 'Pendiente';
UPDATE avances SET texto = 'Estado actualizado a "En preparación"', valor = 'En preparación' WHERE tipo = 'estado' AND valor = 'En curso';
UPDATE avances SET texto = 'Estado actualizado a "Entregado"', valor = 'Entregado' WHERE tipo = 'estado' AND valor = 'Terminado';
