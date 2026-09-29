-- Esquema para la base de datos D1 de Pitutos Panel

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    creado_en TEXT NOT NULL,
    expira_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    notas TEXT,
    rut TEXT,
    creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    -- Trabajo del que salió este equipo/producto en garantía (ej: el disco
    -- duro que se cambió en una reparación). Puede ser NULL cuando el
    -- equipo se registró suelto, sin venir de un trabajo puntual.
    trabajo_id INTEGER,
    tipo_equipo TEXT NOT NULL,
    marca_modelo TEXT,
    numero_serie TEXT,
    precio INTEGER DEFAULT 0,
    fecha_venta TEXT NOT NULL,
    meses_garantia INTEGER NOT NULL DEFAULT 3,
    notas TEXT,
    creado_en TEXT NOT NULL,
    public_token TEXT,
    -- Controla si la garantía de este equipo aparece dentro de la página de
    -- seguimiento del TRABAJO al que está vinculado (nace oculta, igual que
    -- notas/fotos/enlaces). visible_desde queda como trazabilidad, no se
    -- borra si después se vuelve a ocultar. El link propio de garantía del
    -- equipo no se ve afectado por esto: si tú lo compartes, es porque ya
    -- decidiste mostrarlo.
    visible_cliente INTEGER NOT NULL DEFAULT 0,
    visible_desde TEXT,
    -- Agrupa componentes de una misma venta tipo "sistema" (ej: Mini PC +
    -- monitor + lector + impresora) que comparten garantía, para que el
    -- panel los muestre compactados en vez de una tarjeta por cada uno.
    -- NULL = equipo suelto, se ve exactamente igual que siempre.
    grupo_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_equipos_trabajo ON equipos(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_equipos_grupo ON equipos(grupo_id);

-- Grupo de equipos (ver equipos.grupo_id más arriba).
CREATE TABLE IF NOT EXISTS grupos_equipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grupos_equipos_cliente ON grupos_equipos(cliente_id);

-- Link público combinado: muestra exactamente los equipos (de un mismo
-- cliente) que el negocio eligió incluir al generarlo, no necesariamente
-- todo un grupo.
CREATE TABLE IF NOT EXISTS links_combinados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    equipo_ids TEXT NOT NULL,
    public_token TEXT NOT NULL UNIQUE,
    creado_en TEXT NOT NULL,
    -- Si es 0, el link público no muestra precio, abonos ni saldo de
    -- ningún equipo incluido (útil para demostraciones).
    mostrar_precio INTEGER NOT NULL DEFAULT 1,
    -- Mensaje opcional que se muestra destacado en el link (ej: "Se
    -- completó el ensamblaje y configuración del sistema POS").
    nota TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_combinados_token ON links_combinados(public_token);

-- Fotos que reflejan el estado actual del equipo (por ejemplo, cómo llegó
-- o cómo quedó tras una reparación), que el cliente ve en su link público
-- de garantía. Independiente de "avances" porque esa tabla es solo de
-- trabajos.
CREATE TABLE IF NOT EXISTS fotos_equipo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipo_id INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    descripcion TEXT,
    creado_en TEXT NOT NULL,
    -- Igual que las fotos de avance: nace oculta hasta que se marca a
    -- propósito. visible_desde queda como trazabilidad.
    visible_cliente INTEGER NOT NULL DEFAULT 0,
    visible_desde TEXT
);

CREATE TABLE IF NOT EXISTS trabajos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    monto INTEGER DEFAULT 0,
    fecha_creacion TEXT NOT NULL,
    fecha_cierre TEXT,
    notas TEXT,
    public_token TEXT,
    -- Recién en 0 (oculto): el "Detalle y pago" (repuestos/servicios,
    -- garantía, cuánto lleva pagado) no aparece en la página de
    -- seguimiento del cliente hasta que tú decidas mostrarlo — mientras el
    -- trabajo está en curso el monto puede ser todavía provisorio.
    mostrar_detalle_cliente INTEGER NOT NULL DEFAULT 0,
    -- Trazabilidad de cuándo se activó "mostrar detalle y pago" (igual que
    -- visible_desde en avances): no se borra si después se vuelve a ocultar.
    detalle_visible_desde TEXT
);

