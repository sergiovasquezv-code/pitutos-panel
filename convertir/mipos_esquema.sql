
CREATE TABLE IF NOT EXISTS actualizacion_actividad (
  equipo TEXT PRIMARY KEY,
  ventas INTEGER NOT NULL,
  pendientes INTEGER NOT NULL,
  sincronizando INTEGER NOT NULL,
  ultimo REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','cajero')),
  activo INTEGER NOT NULL DEFAULT 1,
  debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  precio_costo INTEGER NOT NULL DEFAULT 0,
  precio_venta INTEGER NOT NULL,
  stock REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 0,
  granel INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL UNIQUE REFERENCES productos(id),
  descuento_tipo TEXT NOT NULL CHECK (descuento_tipo IN ('monto','porcentaje')),
  descuento_valor REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS combo_componentes (
  combo_id INTEGER NOT NULL REFERENCES combos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (combo_id, producto_id)
);
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id INTEGER PRIMARY KEY,
  abierta_por INTEGER NOT NULL REFERENCES usuarios(id),
  cerrada_por INTEGER REFERENCES usuarios(id),
  abierta_en TEXT NOT NULL,
  cerrada_en TEXT,
  monto_inicial INTEGER NOT NULL,
  efectivo_esperado INTEGER,
  monto_contado INTEGER,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  equipo_id TEXT
);
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY,
  sesion_id INTEGER NOT NULL REFERENCES caja_sesiones(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','retiro')),
  monto INTEGER NOT NULL,
  motivo TEXT,
  fecha TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY,
  folio INTEGER NOT NULL UNIQUE,
  sesion_id INTEGER NOT NULL REFERENCES caja_sesiones(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  descuento INTEGER NOT NULL DEFAULT 0,
  redondeo INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  vuelto INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'completada'
);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_sesion ON ventas(sesion_id);
CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER REFERENCES productos(id),
  codigo TEXT,
  nombre TEXT NOT NULL,
  cantidad REAL NOT NULL,
  granel INTEGER NOT NULL DEFAULT 0,
  precio_unitario INTEGER NOT NULL,
  precio_costo INTEGER NOT NULL DEFAULT 0,
  descuento INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  combo_componentes TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS venta_pagos (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  metodo TEXT NOT NULL,
  monto INTEGER NOT NULL,
  recibido INTEGER NOT NULL
);
-- ======================= Fase 2
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  fecha TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  tipo TEXT NOT NULL,              -- inicial, venta, anulacion, devolucion, entrada, entrada_anulada, ajuste, inventario, edicion, importacion
  cantidad REAL NOT NULL,          -- positivo suma, negativo resta
  stock_antes REAL NOT NULL,
  stock_despues REAL NOT NULL,
  costo_unitario INTEGER,
  referencia TEXT,
  motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_movstock_prod ON movimientos_stock(producto_id, id);
CREATE INDEX IF NOT EXISTS idx_movstock_fecha ON movimientos_stock(fecha);
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  rut TEXT, contacto TEXT, telefono TEXT, email TEXT, notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  documento TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  condicion TEXT NOT NULL DEFAULT 'contado' CHECK (condicion IN ('contado','credito')),
  vence TEXT,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','anulada'))
);
CREATE TABLE IF NOT EXISTS compra_items (
  id INTEGER PRIMARY KEY,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL,
  costo_unitario INTEGER NOT NULL,
  total INTEGER NOT NULL,
  fecha_vencimiento TEXT
);
CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id INTEGER PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  compra_id INTEGER REFERENCES compras(id),
  fecha TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  monto INTEGER NOT NULL,
  metodo TEXT NOT NULL,
  desde_caja INTEGER NOT NULL DEFAULT 0,
  sesion_id INTEGER REFERENCES caja_sesiones(id),
  nota TEXT,
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vencimientos (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  fecha_vencimiento TEXT NOT NULL,
  cantidad REAL,
  compra_id INTEGER REFERENCES compras(id),
  creado TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','retirado','resuelto')),
  resuelto_en TEXT,
  nota TEXT
);
CREATE TABLE IF NOT EXISTS tomas_inventario (
  id INTEGER PRIMARY KEY,
  iniciada_en TEXT NOT NULL,
  iniciada_por INTEGER NOT NULL REFERENCES usuarios(id),
  cerrada_en TEXT,
  cerrada_por INTEGER REFERENCES usuarios(id),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','aplicada','cancelada')),
  notas TEXT
);
CREATE TABLE IF NOT EXISTS toma_items (
  id INTEGER PRIMARY KEY,
  toma_id INTEGER NOT NULL REFERENCES tomas_inventario(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  stock_sistema REAL NOT NULL,
  contado REAL NOT NULL DEFAULT 0,
  actualizado TEXT NOT NULL,
  UNIQUE (toma_id, producto_id)
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  rut TEXT, telefono TEXT, direccion TEXT, notas TEXT,
  limite_credito INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cliente_movimientos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('cargo','abono')),
  monto INTEGER NOT NULL,
  venta_id INTEGER REFERENCES ventas(id),
  devolucion_id INTEGER,
  metodo TEXT,
  sesion_id INTEGER REFERENCES caja_sesiones(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nota TEXT,
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_climov ON cliente_movimientos(cliente_id, id);
CREATE TABLE IF NOT EXISTS devoluciones (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  fecha TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  autorizada_por INTEGER REFERENCES usuarios(id),
  sesion_id INTEGER REFERENCES caja_sesiones(id),
  motivo TEXT,
  total INTEGER NOT NULL,
  metodo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devolucion_items (
  id INTEGER PRIMARY KEY,
  devolucion_id INTEGER NOT NULL REFERENCES devoluciones(id),
  venta_item_id INTEGER NOT NULL REFERENCES venta_items(id),
  producto_id INTEGER REFERENCES productos(id),
  cantidad REAL NOT NULL,
  total INTEGER NOT NULL,
  reingresa_stock INTEGER NOT NULL DEFAULT 1
);
-- ======================= Fase 3
CREATE TABLE IF NOT EXISTS terminales (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  config TEXT NOT NULL DEFAULT '{}',   -- impresora y opciones propias de esta caja (JSON)
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY,
  tipo INTEGER NOT NULL,               -- 39 boleta, 41 boleta exenta, 61 nota de crédito
  venta_id INTEGER REFERENCES ventas(id),
  devolucion_id INTEGER REFERENCES devoluciones(id),
  ref_documento_id INTEGER REFERENCES documentos(id),
  ref_codigo INTEGER,                  -- NC: 1 anula, 3 corrige montos
  ref_razon TEXT,
  monto INTEGER NOT NULL,
  folio INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','procesando','emitido','error','cancelado')),
  proveedor TEXT,
  ted TEXT,                            -- timbre: XML del TED o imagen en base64
  pdf_url TEXT,
  respuesta TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT,
  emitido_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_docs_venta ON documentos(venta_id);
CREATE INDEX IF NOT EXISTS idx_docs_estado ON documentos(estado);
-- ======================= Fase 4
CREATE TABLE IF NOT EXISTS promociones (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('pack','lleva_paga','mayorista','porcentaje')),
  producto_id INTEGER REFERENCES productos(id),
  categoria_id INTEGER REFERENCES categorias(id),
  cantidad REAL NOT NULL DEFAULT 1,     -- pack: N unidades · lleva_paga: lleva N · mayorista: desde N
  valor REAL NOT NULL DEFAULT 0,        -- pack: precio del pack · lleva_paga: paga M · mayorista: precio unitario · porcentaje: %
  desde TEXT,
  hasta TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bitacora (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  autorizado_por INTEGER REFERENCES usuarios(id),
  terminal_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(fecha);
CREATE TABLE IF NOT EXISTS ventas_iniciadas (
  uid TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  terminal_id INTEGER NOT NULL,
  creada TEXT NOT NULL,
  actualizada TEXT NOT NULL,
  estado TEXT NOT NULL,
  secuencia INTEGER NOT NULL,
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  venta_id INTEGER REFERENCES ventas(id)
);
CREATE TABLE IF NOT EXISTS ventas_iniciadas_eventos (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES ventas_iniciadas(uid),
  recibida TEXT NOT NULL,
  estado TEXT NOT NULL,
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  secuencia INTEGER,
  UNIQUE(uid, secuencia)
);
CREATE TABLE IF NOT EXISTS respaldos (
  id INTEGER PRIMARY KEY,
  archivo TEXT NOT NULL,
  creado TEXT NOT NULL,
  motivo TEXT,
  tamano INTEGER,
  subido INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
