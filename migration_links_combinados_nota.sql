-- Mensaje opcional que el negocio escribe al generar un link combinado
-- (ej: "Se completó el ensamblaje y configuración del sistema POS"), para
-- que el cliente vea de entrada qué incluye/qué se hizo, en vez de tener
-- que inferirlo de la lista de componentes.
ALTER TABLE links_combinados ADD COLUMN nota TEXT;
