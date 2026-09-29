-- Permite generar un link combinado SIN mostrarle el precio/pago al
-- cliente (ej: una demostración donde el precio todavía no corresponde
-- compartirlo). Por defecto sigue mostrándose (1), igual que hasta ahora.
ALTER TABLE links_combinados ADD COLUMN mostrar_precio INTEGER NOT NULL DEFAULT 1;
