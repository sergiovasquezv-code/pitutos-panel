// Correcciones que el dueño pide desde la página. El PC las baja y las aplica.
// El stock es una suma o una resta: nunca «deja el stock en este número».
import { ahora, texto } from './licencias.js';

export const MAX_PENDIENTES = 30;

let tablasListas = false;

function entero(n, max, min = 0) {
  if (typeof n === 'boolean' || n == null || n === '') return null;
  const x = typeof n === 'string' ? Number(n.trim()) : n;
  if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) return null;
  return x;
}

function cantidadPositiva(n) {
  if (typeof n === 'boolean' || n == null || n === '') return null;
  const x = typeof n === 'string' ? Number(String(n).trim().replace(',', '.')) : n;
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0 || x > 1_000_000) return null;
  const redonda = Math.round(x * 1000) / 1000;
  return redonda > 0 ? redonda : null;
}

export function limpiarOrden(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'La corrección está vacía' };
  if (JSON.stringify(d).includes('SQLite format')) return { error: 'La corrección no puede llevar la base de datos' };
  const tipo = d.tipo === 'precio' || d.tipo === 'stock' || d.tipo === 'nombre' ? d.tipo : '';
  if (!tipo) return { error: 'La corrección no es válida' };
  const codigo = texto(d.codigo, 40);
  const nombre = texto(d.nombre, 80);
  if (!codigo && !nombre) return { error: 'Falta el producto' };
  if (tipo === 'nombre') {
    const nuevo = texto(d.nombre_nuevo, 80);
    if (!nuevo) return { error: 'Escribe el nombre nuevo' };
    if (nuevo.toLowerCase() === nombre.toLowerCase()) return { error: 'El nombre es el mismo' };
    return { orden: { tipo, codigo, nombre, precio: null, delta: null, motivo: nuevo } };
  }
  if (tipo === 'precio') {
    const precio = entero(d.precio, 100_000_000, 1);
    if (precio == null) return { error: 'El precio de venta no es válido' };
    return { orden: { tipo, codigo, nombre, precio, delta: null, motivo: '' } };
  }
  if (d.modo !== 'sumar' && d.modo !== 'restar') {
    return { error: 'Hay que sumar o restar. No se puede dejar el stock en un número fijo.' };
  }
  const cantidad = cantidadPositiva(d.cantidad);
  if (cantidad == null) return { error: 'La cantidad no es válida' };
  const motivo = texto(d.motivo, 120);
  if (!motivo) return { error: 'Escribe el motivo' };
  return {
    orden: {
      tipo,
      codigo,
      nombre,
      precio: null,
      delta: d.modo === 'restar' ? -cantidad : cantidad,
      motivo,
    },
  };
}

function segura(fila) {
  if (!fila) return null;
  const estado = fila.estado === 'aplicada' || fila.estado === 'rechazada' ? fila.estado : 'pendiente';
  return {
    id: Number(fila.id),
    tipo: fila.tipo === 'stock' || fila.tipo === 'nombre' ? fila.tipo : 'precio',
    codigo: texto(fila.codigo, 40),
    nombre: texto(fila.nombre, 80),
    precio: fila.precio == null ? null : Number(fila.precio),
    delta: fila.delta == null ? null : Number(fila.delta),
    motivo: texto(fila.motivo, 120),
    estado,
    detalle: texto(fila.detalle, 200),
    creada: typeof fila.creada === 'string' ? fila.creada : '',
  };
}

export async function asegurarOrdenes(db) {
  if (tablasListas) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_ordenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      codigo TEXT NOT NULL DEFAULT '',
      nombre TEXT NOT NULL DEFAULT '',
      precio INTEGER,
      delta REAL,
      motivo TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      detalle TEXT NOT NULL DEFAULT '',
      creada TEXT NOT NULL,
      aplicada TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mipos_ordenes_clave ON mipos_ordenes(clave_id, estado, id)'),
  ]);
  tablasListas = true;
}

