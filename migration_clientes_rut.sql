-- Migración: agrega el campo RUT al cliente, para poder consultar la
-- garantía de sus equipos desde la web principal ingresando el RUT en vez
-- del número de serie.
--
-- Es segura de correr sobre una base ya en uso: solo agrega una columna
-- nueva (queda vacía para los clientes existentes), no toca nada más.
-- Solo corre esto UNA vez.

ALTER TABLE clientes ADD COLUMN rut TEXT;