-- Desglose de un trabajo: repuestos usados y/o servicios cobrados, cada
-- uno con su propio valor (ej: "Disco duro" $20.000 + "Formateo e
-- instalación de sistema" $15.000). Es solo informativo/de desglose —
-- el monto real que se cobra sigue siendo trabajos.monto; esto existe
-- para que tanto tú como el cliente vean en qué se compone ese total.
CREATE TABLE IF NOT EXISTS items_trabajo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER NOT NULL,
    tipo TEXT NOT NULL, -- 'repuesto' | 'servicio' | 'otro'
    descripcion TEXT NOT NULL,
    valor INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL
);

-- Línea de tiempo de avances que ve el cliente en su link de seguimiento
-- (notas, fotos o enlaces), por trabajo.
CREATE TABLE IF NOT EXISTS avances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER NOT NULL,
    tipo TEXT NOT NULL, -- 'nota' | 'foto' | 'url' | 'estado' (hito automático, no editable)
    texto TEXT,
    valor TEXT,
    creado_en TEXT NOT NULL,
    editado_en TEXT,
    revisado_en TEXT, -- cuándo lo marcó el CLIENTE como revisado desde su link público
    -- El técnico decide avance por avance qué se le muestra al cliente (todo
    -- nace oculto, salvo los hitos automáticos de cambio de estado, que
    -- siempre son visibles). visible_desde queda como trazabilidad de cuándo
    -- se hizo visible, aunque después se vuelva a ocultar.
    visible_cliente INTEGER NOT NULL DEFAULT 0,
    visible_desde TEXT
);

CREATE TABLE IF NOT EXISTS mensualidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    monto INTEGER NOT NULL DEFAULT 0,
    dia_cobro INTEGER NOT NULL DEFAULT 1,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pagos_mensualidad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensualidad_id INTEGER NOT NULL,
    periodo TEXT NOT NULL,
    fecha_pago TEXT NOT NULL,
    monto_pagado INTEGER NOT NULL,
    UNIQUE(mensualidad_id, periodo)
);

-- Abonos: pagos parciales (o completos) de trabajos, equipos o
-- mensualidades. `categoria` indica a qué tabla pertenece el pago
-- (trabajo/equipo/mensualidad) y `referencia_id` es el id en esa tabla.
-- `periodo` solo se usa para mensualidades (YYYY-MM); en trabajos y
-- equipos queda NULL porque no son recurrentes. Cada abono tiene su
-- propio link público de comprobante.
CREATE TABLE IF NOT EXISTS abonos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    referencia_id INTEGER NOT NULL,
    periodo TEXT,
    monto INTEGER NOT NULL,
    fecha_pago TEXT NOT NULL,
    nota TEXT,
    public_token TEXT,
    creado_en TEXT NOT NULL
);

-- Historial de qué se le mandó al cliente por WhatsApp desde el panel — para
-- que si el cliente pregunta algo, puedas volver atrás y ver exactamente
-- qué le enviaste y cuándo.
CREATE TABLE IF NOT EXISTS envios_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajo_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipos_cliente ON equipos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fotos_equipo_equipo ON fotos_equipo(equipo_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_cliente ON trabajos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mensualidades_cliente ON mensualidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_mensualidad ON pagos_mensualidad(mensualidad_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_avances_trabajo ON avances(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_envios_trabajo ON envios_cliente(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_items_trabajo_trabajo ON items_trabajo(trabajo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajos_public_token ON trabajos(public_token);
CREATE INDEX IF NOT EXISTS idx_abonos_cat_ref ON abonos(categoria, referencia_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_abonos_public_token ON abonos(public_token);
