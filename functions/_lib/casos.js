import { nowIso } from "./dates.js";

// Un trabajo es un caso. El total (trabajos.monto) es la suma de las líneas
// cuando hay líneas. Los abonos se restan de ese total en otro lado.

export const PASOS_CASO = ["Cotización", "En curso", "Listo", "Entregado"];

export const TIPOS_ITEM = ["producto", "repuesto", "servicio", "mano_obra", "otro"];

const ESTADOS_POR_PASO = {
  Cotización: ["Cotización", "Pendiente", "Demostración"],
  "En curso": ["En curso", "Recibido", "En preparación", "Esperando cliente", "Cliente no ubicado"],
  Listo: ["Listo", "Equipo listo", "Entrega fijada"],
  Entregado: ["Entregado"],
};

const columnasListas = new WeakSet();
const realizadoListo = new WeakSet();

export function pasoDe(estado) {
  if (ESTADOS_POR_PASO.Cotización.includes(estado)) return "Cotización";
  if (ESTADOS_POR_PASO.Listo.includes(estado)) return "Listo";
  if (estado === "Entregado") return "Entregado";
  return "En curso";
}

export function esCotizacion(estado) {
  return pasoDe(estado) === "Cotización";
}

// Filtro de la lista: "En curso" también trae Recibido, En preparación y las pausas.
export function estadosDe(paso) {
  return ESTADOS_POR_PASO[paso] || null;
}

export async function asegurarCantidad(db) {
  if (columnasListas.has(db)) return;
  const info = await db.prepare("PRAGMA table_info(items_trabajo)").all();
  const tiene = (info.results || []).some((c) => c.name === "cantidad");
  if (!tiene) {
    try {
      await db.exec("ALTER TABLE items_trabajo ADD COLUMN cantidad INTEGER NOT NULL DEFAULT 1");
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
  columnasListas.add(db);
}

export function lineaDesdeBody(body) {
  const tipo = TIPOS_ITEM.includes(body.tipo) ? body.tipo : "otro";
  const descripcion = (body.descripcion || "").trim();
  let cantidad = Math.round(Number(body.cantidad));
  if (!Number.isFinite(cantidad) || cantidad < 1) cantidad = 1;
  const mandoUnitario = body.precio_unitario !== undefined && body.precio_unitario !== null && body.precio_unitario !== "";
  const unitario = Math.max(Math.round(Number(body.precio_unitario) || 0), 0);
  const valor = mandoUnitario ? cantidad * unitario : Math.max(Math.round(Number(body.valor) || 0), 0);
  return { tipo, descripcion, cantidad, valor };
}

export async function asegurarRealizado(db) {
  if (realizadoListo.has(db)) return;
  const info = await db.prepare("PRAGMA table_info(trabajos)").all();
  const tiene = (info.results || []).some((c) => c.name === "realizado");
  if (!tiene) {
    try {
      await db.prepare("ALTER TABLE trabajos ADD COLUMN realizado TEXT").run();
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
  realizadoListo.add(db);
}

export async function contarItems(db, trabajoId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM items_trabajo WHERE trabajo_id = ?")
    .bind(trabajoId)
    .first();
  return Number(row && row.n) || 0;
}

export async function sincronizarMonto(db, trabajoId) {
  const row = await db
    .prepare("SELECT COALESCE(SUM(valor), 0) AS total FROM items_trabajo WHERE trabajo_id = ?")
    .bind(trabajoId)
    .first();
  const monto = Number(row && row.total) || 0;
  await db.prepare("UPDATE trabajos SET monto = ? WHERE id = ?").bind(monto, trabajoId).run();
  return monto;
}

export async function insertarLinea(db, trabajoId, linea) {
  await asegurarCantidad(db);
  const result = await db
    .prepare(
      "INSERT INTO items_trabajo (trabajo_id, tipo, descripcion, cantidad, valor, creado_en) VALUES (?,?,?,?,?,?)"
    )
    .bind(trabajoId, linea.tipo, linea.descripcion, linea.cantidad, linea.valor, nowIso())
    .run();
  return result.meta.last_row_id;
}

// Si el trabajo tenía un monto escrito a mano y todavía no tenía líneas,
// esa cifra se guarda como primera línea para no perderla al sumar.
export async function agregarItem(db, trabajoId, linea) {
  await asegurarCantidad(db);
  const trabajo = await db.prepare("SELECT monto FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return null;
  const n = await contarItems(db, trabajoId);
  if (n === 0 && Number(trabajo.monto) > 0) {
    await insertarLinea(db, trabajoId, {
      tipo: "servicio",
      descripcion: "Según lo acordado",
      cantidad: 1,
      valor: Math.round(Number(trabajo.monto)),
    });
  }
  const id = await insertarLinea(db, trabajoId, linea);
  const monto = await sincronizarMonto(db, trabajoId);
  return { id, monto };
}
