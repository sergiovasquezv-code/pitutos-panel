// Licencias de Comida. Misma idea que MiPOS y otra base: tablas comida_*,
// secreto COMIDA_CLAVE_PRIVADA y códigos COMIDA1. Una clave de MiPOS no abre Comida.

export const PREFIJO = 'COMIDA1';
export const CLAVE_PUBLICA = '04b70b95b7a03926a0988fbabc49e7a569eed4bc86dead6ede975bc74a9b0b8b';
const CABECERA_PKCS8 = '302e020100300506032b657004220420';

export function base(env) {
  const db = env.COMIDA_DB || env.MIPOS_DB || env.DB;
  if (!db) throw new Error('Falta la base D1 de Comida');
  return db;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function error(status, mensaje) {
  return json({ error: mensaje }, status);
}

export async function leerCuerpo(request) {
  try { return await request.json(); } catch { return {}; }
}

export function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

export function ahora() {
  return new Date().toISOString();
}

export function fechaCL(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}-${m}-${a}` : iso;
}

export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

export function sumarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const dia = Math.min(d, new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate());
  return new Date(Date.UTC(a, m - 1 + meses, dia)).toISOString().slice(0, 10);
}

export function texto(valor, max) {
  return String(valor == null ? '' : valor).trim().slice(0, max);
}

export function normalizarEquipo(valor) {
  const id = texto(valor, 19).toUpperCase();
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id) ? id : '';
}

export function normalizarClave(valor) {
  const limpio = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cuerpo = limpio.startsWith('COMIDA') ? limpio.slice(6) : limpio;
  if (!/^[A-Z0-9]{12}$/.test(cuerpo)) return '';
  return `COMIDA-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`;
}

export function claveNueva() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const cuerpo = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
  return `COMIDA-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`;
}

export function entero(valor, defecto, min, max) {
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, n));
}

export function diasPrueba(env) {
  const n = parseInt(env.COMIDA_DIAS_PRUEBA ?? '15', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 90) : 0;
}

export function pruebasPorConexion(env) {
  const n = parseInt(env.COMIDA_PRUEBAS_POR_IP ?? '3', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0;
}

function canonical(obj) {
  const claves = Object.keys(obj).sort();
  return JSON.stringify(Object.fromEntries(claves.map((k) => [k, obj[k]])));
}

function hexABytes(hex) {
  const limpio = String(hex || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(limpio)) throw new Error('COMIDA_CLAVE_PRIVADA debe ser 64 caracteres hex');
  const bytes = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(limpio.substr(i * 2, 2), 16);
  return bytes;
}

function bytesABase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64url(texto) {
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function claveEd25519(env) {
  const semilla = hexABytes(env.COMIDA_CLAVE_PRIVADA);
  const pkcs8 = new Uint8Array(16 + 32);
  for (let i = 0; i < 16; i++) pkcs8[i] = parseInt(CABECERA_PKCS8.substr(i * 2, 2), 16);
  pkcs8.set(semilla, 16);
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

function desde64(texto) {
  const limpio = String(texto || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = limpio + '='.repeat((4 - (limpio.length % 4)) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

export async function leerLicenciaFirmada(codigo) {
  const trozos = String(codigo || '').trim().split('.');
  if (trozos.length !== 3 || trozos[0] !== PREFIJO) return null;
  let cuerpo;
  let firma;
  try {
    cuerpo = desde64(trozos[1]);
    firma = desde64(trozos[2]);
  } catch { return null; }
  const cruda = hexABytes(CLAVE_PUBLICA);
  const clave = await crypto.subtle.importKey('raw', cruda, { name: 'Ed25519' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, clave, firma, cuerpo);
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(cuerpo)); } catch { return null; }
}

export async function firmarLicencia(env, datos) {
  const cuerpo = canonical(datos);
  const clave = await claveEd25519(env);
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, clave, new TextEncoder().encode(cuerpo)));
  return `${PREFIJO}.${base64url(cuerpo)}.${bytesABase64(firma)}`;
}

export async function asegurarTablas(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_claves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT NOT NULL UNIQUE,
      cliente TEXT NOT NULL DEFAULT '',
      contacto TEXT NOT NULL DEFAULT '',
      max_equipos INTEGER NOT NULL DEFAULT 1,
      vence TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'activa',
      notas TEXT NOT NULL DEFAULT '',
      creada TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_activaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave_id INTEGER NOT NULL,
      equipo TEXT NOT NULL,
      nombre_pc TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      activada TEXT NOT NULL DEFAULT '',
      ultimo_contacto TEXT NOT NULL DEFAULT '',
      UNIQUE(clave_id, equipo)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_pruebas (
      equipo TEXT PRIMARY KEY,
      inicio TEXT NOT NULL,
      nombre_pc TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      ultimo_contacto TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      clave TEXT NOT NULL DEFAULT '',
      equipo TEXT NOT NULL DEFAULT '',
      detalle TEXT NOT NULL DEFAULT ''
    )`),
  ]);
}

