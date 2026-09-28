-- Migración: agrega el link público de garantía para el cliente.
-- No borra ni toca ningún dato existente.

ALTER TABLE equipos ADD COLUMN public_token TEXT;
