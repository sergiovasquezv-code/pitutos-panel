/* Convierte el CSV de artículos de Loyverse al SQLite de MiPOS 4.0.92.
   Funciona en el navegador y en Node, sin instalar nada en el otro equipo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Convertidor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VERSION = "4.0.92";
  const COSTO_PLACEHOLDER = 10000000;
  const MIGRACIONES = {
    ventas: [
      ["anulada_por", "INTEGER REFERENCES usuarios(id)"],
      ["autorizada_por", "INTEGER REFERENCES usuarios(id)"],
      ["anulada_en", "TEXT"],
      ["motivo_anulacion", "TEXT"],
      ["cliente_id", "INTEGER REFERENCES clientes(id)"],
    ],
    caja_sesiones: [
      ["terminal_id", "INTEGER REFERENCES terminales(id)"],
      ["equipo_id", "TEXT"],
    ],
    productos: [
      ["plu", "TEXT"],
      ["precio_cambiado_en", "TEXT"],
      ["catalogo_base", "INTEGER NOT NULL DEFAULT 0"],
    ],
    usuarios: [["permisos", "TEXT NOT NULL DEFAULT '{}'"]],
    clientes: [
      ["giro", "TEXT"],
      ["comuna", "TEXT"],
      ["email", "TEXT"],
    ],
    venta_items: [
      ["promo", "TEXT"],
      ["combo_componentes", "TEXT NOT NULL DEFAULT '[]'"],
    ],
  };
  const DEFAULT_CONFIG = {
    negocio_nombre: "Mi Almacén",
    negocio_rut: "",
    negocio_direccion: "",
    negocio_telefono: "",
    transferencia_imprimir: "0",
    transferencia_pago: "0",
    transferencia_titular: "",
    transferencia_rut: "",
    transferencia_banco: "",
    transferencia_tipo_cuenta: "",
    transferencia_numero: "",
    transferencia_email: "",
    ticket_pie: "¡Gracias por su compra!",
    ticket_ancho: "80",
    ticket_auto_imprimir: "1",
    cajon_abrir_efectivo: "1",
    impresora_modo: "ninguna",
    impresora_nombre: "",
    impresora_ip: "",
    impresora_puerto: "9100",
    redondeo_efectivo: "1",
    iva_activo: "0",
    iva_tasa: "19",
    vencimiento_aviso_dias: "15",
    respaldo_intervalo_min: "60",
    respaldo_copias: "48",
    respaldo_remoto: "",
    rclone_ruta: "",
    dte_activo: "0",
    dte_proveedor: "simulado",
    dte_tipo: "39",
    dte_rut_emisor: "",
    dte_razon_social: "",
    dte_giro: "",
    dte_direccion: "",
    dte_comuna: "",
    dte_resolucion_num: "",
    dte_resolucion_fecha: "",
    dte_timeout: "8",
    dte_voucher_tarjeta: "0",
    dte_imprimir_timbre: "1",
    dte_libredte_url: "https://libredte.cl",
    dte_libredte_hash: "",
    dte_gen_url: "",
    dte_gen_header: "apikey",
    dte_gen_clave: "",
    dte_gen_envolver: "dte",
    dte_gen_extra: "",
    dte_gen_ruta_folio: "FOLIO",
    dte_gen_ruta_timbre: "TIMBRE",
    dte_gen_ruta_pdf: "PDF",
    dte_acteco: "",
    balanza_activa: "0",
    balanza_prefijo: "2",
    balanza_largo_plu: "5",
    balanza_tipo: "precio",
    telegram_token: "",
    telegram_chats: "[]",
    telegram_resumen_hora: "21:30",
    telegram_avisos: "1",
    actualizacion_auto: "1",
  };
  const CAJA_CONFIG = {
    impresora_modo: "ninguna",
    impresora_nombre: "",
    impresora_ip: "",
    impresora_puerto: "9100",
    ticket_ancho: "80",
    ticket_auto_imprimir: "1",
    cajon_abrir_efectivo: "1",
  };
  const COLUMNAS_PRODUCTO = [
    "id", "codigo", "nombre", "categoria_id", "precio_costo", "precio_venta",
    "stock", "stock_minimo", "granel", "activo", "creado", "actualizado",
    "plu", "precio_cambiado_en", "catalogo_base",
  ];

  function hex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }

  function sha256(datos) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    const bits = datos.length * 8;
    const conPad = new Uint8Array(((datos.length + 9 + 63) >> 6) << 6);
    conPad.set(datos);
    conPad[datos.length] = 0x80;
    const vista = new DataView(conPad.buffer);
    vista.setUint32(conPad.length - 4, bits, false);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let i = 0; i < conPad.length; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = vista.getUint32(i + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v, false));
    return out;
  }

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function hmacSha256(clave, mensaje) {
    const bloque = 64;
    let k = clave.length > bloque ? sha256(clave) : clave;
    if (k.length < bloque) {
      const relleno = new Uint8Array(bloque);
      relleno.set(k);
      k = relleno;
    }
    const o = new Uint8Array(bloque + 32);
    const i = new Uint8Array(bloque + mensaje.length);
    for (let n = 0; n < bloque; n++) {
      o[n] = k[n] ^ 0x5c;
      i[n] = k[n] ^ 0x36;
    }
    i.set(mensaje, bloque);
    o.set(sha256(i), bloque);
    return sha256(o);
  }

  function pbkdf2Sha256(clave, sal, iteraciones) {
    const pass = typeof clave === "string" ? new TextEncoder().encode(clave) : clave;
    const bloque = new Uint8Array(sal.length + 4);
    bloque.set(sal);
    bloque[sal.length + 3] = 1;
    let u = hmacSha256(pass, bloque);
    const t = u.slice();
    for (let i = 1; i < iteraciones; i++) {
      u = hmacSha256(pass, u);
      for (let j = 0; j < 32; j++) t[j] ^= u[j];
    }
    return t;
  }

  async function hashClave(clave) {
    const sal = globalThis.crypto.getRandomValues(new Uint8Array(16));
    let digest;
    if (globalThis.crypto.subtle) {
      const key = await globalThis.crypto.subtle.importKey(
        "raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]
      );
      const bits = await globalThis.crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: sal, iterations: 200000, hash: "SHA-256" }, key, 256
      );
      digest = new Uint8Array(bits);
    } else {
      digest = pbkdf2Sha256(clave, sal, 200000);
    }
    return "pbkdf2$200000$" + hex(sal) + "$" + hex(digest);
  }

  function ahoraSantiago(fecha) {
    const fmt = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Santiago",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    return fmt.format(fecha || new Date()).replace(" ", "T");
  }

  function pesos(valor) {
    return Math.sign(valor) * Math.round(Math.abs(valor));
  }

  function stockReal(texto) {
    if (texto == null || String(texto).trim() === "") return 0;
    return Math.round(Number(String(texto).trim().replace(",", ".")) * 1000) / 1000;
  }

  function siNo(texto) {
    return ["Y", "SI", "S", "1", "TRUE"].includes(String(texto || "").trim().toUpperCase()) ? 1 : 0;
  }

  function recortar(texto, n) {
    return Array.from(texto).slice(0, n).join("");
  }

  function parseCsv(texto) {
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
    const filas = [];
    let campo = "", fila = [], comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }
          else comillas = false;
        } else campo += c;
        continue;
      }
      if (c === '"') { comillas = true; continue; }
      if (c === ",") { fila.push(campo); campo = ""; continue; }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo);
        campo = "";
        if (!(fila.length === 1 && fila[0] === "")) filas.push(fila);
        fila = [];
        continue;
      }
      campo += c;
    }
    if (campo.length || fila.length) {
      fila.push(campo);
      filas.push(fila);
    }
    if (!filas.length) throw new Error("El CSV está vacío.");
    const encabezados = filas[0];
    return filas.slice(1).filter((f) => f.some((c) => c !== "")).map((valores) => {
      const obj = {};
      encabezados.forEach((nombre, i) => { obj[nombre] = valores[i] == null ? "" : valores[i]; });
      return obj;
    });
  }

  function columnaTienda(nombres, prefijo) {
    return nombres.find((nombre) => nombre.startsWith(prefijo + " [") && nombre.endsWith("]")) || "";
  }

  function leerLoyverse(texto) {
    const filasCrudas = parseCsv(texto);
    const nombres = Object.keys(filasCrudas[0] || {});
    const precio = columnaTienda(nombres, "Precio");
    if (!precio) throw new Error("El CSV no trae la columna Precio [tienda] de Loyverse.");
    const tienda = precio.slice(precio.indexOf("[") + 1, -1);
    const inventario = columnaTienda(nombres, "En inventario");
    const bajas = columnaTienda(nombres, "Existencias bajas");
    const disponible = columnaTienda(nombres, "Disponibles para la venta");
    const filas = filasCrudas.map((cruda) => ({
      handle: (cruda.Handle || "").trim(),
      ref: (cruda.REF || "").trim(),
      nombre: (cruda.Nombre || "").trim(),
      categoria: (cruda.Categoria || "").trim(),
      descripcion: (cruda["Descripción"] || "").trim(),
      vendido_por_peso: (cruda["Vendido por peso"] || "").trim(),
      opcion1_nombre: (cruda["Opción 1 nombre"] || "").trim(),
      opcion1_valor: (cruda["Opción 1 valor"] || "").trim(),
      opcion2_nombre: (cruda["Opción 2 nombre"] || "").trim(),
      opcion2_valor: (cruda["Opción 2 valor"] || "").trim(),
      opcion3_nombre: (cruda["Opción 3 nombre"] || "").trim(),
      opcion3_valor: (cruda["Opción 3 valor"] || "").trim(),
      coste: (cruda.Coste || "").trim(),
      codigo_barras: (cruda["Codigo de barras"] || "").trim(),
      ref_componente: (cruda["REF del componente"] || "").trim(),
      cantidad_componente: (cruda["Cantidad del componente"] || "").trim(),
      seguir_inventario: (cruda["Seguir el Inventario"] || "").trim(),
      disponible: disponible ? (cruda[disponible] || "").trim() : "",
      precio: (cruda[precio] || "").trim(),
      en_inventario: inventario ? (cruda[inventario] || "").trim() : "",
      existencias_bajas: bajas ? (cruda[bajas] || "").trim() : "",
    }));
    return { tienda, filas };
  }

  function asignarCodigos(productos) {
    const usados = new Set();
    const duplicados = [];
    for (const fila of productos) {
      const barra = fila.codigo_barras;
      if (barra && !usados.has(barra)) {
        fila.codigo = barra;
        fila.codigo_origen = "barra";
        usados.add(barra);
        continue;
      }
      if (barra) {
        duplicados.push({ codigo_barras: barra, ref: fila.ref, nombre: fila.nombre, quedo_con: null });
      }
      let codigo = fila.ref || fila.handle;
      const base = codigo;
      let n = 2;
      while (!codigo || usados.has(codigo)) codigo = base + "-" + (n++);
      fila.codigo = codigo;
      fila.codigo_origen = barra ? "ref_por_barra_repetida" : "ref";
      usados.add(codigo);
      if (duplicados.length && duplicados[duplicados.length - 1].ref === fila.ref && duplicados[duplicados.length - 1].quedo_con == null) {
        duplicados[duplicados.length - 1].quedo_con = codigo;
      }
    }
    return duplicados;
  }

  function prepararProducto(fila, avisos) {
    const precioTxt = fila.precio.trim().toLowerCase();
    let precio;
    if (precioTxt === "" || precioTxt === "variable") {
      precio = 0;
      avisos[precioTxt === "variable" ? "precio_variable" : "precio_vacio"]++;
    } else precio = pesos(Number(precioTxt.replace(",", ".")));
    const costeTxt = fila.coste.trim();
    let costo = 0;
    if (costeTxt) {
      costo = pesos(Number(costeTxt.replace(",", ".")));
      if (costo >= COSTO_PLACEHOLDER) {
        avisos.costo_placeholder++;
        costo = 0;
      }
    }
    const stock = fila.seguir_inventario.toUpperCase() === "Y" ? stockReal(fila.en_inventario) : 0;
    if (stock < 0) avisos.stock_negativo++;
    return {
      precio_venta: precio,
      precio_costo: costo,
      stock,
      stock_minimo: stockReal(fila.existencias_bajas),
      granel: siNo(fila.vendido_por_peso),
      activo: fila.disponible.toUpperCase() === "N" ? 0 : 1,
    };
  }

  function valor(db, sql, params) {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const hay = stmt.step();
    const fila = hay ? stmt.get() : null;
    stmt.free();
    return fila;
  }

  function columnas(db, tabla) {
    return db.exec("PRAGMA table_info(" + tabla + ")")[0].values.map((f) => f[1]);
  }

  function crearLoyverse(SQL, filas, tienda, origen) {
    const db = new SQL.Database();
    db.run("CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
    db.run(`CREATE TABLE articulos (
      id INTEGER PRIMARY KEY,
      handle TEXT NOT NULL,
      ref TEXT NOT NULL,
      nombre TEXT NOT NULL,
      categoria TEXT,
      descripcion TEXT,
      vendido_por_peso TEXT,
      opcion1_nombre TEXT, opcion1_valor TEXT,
      opcion2_nombre TEXT, opcion2_valor TEXT,
      opcion3_nombre TEXT, opcion3_valor TEXT,
      coste TEXT,
      codigo_barras TEXT,
      ref_componente TEXT,
      cantidad_componente TEXT,
      seguir_inventario TEXT,
      tienda TEXT NOT NULL,
      disponible_venta TEXT,
      precio TEXT,
      en_inventario TEXT,
      existencias_bajas TEXT
    )`);
    const meta = db.prepare("INSERT INTO meta(clave, valor) VALUES(?, ?)");
    [["origen", origen], ["tienda", tienda], ["filas", String(filas.length)]].forEach((par) => meta.run(par));
    meta.free();
    const ins = db.prepare(`INSERT INTO articulos(
      handle, ref, nombre, categoria, descripcion, vendido_por_peso,
      opcion1_nombre, opcion1_valor, opcion2_nombre, opcion2_valor,
      opcion3_nombre, opcion3_valor, coste, codigo_barras, ref_componente,
      cantidad_componente, seguir_inventario, tienda, disponible_venta,
      precio, en_inventario, existencias_bajas
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    filas.forEach((f) => ins.run([
      f.handle, f.ref, f.nombre, f.categoria, f.descripcion, f.vendido_por_peso,
      f.opcion1_nombre, f.opcion1_valor, f.opcion2_nombre, f.opcion2_valor,
      f.opcion3_nombre, f.opcion3_valor, f.coste, f.codigo_barras, f.ref_componente,
      f.cantidad_componente, f.seguir_inventario, tienda, f.disponible, f.precio,
      f.en_inventario, f.existencias_bajas,
    ]));
    ins.free();
    return db;
  }

  function verificar(db, productos, tienda) {
    const cols = columnas(db, "productos");
    if (cols.join(",") !== COLUMNAS_PRODUCTO.join(",")) {
      throw new Error("La tabla productos no calza con MiPOS: " + cols.join(", "));
    }
    const integridad = valor(db, "PRAGMA integrity_check")[0];
    if (integridad !== "ok") throw new Error("SQLite integrity_check: " + integridad);
    const rotas = db.exec("PRAGMA foreign_key_check");
    if (rotas.length && rotas[0].values.length) throw new Error("Hay claves foráneas rotas.");
    const total = valor(db, "SELECT COUNT(*) FROM productos")[0];
    if (total !== productos.length) throw new Error("Se esperaban " + productos.length + " productos y hay " + total);
    const distintos = valor(db, "SELECT COUNT(DISTINCT codigo) FROM productos")[0];
    if (distintos !== total) throw new Error("Hay códigos repetidos en productos.codigo");
    if (valor(db, "SELECT valor FROM config WHERE clave='version_programa'")[0] !== VERSION) {
      throw new Error("version_programa no quedó en " + VERSION);
    }
    if (valor(db, "SELECT valor FROM config WHERE clave='negocio_nombre'")[0] !== tienda) {
      throw new Error("El nombre del negocio no quedó en " + tienda);
    }
    const triggers = new Set((db.exec("SELECT name FROM sqlite_master WHERE type='trigger'")[0] || { values: [] }).values.map((f) => f[0]));
    if (!triggers.has("trg_precio_nuevo") || !triggers.has("trg_precio_cambiado")) {
      throw new Error("Faltan los triggers de precio de MiPOS.");
    }
    const sinFecha = valor(db, "SELECT COUNT(*) FROM productos WHERE precio_cambiado_en IS NULL OR creado IS NULL")[0];
    if (sinFecha) throw new Error("Hay productos sin fecha.");
    const descuadre = valor(db, `SELECT COUNT(*) FROM productos p
      LEFT JOIN movimientos_stock m ON m.producto_id=p.id AND m.tipo='importacion'
      WHERE p.stock <> 0 AND (m.id IS NULL OR m.stock_despues <> p.stock)`)[0];
    if (descuadre) throw new Error("El kárdex no cuadra con el stock en " + descuadre + " productos.");
  }

  async function convertir(SQL, csvText, nombreArchivo, opciones) {
    const esquema = opciones.esquema;
    const triggers = opciones.triggers;
    const { tienda, filas } = leerLoyverse(csvText);
    if (!filas.length) throw new Error("El CSV no trae artículos.");
    const componentes = filas.filter((f) => f.ref_componente);
    const productos = filas.filter((f) => !f.ref_componente);
    const sinNombre = productos.filter((f) => !f.nombre).map((f) => f.ref);
    if (sinNombre.length) throw new Error("Hay artículos sin nombre: " + sinNombre.slice(0, 5).join(", "));

    const loyverse = crearLoyverse(SQL, filas, tienda, nombreArchivo || "export_items.csv");
    const momento = ahoraSantiago();
    const avisos = { precio_variable: 0, precio_vacio: 0, costo_placeholder: 0, stock_negativo: 0 };
    const duplicados = asignarCodigos(productos);
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys=ON");
    db.exec(esquema);
    for (const [tabla, defs] of Object.entries(MIGRACIONES)) {
      const existentes = new Set(columnas(db, tabla));
      for (const [nombre, tipo] of defs) {
        if (!existentes.has(nombre)) db.run("ALTER TABLE " + tabla + " ADD COLUMN " + nombre + " " + tipo);
      }
    }
    db.exec(triggers);
    db.run("CREATE INDEX IF NOT EXISTS idx_caja_terminal ON caja_sesiones(terminal_id, estado)");
    const cfg = db.prepare("INSERT INTO config(clave, valor) VALUES(?, ?)");
    Object.entries(DEFAULT_CONFIG).forEach(([k, v]) => cfg.run([k, v]));
    cfg.free();
    db.run(
      "INSERT INTO config(clave, valor) VALUES('version_programa', ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
      [VERSION]
    );
    db.run("UPDATE config SET valor=? WHERE clave='negocio_nombre'", [tienda || "Mi Almacén"]);
    db.run(
      "INSERT INTO usuarios(nombre, usuario, clave_hash, rol, debe_cambiar_clave, creado) VALUES(?,?,?,?,1,?)",
      ["Administrador", "admin", await hashClave("1234"), "admin", momento]
    );
    db.run("INSERT OR IGNORE INTO categorias(nombre) VALUES('General')");
    db.run(
      "INSERT INTO terminales(id, nombre, config, creado) VALUES(1, 'Caja 1', ?, ?)",
      [JSON.stringify(CAJA_CONFIG), momento]
    );

    const categorias = new Map();
    const insCat = db.prepare("INSERT INTO categorias(nombre) VALUES(?)");
    for (const fila of productos) {
      const nombre = recortar(fila.categoria, 60);
      if (!nombre) continue;
      const clave = nombre.toLowerCase();
      if (!categorias.has(clave)) {
        insCat.run([nombre]);
        categorias.set(clave, valor(db, "SELECT last_insert_rowid()")[0]);
      }
    }
    insCat.free();

    const insP = db.prepare(`INSERT INTO productos(
      codigo, nombre, categoria_id, precio_costo, precio_venta, stock, stock_minimo,
      granel, activo, creado, actualizado, plu, catalogo_base
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`);
    const movimientos = [];
    for (const fila of productos) {
      const nums = prepararProducto(fila, avisos);
      const cat = recortar(fila.categoria, 60);
      insP.run([
        fila.codigo, recortar(fila.nombre, 120), cat ? categorias.get(cat.toLowerCase()) : null,
        nums.precio_costo, nums.precio_venta, nums.stock, nums.stock_minimo, nums.granel,
        nums.activo, momento, momento, null,
      ]);
      if (nums.stock !== 0) {
        movimientos.push([
          valor(db, "SELECT last_insert_rowid()")[0], momento, null, "importacion", nums.stock, 0,
          nums.stock, nums.precio_costo, fila.ref, "Importación Loyverse",
        ]);
      }
    }
    insP.free();
    const insM = db.prepare(`INSERT INTO movimientos_stock(
      producto_id, fecha, usuario_id, tipo, cantidad, stock_antes, stock_despues,
      costo_unitario, referencia, motivo
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    movimientos.forEach((m) => insM.run(m));
    insM.free();
    db.run("UPDATE productos SET precio_cambiado_en=?", [momento]);
    verificar(db, productos, tienda);

    const informe = {
      version_mipos: VERSION,
      tienda,
      productos: productos.length,
      categorias: categorias.size,
      con_codigo_de_barras: productos.filter((p) => p.codigo_origen === "barra").length,
      con_ref_porque_no_hay_barra: productos.filter((p) => p.codigo_origen === "ref").length,
      con_ref_porque_la_barra_estaba_repetida: productos.filter((p) => p.codigo_origen === "ref_por_barra_repetida").length,
      vendidos_por_peso: productos.filter((p) => siNo(p.vendido_por_peso)).length,
      precio_variable_en_cero: avisos.precio_variable,
      costos_placeholder_en_cero: avisos.costo_placeholder,
      stock_negativo: avisos.stock_negativo,
      movimientos_de_stock: movimientos.length,
      barras_repetidas: duplicados,
      acceso: "Al abrir esta base en MiPOS, el usuario es admin y la clave es 1234. Pide cambiarla.",
      archivo: "mipos/mipos.db",
    };
    if (componentes.length) informe.filas_de_componentes_no_convertidas_a_combo = componentes.length;
    return {
      tienda,
      loyverse: loyverse.export(),
      mipos: db.export(),
      informe,
      csv: csvText,
      cerrar() { loyverse.close(); db.close(); },
    };
  }

  return { convertir, sha256, pbkdf2Sha256, hex, ahoraSantiago };
});