export async function crearOrden(db, claveId, datos) {
  const limpio = limpiarOrden(datos);
  if (limpio.error) return limpio;
  const orden = limpio.orden;
  const ya = await db.prepare(
    `SELECT id FROM mipos_ordenes
     WHERE clave_id=? AND estado='pendiente' AND tipo=? AND codigo=? AND nombre=?`
  ).bind(claveId, orden.tipo, orden.codigo, orden.nombre).first();
  if (ya) return { error: 'Ya hay una corrección pendiente de este producto. Espera a que el computador la aplique.' };
  const cuenta = await db.prepare(
    `SELECT COUNT(*) AS n FROM mipos_ordenes WHERE clave_id=? AND estado='pendiente'`
  ).bind(claveId).first();
  if ((cuenta && cuenta.n) >= MAX_PENDIENTES) {
    return { error: 'Hay muchas correcciones en espera. Cuando el computador las aplique puedes pedir otra.' };
  }
  const info = await db.prepare(
    `INSERT INTO mipos_ordenes(clave_id, tipo, codigo, nombre, precio, delta, motivo, estado, detalle, creada)
     VALUES(?,?,?,?,?,?,?,'pendiente','',?)`
  ).bind(claveId, orden.tipo, orden.codigo, orden.nombre, orden.precio, orden.delta, orden.motivo, ahora()).run();
  return { id: info.meta.last_row_id };
}

export async function listarParaDueno(db, claveId) {
  const filas = await db.prepare(
    `SELECT id, tipo, codigo, nombre, precio, delta, motivo, estado, detalle, creada
     FROM mipos_ordenes WHERE clave_id=? ORDER BY id DESC LIMIT 15`
  ).bind(claveId).all();
  return (filas.results || []).map(segura).filter(Boolean);
}

function idOrden(valor) {
  const n = entero(valor, 2_000_000_000, 1);
  return n;
}

export async function sincronizar(db, claveId, confirmar) {
  const corte = new Date(Date.now() - 30 * 86400000).toISOString();
  await db.prepare(`DELETE FROM mipos_ordenes WHERE estado!='pendiente' AND creada < ?`).bind(corte).run();
  const hechas = [];
  const lista = Array.isArray(confirmar) ? confirmar.slice(0, 50) : [];
  for (const c of lista) {
    if (!c || typeof c !== 'object') continue;
    const id = idOrden(c.id);
    if (!id) continue;
    if (c.resultado !== 'aplicada' && c.resultado !== 'rechazada') continue;
    const row = await db.prepare('SELECT clave_id, estado FROM mipos_ordenes WHERE id=?').bind(id).first();
    if (row && Number(row.clave_id) !== Number(claveId)) continue;
    if (row && row.estado === 'pendiente') {
      await db.prepare(
        `UPDATE mipos_ordenes SET estado=?, detalle=?, aplicada=? WHERE id=? AND clave_id=? AND estado='pendiente'`
      ).bind(c.resultado, texto(c.detalle, 200), ahora(), id, claveId).run();
    }
    hechas.push(id);
  }
  const filas = await db.prepare(
    `SELECT id, tipo, codigo, nombre, precio, delta, motivo
     FROM mipos_ordenes WHERE clave_id=? AND estado='pendiente' ORDER BY id LIMIT 20`
  ).bind(claveId).all();
  return {
    ordenes: (filas.results || []).map(f => ({
      id: Number(f.id),
      tipo: f.tipo === 'stock' || f.tipo === 'nombre' ? f.tipo : 'precio',
      codigo: texto(f.codigo, 40),
      nombre: texto(f.nombre, 80),
      precio: f.precio == null ? null : Number(f.precio),
      delta: f.delta == null ? null : Number(f.delta),
      motivo: texto(f.motivo, 120),
    })),
    confirmadas: hechas,
  };
}