export async function anotar(db, tipo, { clave = '', equipo = '', detalle = '' } = {}) {
  await db.prepare('INSERT INTO comida_eventos(fecha, tipo, clave, equipo, detalle) VALUES(?,?,?,?,?)')
    .bind(ahora(), tipo, texto(clave, 40), texto(equipo, 19), texto(detalle, 200)).run();
}

export function exigirAdmin(request, env) {
  const esperado = String(env.COMIDA_ADMIN_CLAVE || '');
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!esperado || token !== esperado) return error(401, 'Clave de administrador incorrecta');
  return null;
}

export function armarLicencia(clave, equipo) {
  const datos = {
    v: 1,
    cliente: clave.cliente,
    id: equipo,
    emitida: hoy(),
    vence: clave.vence || '',
    tipo: 'completa',
    k: clave.id,
  };
  return datos;
}

export function licenciaDePrueba(env, prueba) {
  const dias = diasPrueba(env);
  return {
    v: 1,
    cliente: 'Prueba gratis',
    id: prueba.equipo,
    emitida: prueba.inicio,
    vence: sumarDias(prueba.inicio, Math.max(dias - 1, 0)),
    tipo: 'prueba',
  };
}

// ================================================================== VENTA (Mercado Pago) Y SOPORTE
// Usa los mismos secretos que MiPOS: MP_ACCESS_TOKEN, RESEND_API_KEY, EMAIL_REMITENTE, EMAIL_NOTIFICACIONES.
// El precio guardado en el plan es neto. Mercado Pago cobra ese neto más IVA 19%.
export const IVA_PORCIENTO = 19;
export const TERMINOS_VERSION = '2026-11-09';

export function precioConIva(neto) {
  const n = Math.round(Number(neto) || 0);
  return Math.round(n * (100 + IVA_PORCIENTO) / 100);
}

export const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mpApi = (env) => (env.COMIDA_MP_API || env.MIPOS_MP_API || 'https://api.mercadopago.com').replace(/\/$/, '');
const resendApi = (env) => (env.COMIDA_RESEND_API || env.MIPOS_RESEND_API || 'https://api.resend.com').replace(/\/$/, '');

let tablasVenta = false;
export async function asegurarTablasVenta(db) {
  await asegurarTablas(db);
  if (tablasVenta) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_planes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      meses INTEGER NOT NULL DEFAULT 1,
      equipos INTEGER NOT NULL DEFAULT 2,
      precio INTEGER NOT NULL,
      destacado INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      orden INTEGER NOT NULL DEFAULT 0,
      creado TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      plan_id INTEGER,
      plan_nombre TEXT NOT NULL,
      precio INTEGER NOT NULL,
      meses INTEGER NOT NULL,
      equipos INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL DEFAULT '',
      equipo TEXT,
      clave_id INTEGER,
      renovacion INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      mp_preferencia TEXT,
      mp_pago TEXT,
      mp_detalle TEXT,
      terminos_version TEXT NOT NULL DEFAULT '',
      terminos_aceptados TEXT NOT NULL DEFAULT '',
      ip TEXT,
      creado TEXT NOT NULL,
      pagado TEXT,
      vence_resultado TEXT,
      correo TEXT
    )`),
  ]);
  try { await db.prepare("ALTER TABLE comida_claves ADD COLUMN email TEXT NOT NULL DEFAULT ''").run(); } catch (e) { /* ya existe */ }
  const cuenta = await db.prepare('SELECT COUNT(*) AS n FROM comida_planes').first();
  if (!cuenta.n) {
    const planes = [
      ['Mensual', 'Plan mensual', 1, 2, 10000, 0, 1],
      ['Anual', 'Plan anual', 12, 2, 100000, 0, 2],
      ['Licencia perpetua', '', 0, 2, 200000, 1, 3],
    ];
    for (const p of planes) {
      await db.prepare('INSERT INTO comida_planes(nombre, descripcion, meses, equipos, precio, destacado, orden, creado) VALUES(?,?,?,?,?,?,?,?)')
        .bind(...p, ahora()).run();
    }
  }
  tablasVenta = true;
}

export async function mp(env, metodo, ruta, cuerpo) {
  if (!env.MP_ACCESS_TOKEN) throw new Error('Falta el secreto MP_ACCESS_TOKEN (Mercado Pago)');
  const r = await fetch(mpApi(env) + ruta, {
    method: metodo,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: {
      Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      ...(metodo === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}: ${d.message || d.error || ''}`);
  return d;
}

