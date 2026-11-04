// Resumen corto del local: un total por día, los medios y el stock vigente.
// No guarda cada venta, ni clientes, ni teléfonos, ni la clave de producto.
import { ahora, hoy, sumarDias, texto } from './licencias.js';

export const MAX_STOCK = 2500;
export const DIAS_HISTORIAL = 90;
const MAX_CONSULTAS_HORA = 60;

export const SQL = {
  clave: 'SELECT id, cliente, estado, vence FROM mipos_claves WHERE clave=?',
  resumen: 'SELECT recibido, dia, total, ventas, medios, stock, negocio, stock_total, stock_incompleto FROM mipos_resumen WHERE clave_id=?',
  dias: 'SELECT dia, total FROM mipos_resumen_dias WHERE clave_id=? AND dia>=? ORDER BY dia DESC',
};

let tablasListas = false;

export function corteHistorial(fecha) {
  return sumarDias(fecha, -(DIAS_HISTORIAL - 1));
}

function entero(n, max, min = 0) {
  if (typeof n === 'boolean' || n == null || n === '') return null;
  const x = typeof n === 'string' ? Number(n.trim()) : n;
  if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) return null;
  return x;
}

function cantidadDe(n) {
  if (typeof n === 'boolean' || n == null || n === '') return null;
  const x = typeof n === 'string' ? Number(n.trim()) : n;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < -1_000_000 || x > 1_000_000) return null;
  return Math.round(x * 1000) / 1000;
}

function diaCercano(dia, fechaHoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const t = new Date(dia + 'T12:00:00Z').getTime();
  const h = new Date(fechaHoy + 'T12:00:00Z').getTime();
  return Math.abs(t - h) <= 86400000;
}

export function parseLista(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== 'string' || !valor) return [];
  try {
    const d = JSON.parse(valor);
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

function limpiarMedios(lista) {
  if (!Array.isArray(lista)) return { error: 'Los medios de pago no son válidos' };
  if (lista.length > 12) return { error: 'Hay demasiados medios de pago' };
  const mapa = new Map();
  for (const m of lista) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { error: 'Hay un medio de pago que no es válido' };
    const metodo = texto(m.metodo, 24).toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(metodo)) return { error: 'Hay un medio de pago que no es válido' };
    const monto = entero(m.monto, 1_000_000_000_000);
    if (monto == null) return { error: 'Hay un monto de pago que no es válido' };
    if (!monto) continue;
    mapa.set(metodo, (mapa.get(metodo) || 0) + monto);
  }
  return { medios: [...mapa].map(([metodo, monto]) => ({ metodo, monto })) };
}

function limpiarStock(lista) {
  if (!Array.isArray(lista)) return { error: 'El stock no es válido' };
  if (lista.length > MAX_STOCK) return { error: 'Hay demasiados productos en el resumen' };
  const stock = [];
  for (const p of lista) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'Hay un producto del stock que no es válido' };
    const nombre = texto(p.nombre, 80);
    const codigo = texto(p.codigo, 40);
    const precio = entero(p.precio, 100_000_000);
    const cantidad = cantidadDe(p.cantidad);
    if (!nombre || precio == null || cantidad == null) return { error: 'Hay un producto del stock que no es válido' };
    stock.push({ codigo, nombre, precio, cantidad });
  }
  return { stock };
}

export function limpiarResumen(d, fechaHoy) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'El resumen está vacío' };
  if (JSON.stringify(d).includes('SQLite format')) return { error: 'El resumen no puede llevar la base de datos' };
  const dia = texto(d.dia, 10);
  if (!diaCercano(dia, fechaHoy)) return { error: 'La fecha del resumen no corresponde' };
  const total = entero(d.total, 1_000_000_000_000);
  if (total == null) return { error: 'El total del día no es válido' };
  const ventas = d.ventas == null ? 0 : entero(d.ventas, 10_000_000);
  if (ventas == null) return { error: 'La cantidad de ventas no es válida' };
  const medios = limpiarMedios(d.medios);
  if (medios.error) return medios;
  const stock = limpiarStock(d.stock);
  if (stock.error) return stock;
  const stockTotal = d.stock_total == null ? stock.stock.length : entero(d.stock_total, 1_000_000);
  if (stockTotal == null || stockTotal < stock.stock.length) return { error: 'El stock del resumen no es válido' };
  return {
    resumen: {
      dia,
      negocio: texto(d.negocio, 80),
      total,
      ventas,
      medios: medios.medios,
      stock: stock.stock,
      stock_total: stockTotal,
      stock_incompleto: d.stock_incompleto === true || d.stock_incompleto === 1,
    },
  };
}

