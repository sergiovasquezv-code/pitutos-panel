-- Qué tipo de aviso se mandó al cliente (recibido, avance, listo, cobro, pago, libre).
ALTER TABLE envios_cliente ADD COLUMN tipo_aviso TEXT;