export async function correo(env, para, asunto, html) {
  if (!env.RESEND_API_KEY || !env.EMAIL_REMITENTE || !para) return 'sin configurar';
  try {
    const r = await fetch(resendApi(env) + '/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_REMITENTE, to: [para], subject: asunto, html }),
    });
    return r.ok ? 'enviado' : `error ${r.status}`;
  } catch (e) {
    return 'error ' + e.message;
  }
}

export async function claveDeEquipo(db, equipo) {
  return db.prepare(`SELECT c.* FROM comida_activaciones a JOIN comida_claves c ON c.id=a.clave_id
    WHERE a.equipo=? ORDER BY c.estado='activa' DESC, CASE WHEN c.vence='' THEN '9999-12-31' ELSE c.vence END DESC LIMIT 1`).bind(equipo).first();
}

export async function cumplirCompra(db, env, compra, pago) {
  const marca = await db.prepare("UPDATE comida_compras SET estado='procesando', mp_pago=?, pagado=? WHERE id=? AND estado='pendiente'")
    .bind(String(pago.id), ahora(), compra.id).run();
  if (!marca.meta.changes) return db.prepare('SELECT * FROM comida_compras WHERE id=?').bind(compra.id).first();
  let clave = compra.clave_id ? await db.prepare('SELECT * FROM comida_claves WHERE id=?').bind(compra.clave_id).first() : null;
  if (!clave && compra.equipo) clave = await claveDeEquipo(db, compra.equipo);
  const baseFecha = clave && clave.vence && clave.vence > hoy() ? clave.vence : hoy();
  const vence = compra.meses === 0 ? '' : sumarMeses(baseFecha, compra.meses);
  const vigencia = vence ? fechaCL(vence) : 'perpetua, sin vencimiento';
  if (clave) {
    await db.prepare("UPDATE comida_claves SET vence=?, max_equipos=?, estado='activa', email=CASE WHEN email='' THEN ? ELSE email END, contacto=CASE WHEN contacto='' THEN ? ELSE contacto END WHERE id=?")
      .bind(vence, compra.equipos, compra.email, compra.email, clave.id).run();
    await anotar(db, 'renovacion_pagada', { clave: clave.clave, equipo: compra.equipo || '', detalle: `${compra.plan_nombre} · ${clp(compra.precio)} · ${vigencia}` });
  } else {
    let id = null;
    let textoClave = '';
    for (let i = 0; i < 5 && !id; i++) {
      textoClave = claveNueva();
      try {
        const ins = await db.prepare('INSERT INTO comida_claves(clave, cliente, contacto, max_equipos, vence, estado, notas, creada, email) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(textoClave, compra.nombre, compra.telefono || compra.email, compra.equipos, vence, 'activa', 'Compra web', ahora(), compra.email).run();
        id = ins.meta.last_row_id;
      } catch (e) {
        if (!/UNIQUE/i.test(e.message)) throw e;
      }
    }
    clave = { id, clave: textoClave };
    await anotar(db, 'compra_pagada', { clave: textoClave, equipo: compra.equipo || '', detalle: `${compra.nombre} · ${compra.plan_nombre} · ${clp(compra.precio)}` });
  }
  if (compra.equipo) {
    const ya = await db.prepare('SELECT id FROM comida_activaciones WHERE clave_id=? AND equipo=?').bind(clave.id, compra.equipo).first();
    if (!ya) {
      await db.prepare('INSERT INTO comida_activaciones(clave_id, equipo, nombre_pc, version, activada, ultimo_contacto) VALUES(?,?,?,?,?,?)')
        .bind(clave.id, compra.equipo, '', '', ahora(), ahora()).run();
    }
  }
  clave = await db.prepare('SELECT * FROM comida_claves WHERE id=?').bind(clave.id).first();
  await db.prepare("UPDATE comida_compras SET estado='aprobada', clave_id=?, vence_resultado=? WHERE id=?").bind(clave.id, vence, compra.id).run();
  const final = await db.prepare('SELECT * FROM comida_compras WHERE id=?').bind(compra.id).first();
  const estadoCorreo = await correo(env, compra.email, compra.renovacion ? 'Tu licencia de Comida fue renovada' : 'Tu licencia de Comida', correoCliente(final, clave));
  await correo(env, env.EMAIL_NOTIFICACIONES, `Venta Comida: ${compra.nombre} · ${clp(compra.precio)}`,
    `<p><b>${escH(compra.nombre)}</b> (${escH(compra.email)}) pagó <b>${clp(compra.precio)}</b> con IVA incluido por ${escH(compra.plan_nombre)}.</p>
     <p>Clave ${escH(clave.clave)} · ${clave.max_equipos} equipo(s) · ${vigencia} · pago MP ${escH(pago.id)}.</p>
     <p>Recuerda emitir la boleta o factura de esta venta.</p>`);
  await db.prepare('UPDATE comida_compras SET correo=? WHERE id=?').bind(estadoCorreo, compra.id).run();
  return { ...final, correo: estadoCorreo };
}

function correoCliente(compra, clave) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2a2118">
  <h2 style="margin:0 0 8px">Gracias por tu compra, ${escH(compra.nombre)}</h2>
  <p>${compra.renovacion ? 'Tu licencia de Comida quedó renovada.' : 'Esta es tu licencia de Comida.'}</p>
  <div style="font-family:Consolas,monospace;font-size:22px;letter-spacing:2px;text-align:center;padding:14px;border:2px dashed #8c4a2f;border-radius:12px;background:#fff8f1">${escH(clave.clave)}</div>
  <table style="margin:14px 0;font-size:14px"><tr><td style="color:#6d6256;padding-right:12px">Plan</td><td>${escH(compra.plan_nombre)}</td></tr>
    <tr><td style="color:#6d6256">Equipos</td><td>${clave.max_equipos}</td></tr>
    <tr><td style="color:#6d6256">Vigencia</td><td><b>${clave.vence ? fechaCL(clave.vence) : 'Perpetua, sin vencimiento'}</b></td></tr>
    <tr><td style="color:#6d6256">Pagado</td><td>${clp(compra.precio)} con IVA incluido</td></tr></table>
  <p>En Comida, escribe esta clave donde dice “Clave de producto” y presiona <b>Activar con clave</b>. Si pagaste desde el programa, se activa sola.</p>
  <p>Guarda este correo.</p></div>`;
}

export async function revisarPago(db, env, { pagoId, compra }) {
  let pago;
  if (pagoId) pago = await mp(env, 'GET', `/v1/payments/${encodeURIComponent(pagoId)}`);
  else {
    const r = await mp(env, 'GET', `/v1/payments/search?external_reference=${encodeURIComponent(compra.ref)}&sort=date_created&criteria=desc`);
    pago = (r.results || []).find((p) => p.status === 'approved') || (r.results || [])[0];
    if (!pago) return compra;
  }
  if (!compra) compra = await db.prepare('SELECT * FROM comida_compras WHERE ref=?').bind(String(pago.external_reference || '')).first();
  if (!compra || compra.ref !== pago.external_reference) return compra;
  const cuadra = pago.status === 'approved' && (pago.currency_id || 'CLP') === 'CLP' && Number(pago.transaction_amount) >= compra.precio;
  if (pago.status === 'approved' && !cuadra) {
    await db.prepare('UPDATE comida_compras SET mp_detalle=? WHERE id=?').bind(`Monto no cuadra: ${pago.transaction_amount} ${pago.currency_id}`, compra.id).run();
    return compra;
  }
  if (cuadra) return cumplirCompra(db, env, compra, pago);
  if (['rejected', 'cancelled'].includes(pago.status) && compra.estado === 'pendiente') {
    await db.prepare("UPDATE comida_compras SET estado='rechazada', mp_pago=?, mp_detalle=? WHERE id=? AND estado='pendiente'")
      .bind(String(pago.id), pago.status_detail || pago.status, compra.id).run();
  }
  return db.prepare('SELECT * FROM comida_compras WHERE id=?').bind(compra.id).first();
}

let tablasSoporte = false;
export async function asegurarTablasSoporte(db) {
  await asegurarTablas(db);
  if (tablasSoporte) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      equipo TEXT,
      clave_id INTEGER,
      cliente TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'consulta',
      asunto TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'nuevo',
      creado TEXT NOT NULL,
      actualizado TEXT NOT NULL,
      sin_leer_cliente INTEGER NOT NULL DEFAULT 0,
      sin_leer_soporte INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comida_ticket_msgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      autor TEXT NOT NULL,
      texto TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL
    )`),
  ]);
  tablasSoporte = true;
}

export function correoCaso(t, mensaje, panel) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;color:#2a2118">
  <h2 style="margin:0 0 6px">Soporte Comida #${t.id}</h2>
  <p><b>${escH(t.cliente || 'Sin nombre')}</b> · ${escH(t.email)}</p>
  <blockquote style="border-left:4px solid #8c4a2f;margin:0;padding:8px 14px;background:#fff8f1;white-space:pre-wrap">${escH(mensaje)}</blockquote>
  <p><a href="${panel}/comida-licencias">Responder en Licencias Comida, pestaña Soporte</a></p></div>`;
}

export function correoRespuesta(t, mensaje) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#2a2118">
  <h2 style="margin:0 0 6px">Respuesta a tu caso #${t.id}</h2>
  <blockquote style="border-left:4px solid #8c4a2f;margin:0;padding:8px 14px;background:#fff8f1;white-space:pre-wrap">${escH(mensaje)}</blockquote>
  <p>También la ves en Comida, en Equipo y luego Soporte.</p></div>`;
}
