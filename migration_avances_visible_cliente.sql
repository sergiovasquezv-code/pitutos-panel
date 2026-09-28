ALTER TABLE avances ADD COLUMN visible_cliente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE avances ADD COLUMN visible_desde TEXT;
-- Los hitos de cambio de estado ya existentes se dejan visibles (siempre lo
-- fueron), para no "esconder" de golpe el historial de estado que el
-- cliente ya podía ver antes de este cambio.
UPDATE avances SET visible_cliente = 1, visible_desde = creado_en WHERE tipo = 'estado';
