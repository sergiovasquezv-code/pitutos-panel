// Resumen del local: el día como lo ve la caja, el historial de 90 días y el stock.
// Cada venta lleva folio, hora, cajero, cliente, líneas y, si está anulada, el motivo.
// No guarda teléfonos, direcciones, costos ni la clave de producto.
import { ahora, hoy, sumarDias, texto } from './licencias.js';

export const MAX_STOCK = 2500;
export const MAX_VENTAS = 200;
export const DIAS_HISTORIAL = 90;
const MAX_CONSULTAS_HORA = 60;

export const SQL = {
  clave: 'SELECT id, cliente, estado, vence FROM mipos_claves WHERE clave=?',
  resumen: 'SELECT recibido, dia, total, ventas, medios, stock, negocio, stock_total, stock_incompleto FROM mipos_resumen WHERE clave_id=?',
  dias: 'SELECT dia, total, detalle FROM mipos_resumen_dias WHERE clave_id=? AND dia>=? ORDER BY dia DESC',
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

function limpiarItems(lista) {
  if (!Array.isArray(lista)) return { error: 'Las líneas de una venta no son válidas' };
  const items = [];
  for (const it of lista.slice(0, 12)) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return { error: 'Hay una línea de venta que no es válida' };
    const nombre = texto(it.nombre, 80);
    const cantidad = cantidadDe(it.cantidad);
    const total = entero(it.total, 100_000_000_000, -100_000_000_000);
    if (!nombre || cantidad == null || total == null) return { error: 'Hay una línea de venta que no es válida' };
    items.push({ nombre, cantidad, total });
  }
  return { items };
}

function limpiarLista(lista) {
  if (lista == null) return { lista: [] };
  if (!Array.isArray(lista)) return { error: 'Las ventas del día no son válidas' };
  if (lista.length > MAX_VENTAS) return { error: 'Hay demasiadas ventas en el resumen' };
  const ventas = [];
  for (const v of lista) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Hay una venta que no es válida' };
    const folio = entero(v.folio, 10_000_000);
    const total = entero(v.total, 1_000_000_000_000);
    const devuelto = v.devuelto == null ? 0 : entero(v.devuelto, 1_000_000_000_000);
    const estado = v.estado === 'anulada' ? 'anulada' : 'completada';
    const hora = texto(v.hora, 5);
    if (folio == null || total == null || devuelto == null || (hora && !/^\d{2}:\d{2}$/.test(hora))) {
      return { error: 'Hay una venta que no es válida' };
    }
    const lineas = limpiarItems(v.items || []);
    if (lineas.error) return lineas;
    const metodos = [];
    for (const m of Array.isArray(v.metodos) ? v.metodos.slice(0, 6) : []) {
      const metodo = texto(m, 24).toLowerCase();
      if (!/^[a-z0-9_]{1,24}$/.test(metodo)) return { error: 'Hay un medio de pago que no es válido' };
      metodos.push(metodo);
    }
    const venta = {
      folio,
      hora,
      cajero: texto(v.cajero, 40),
      cliente: texto(v.cliente, 80),
      estado,
      total,
      devuelto,
      metodos,
      items: lineas.items,
    };
    const caja = texto(v.caja, 40);
    if (caja) venta.caja = caja;
    if (estado === 'anulada') {
      venta.anulada_hora = texto(v.anulada_hora, 5);
      venta.anulada_por = texto(v.anulada_por, 40);
      venta.motivo = texto(v.motivo, 120);
    }
    ventas.push(venta);
  }
  return { lista: ventas };
}

function limpiarProductos(lista) {
  if (lista == null) return { productos: [] };
  if (!Array.isArray(lista)) return { error: 'Los productos vendidos no son válidos' };
  if (lista.length > 200) return { error: 'Hay demasiados productos vendidos' };
  const productos = [];
  for (const p of lista) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'Hay un producto vendido que no es válido' };
    const nombre = texto(p.nombre, 80);
    const cantidad = cantidadDe(p.cantidad);
    const monto = entero(p.monto, 1_000_000_000_000, -1_000_000_000_000);
    if (!nombre || cantidad == null || monto == null) return { error: 'Hay un producto vendido que no es válido' };
    productos.push({ codigo: texto(p.codigo, 40), nombre, cantidad, monto });
  }
  return { productos };
}