export function vistaLocal(clave, fila, dias) {
  const negocio = texto((fila && fila.negocio) || (clave && clave.cliente) || 'Mi local', 80) || 'Mi local';
  const historial = [];
  for (const d of dias || []) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.dia || ''))) continue;
    const total = Number(d.total);
    if (!Number.isInteger(total)) continue;
    historial.push({ dia: d.dia, total });
  }
  if (!fila) {
    return {
      negocio, recibido: null, dia: null, total: null, ventas: 0,
      medios: [], stock: [], stock_total: 0, stock_incompleto: false,
      historial, sin_datos: true,
    };
  }
  const medios = parseLista(fila.medios).filter(m => m && typeof m === 'object' && !Array.isArray(m)).map(m => ({
    metodo: texto(m.metodo, 24),
    monto: Number.isInteger(Number(m.monto)) ? Number(m.monto) : 0,
  }));
  const stock = parseLista(fila.stock).filter(p => p && typeof p === 'object' && !Array.isArray(p)).map(p => ({
    codigo: texto(p.codigo, 40),
    nombre: texto(p.nombre, 80),
    precio: Number.isInteger(Number(p.precio)) ? Number(p.precio) : 0,
    cantidad: cantidadDe(p.cantidad) ?? 0,
  }));
  const total = Number(fila.total);
  const ventas = Number(fila.ventas);
  return {
    negocio,
    recibido: typeof fila.recibido === 'string' ? fila.recibido : null,
    dia: typeof fila.dia === 'string' ? fila.dia : null,
    total: Number.isInteger(total) ? total : 0,
    ventas: Number.isInteger(ventas) ? ventas : 0,
    medios,
    stock,
    stock_total: Number.isInteger(Number(fila.stock_total)) ? Number(fila.stock_total) : stock.length,
    stock_incompleto: fila.stock_incompleto === true || fila.stock_incompleto === 1,
    historial,
    sin_datos: false,
  };
}

export async function asegurarResumen(db) {
  if (tablasListas) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_resumen (
      clave_id INTEGER PRIMARY KEY,
      recibido TEXT NOT NULL,
      dia TEXT NOT NULL,
      total INTEGER NOT NULL,
      ventas INTEGER NOT NULL DEFAULT 0,
      medios TEXT NOT NULL,
      stock TEXT NOT NULL,
      negocio TEXT NOT NULL DEFAULT '',
      stock_total INTEGER NOT NULL DEFAULT 0,
      stock_incompleto INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_resumen_dias (
      clave_id INTEGER NOT NULL,
      dia TEXT NOT NULL,
      total INTEGER NOT NULL,
      PRIMARY KEY (clave_id, dia)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_resumen_consultas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      fecha TEXT NOT NULL
    )`),
  ]);
  tablasListas = true;
}

export async function guardarResumen(db, claveId, resumen) {
  const corte = corteHistorial(hoy());
  await db.batch([
    db.prepare(`INSERT INTO mipos_resumen(clave_id, recibido, dia, total, ventas, medios, stock, negocio, stock_total, stock_incompleto)
      VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(clave_id) DO UPDATE SET
        recibido=excluded.recibido, dia=excluded.dia, total=excluded.total, ventas=excluded.ventas,
        medios=excluded.medios, stock=excluded.stock, negocio=excluded.negocio,
        stock_total=excluded.stock_total, stock_incompleto=excluded.stock_incompleto`)
      .bind(claveId, ahora(), resumen.dia, resumen.total, resumen.ventas,
        JSON.stringify(resumen.medios), JSON.stringify(resumen.stock), resumen.negocio,
        resumen.stock_total, resumen.stock_incompleto ? 1 : 0),
    db.prepare(`INSERT INTO mipos_resumen_dias(clave_id, dia, total) VALUES(?,?,?)
      ON CONFLICT(clave_id, dia) DO UPDATE SET total=excluded.total`)
      .bind(claveId, resumen.dia, resumen.total),
    db.prepare('DELETE FROM mipos_resumen_dias WHERE dia < ?').bind(corte),
  ]);
}

export async function consultarDeMas(db, ip) {
  const momento = ahora();
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const viejo = new Date(Date.now() - 2 * 86400_000).toISOString();
  await db.prepare('DELETE FROM mipos_resumen_consultas WHERE fecha < ?').bind(viejo).run();
  const n = await db.prepare('SELECT COUNT(*) AS n FROM mipos_resumen_consultas WHERE ip=? AND fecha>=?').bind(ip, desde).first();
  if ((n && n.n) >= MAX_CONSULTAS_HORA) return true;
  await db.prepare('INSERT INTO mipos_resumen_consultas(ip, fecha) VALUES(?,?)').bind(ip, momento).run();
  return false;
}