function detalleDe(valor) {
  if (!valor) return {};
  if (typeof valor === 'object' && !Array.isArray(valor)) return valor;
  if (typeof valor !== 'string') return {};
  try {
    const obj = JSON.parse(valor);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch (e) {
    return {};
  }
}

function sumarDiasClave(dias, desde, hasta) {
  const mapa = new Map();
  let conDetalle = 0;
  for (const d of dias) {
    if (!d || d.dia < desde || d.dia > hasta) continue;
    const det = d.detalle || {};
    const productos = Array.isArray(det.productos) ? det.productos : [];
    if (productos.length) conDetalle += 1;
    for (const p of productos) {
      const llave = `${p.codigo}\n${p.nombre}`;
      const previo = mapa.get(llave) || { codigo: p.codigo, nombre: p.nombre, cantidad: 0, monto: 0 };
      previo.cantidad = Math.round((previo.cantidad + Number(p.cantidad || 0)) * 1000) / 1000;
      previo.monto += Number(p.monto || 0);
      mapa.set(llave, previo);
    }
  }
  return { filas: [...mapa.values()], conDetalle };
}

function ayudaDe(dias, dia, stock) {
  const previos = (dias || []).filter(d => d && d.dia < dia).slice(0, 7);
  const base = previos.filter(d => Number.isInteger(d.total));
  const promedio7 = base.length ? Math.round(base.reduce((a, d) => a + d.total, 0) / base.length) : null;
  const desde7 = sumarDias(dia, -6);
  const desde30 = sumarDias(dia, -29);
  const semana = sumarDiasClave(dias, desde7, dia);
  const mes = sumarDiasClave(dias, desde30, dia);
  const top = (filas, campo) => filas
    .filter(p => Number(p[campo]) > 0)
    .sort((a, b) => b[campo] - a[campo] || b.monto - a.monto)
    .slice(0, 5)
    .map(p => ({ codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad, monto: p.monto }));
  const vendidos30 = new Set(mes.filas.filter(p => p.cantidad > 0 || p.monto > 0).map(p => p.codigo || p.nombre));
  const vendidos7 = new Set(semana.filas.filter(p => p.cantidad > 0 || p.monto > 0).map(p => p.codigo || p.nombre));
  const quietos = (vendidos) => (stock || [])
    .filter(p => Number(p.cantidad) > 0 && !vendidos.has(p.codigo || p.nombre))
    .slice(0, 8)
    .map(p => ({ codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad }));
  return {
    promedio7,
    dias7: base.length,
    mas_plata: top(semana.filas, 'monto'),
    mas_unidades: top(semana.filas, 'cantidad'),
    sin_venta_7: mes.conDetalle || semana.conDetalle ? quietos(vendidos7) : [],
    sin_venta_30: mes.conDetalle ? quietos(vendidos30) : [],
  };
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
  const anuladas = d.anuladas == null ? 0 : entero(d.anuladas, 10_000_000);
  const devuelto = d.devuelto == null ? 0 : entero(d.devuelto, 1_000_000_000_000);
  if (anuladas == null || devuelto == null) return { error: 'El resumen del día no es válido' };
  const lista = limpiarLista(d.lista);
  if (lista.error) return lista;
  const productos = limpiarProductos(d.productos);
  if (productos.error) return productos;
  return {
    resumen: {
      dia,
      negocio: texto(d.negocio, 80),
      total,
      ventas,
      anuladas,
      devuelto,
      medios: medios.medios,
      lista: lista.lista,
      productos: productos.productos,
      stock: stock.stock,
      stock_total: stockTotal,
      stock_incompleto: d.stock_incompleto === true || d.stock_incompleto === 1,
    },
  };
}

function vistaDia(det) {
  const lista = Array.isArray(det.lista) ? det.lista : [];
  const productos = Array.isArray(det.productos) ? det.productos : [];
  return {
    ventas: Number.isInteger(Number(det.ventas)) ? Number(det.ventas) : lista.filter(v => v.estado !== 'anulada').length,
    anuladas: Number.isInteger(Number(det.anuladas)) ? Number(det.anuladas) : lista.filter(v => v.estado === 'anulada').length,
    devuelto: Number.isInteger(Number(det.devuelto)) ? Number(det.devuelto) : 0,
    medios: Array.isArray(det.medios) ? det.medios : [],
    lista,
    productos,
    tiene_detalle: Array.isArray(det.lista),
  };
}

export function vistaLocal(clave, fila, dias, diaPedido = '') {
  const negocio = texto((fila && fila.negocio) || (clave && clave.cliente) || 'Mi local', 80) || 'Mi local';
  const historial = [];
  const diasDetalle = [];
  for (const d of dias || []) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.dia || ''))) continue;
    const total = Number(d.total);
    if (!Number.isInteger(total)) continue;
    const det = detalleDe(d.detalle);
    const vista = vistaDia(det);
    historial.push({ dia: d.dia, total, ventas: vista.ventas, anuladas: vista.anuladas });
    diasDetalle.push({ dia: d.dia, total, detalle: det });
  }
  if (!fila) {
    return {
      negocio, recibido: null, dia: null, total: null, ventas: 0, anuladas: 0, devuelto: 0,
      medios: [], lista: [], productos: [], tiene_detalle: false,
      stock: [], stock_total: 0, stock_incompleto: false,
      ayuda: ayudaDe(diasDetalle, '', []),
      historial, sin_datos: true,
    };
  }
  const stock = parseLista(fila.stock).filter(p => p && typeof p === 'object' && !Array.isArray(p)).map(p => ({
    codigo: texto(p.codigo, 40),
    nombre: texto(p.nombre, 80),
    precio: Number.isInteger(Number(p.precio)) ? Number(p.precio) : 0,
    cantidad: cantidadDe(p.cantidad) ?? 0,
  }));
  const pedido = /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) ? diaPedido : '';
  const elegido = diasDetalle.find(d => d.dia === pedido) || diasDetalle.find(d => d.dia === fila.dia) || null;
  const det = elegido ? elegido.detalle : {};
  const diaVista = vistaDia(det);
  const mediosFila = parseLista(fila.medios).filter(m => m && typeof m === 'object' && !Array.isArray(m)).map(m => ({
    metodo: texto(m.metodo, 24),
    monto: Number.isInteger(Number(m.monto)) ? Number(m.monto) : 0,
  }));
  const mismoDia = !elegido || elegido.dia === fila.dia;
  const totalDia = elegido ? elegido.total : (Number.isInteger(Number(fila.total)) ? Number(fila.total) : 0);
  return {
    negocio,
    recibido: typeof fila.recibido === 'string' ? fila.recibido : null,
    dia: elegido ? elegido.dia : (typeof fila.dia === 'string' ? fila.dia : null),
    total: totalDia,
    ventas: diaVista.tiene_detalle ? diaVista.ventas : (mismoDia && Number.isInteger(Number(fila.ventas)) ? Number(fila.ventas) : diaVista.ventas),
    anuladas: diaVista.anuladas,
    devuelto: diaVista.devuelto,
    medios: diaVista.medios.length ? diaVista.medios : (mismoDia ? mediosFila : []),
    lista: diaVista.lista,
    productos: diaVista.productos,
    tiene_detalle: diaVista.tiene_detalle,
    stock,
    stock_total: Number.isInteger(Number(fila.stock_total)) ? Number(fila.stock_total) : stock.length,
    stock_incompleto: fila.stock_incompleto === true || fila.stock_incompleto === 1,
    ayuda: ayudaDe(diasDetalle, elegido ? elegido.dia : String(fila.dia || ''), stock),
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
      detalle TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (clave_id, dia)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_resumen_consultas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      fecha TEXT NOT NULL
    )`),
  ]);
  try {
    await db.prepare("ALTER TABLE mipos_resumen_dias ADD COLUMN detalle TEXT NOT NULL DEFAULT ''").run();
  } catch (e) { /* la columna ya está */ }
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
    db.prepare(`INSERT INTO mipos_resumen_dias(clave_id, dia, total, detalle) VALUES(?,?,?,?)
      ON CONFLICT(clave_id, dia) DO UPDATE SET total=excluded.total, detalle=excluded.detalle`)
      .bind(claveId, resumen.dia, resumen.total, JSON.stringify({
        ventas: resumen.ventas,
        anuladas: resumen.anuladas || 0,
        devuelto: resumen.devuelto || 0,
        medios: resumen.medios,
        lista: resumen.lista || [],
        productos: resumen.productos || [],
      })),
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
