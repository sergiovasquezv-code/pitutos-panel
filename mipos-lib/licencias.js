// Lógica compartida del servidor de licencias de MiPOS (Cloudflare Pages Functions + D1).
// Firma las licencias con Ed25519 usando la MISMA clave privada que herramientas_licencia
// (secreto MIPOS_CLAVE_PRIVADA = primera línea de MI_CLAVE_PRIVADA.txt). MiPOS solo trae la pública.

const enc = new TextEncoder();
export const PREFIJO = 'MIPOS1';
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin 0/O ni 1/I, para que se dicte sin confusiones

// ------------------------------------------------------------------ utilidades
export const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
export const error = (status, mensaje, extra = {}) => json({ error: mensaje, ...extra }, status);

export function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const ahora = () => new Date().toISOString();
export const fechaCL = f => f ? `${f.slice(8, 10)}-${f.slice(5, 7)}-${f.slice(0, 4)}` : '';

export function normalizarEquipo(txt) {
  const t = String(txt || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length === 16 ? t.match(/.{4}/g).join('-') : null;
}
export function normalizarClave(txt) {
  let t = String(txt || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith('MIPOS')) t = t.slice(5);
  return t.length === 12 ? 'MIPOS-' + t.match(/.{4}/g).join('-') : null;
}
export function claveNueva() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  const t = [...r].map(b => ALFABETO[b % 32]).join('');
  return 'MIPOS-' + t.match(/.{4}/g).join('-');
}
export const texto = (v, max = 120) => String(v ?? '').trim().slice(0, max);

export function base(env) {
  const db = env.MIPOS_DB || env.DB;
  if (!db) throw new Error('No encuentro la base D1: enlázala como DB o MIPOS_DB en Cloudflare');
  return db;
}
export const diasPrueba = env => Math.max(0, parseInt(env.MIPOS_DIAS_PRUEBA ?? '15', 10) || 0);
export const diasSinInternet = env => Math.max(7, parseInt(env.MIPOS_DIAS_SIN_INTERNET ?? '60', 10) || 60);

let tablasListas = false;
export async function asegurarTablas(db) {
  if (tablasListas) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_claves (id INTEGER PRIMARY KEY AUTOINCREMENT, clave TEXT NOT NULL UNIQUE, cliente TEXT NOT NULL, contacto TEXT NOT NULL DEFAULT '', cajas INTEGER NOT NULL DEFAULT 1, vence TEXT, max_equipos INTEGER NOT NULL DEFAULT 1, estado TEXT NOT NULL DEFAULT 'activa', notas TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_activaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, clave_id INTEGER NOT NULL, equipo TEXT NOT NULL, nombre_pc TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'activa', creado TEXT NOT NULL, ultimo_contacto TEXT, UNIQUE(clave_id, equipo))"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_pruebas (equipo TEXT PRIMARY KEY, inicio TEXT NOT NULL, nombre_pc TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', ultimo_contacto TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, tipo TEXT NOT NULL, clave_id INTEGER, equipo TEXT, detalle TEXT NOT NULL DEFAULT '')"),
  ]);
  tablasListas = true;
}
export function anotar(db, tipo, { clave_id = null, equipo = null, detalle = '' } = {}) {
  return db.prepare('INSERT INTO mipos_eventos(fecha, tipo, clave_id, equipo, detalle) VALUES(?,?,?,?,?)')
    .bind(ahora(), tipo, clave_id, equipo, String(detalle).slice(0, 500)).run();
}

export async function leerCuerpo(request) {
  try { const d = await request.json(); return d && typeof d === 'object' ? d : {}; } catch (e) { return {}; }
}

// ------------------------------------------------------------------ firma Ed25519
function hexABytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const ordenar = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));

let llave = null, llaveDe = null;
async function clavePrivada(env) {
  const semilla = String(env.MIPOS_CLAVE_PRIVADA || '').trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(semilla)) throw new Error('Falta el secreto MIPOS_CLAVE_PRIVADA (los 64 caracteres de MI_CLAVE_PRIVADA.txt)');
  if (llave && llaveDe === semilla) return llave;
  // PKCS#8 de Ed25519 = cabecera fija + los 32 bytes de la semilla
  llave = await crypto.subtle.importKey('pkcs8', hexABytes('302e020100300506032b657004220420' + semilla), { name: 'Ed25519' }, false, ['sign']);
  llaveDe = semilla;
  return llave;
}
export async function firmarLicencia(env, lic) {
  const datos = enc.encode(JSON.stringify(ordenar(lic)));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, await clavePrivada(env), datos));
  return `${PREFIJO}.${b64url(datos)}.${b64url(firma)}`;
}

// Licencia de una clave de producto: vence al terminar el contrato o, si es antes, cuando el PC lleve
// MIPOS_DIAS_SIN_INTERNET días sin conectarse (cada conexión la renueva sola).
export function licenciaDeClave(env, clave, equipo) {
  const tope = sumarDias(hoy(), diasSinInternet(env));
  return {
    v: 1, id: equipo, k: clave.id, tipo: 'clave', cliente: clave.cliente, cajas: clave.cajas,
    emitida: hoy(), contrato: clave.vence || null, vence: clave.vence && clave.vence < tope ? clave.vence : tope,
  };
}
export function licenciaDePrueba(env, prueba) {
  return { v: 1, id: prueba.equipo, tipo: 'prueba', cliente: 'Prueba gratis', cajas: 1, emitida: hoy(),
           vence: sumarDias(prueba.inicio, diasPrueba(env) - 1) };
}

// Revisa si la clave sirve hoy; devuelve el mensaje de error o null
export function problemaClave(clave) {
  if (!clave) return 'Esa clave de producto no existe. Revísala (son 12 letras y números) o pide ayuda a tu proveedor.';
  if (clave.estado !== 'activa') return 'Esta clave está suspendida. Comunícate con tu proveedor de MiPOS.';
  if (clave.vence && clave.vence < hoy()) return `Esta clave venció el ${fechaCL(clave.vence)}. Comunícate con tu proveedor para renovarla.`;
  return null;
}

// ================================================================== VENTA AUTOMÁTICA (Mercado Pago)
// Secretos: MP_ACCESS_TOKEN (Mercado Pago), RESEND_API_KEY + EMAIL_REMITENTE (correo), EMAIL_NOTIFICACIONES (aviso a ti).
export const TERMINOS_VERSION = '2026-10-03';
const mpApi = env => (env.MIPOS_MP_API || 'https://api.mercadopago.com').replace(/\/$/, '');
const resendApi = env => (env.MIPOS_RESEND_API || 'https://api.resend.com').replace(/\/$/, '');

export function sumarMeses(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z');
  const dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}
export const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tablasVenta = false;
export async function asegurarTablasVenta(db) {
  await asegurarTablas(db);
  if (tablasVenta) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_planes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, descripcion TEXT NOT NULL DEFAULT '', meses INTEGER NOT NULL DEFAULT 1, cajas INTEGER NOT NULL DEFAULT 1, precio INTEGER NOT NULL, destacado INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_compras (id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, plan_id INTEGER, plan_nombre TEXT NOT NULL, precio INTEGER NOT NULL, meses INTEGER NOT NULL, cajas INTEGER NOT NULL, nombre TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', equipo TEXT, clave_id INTEGER, renovacion INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'pendiente', mp_preferencia TEXT, mp_pago TEXT, mp_detalle TEXT, terminos_version TEXT NOT NULL, terminos_aceptados TEXT NOT NULL, ip TEXT, creado TEXT NOT NULL, pagado TEXT, vence_resultado TEXT, correo TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_recordatorios (clave_id INTEGER NOT NULL, vence TEXT NOT NULL, tipo TEXT NOT NULL, enviado TEXT NOT NULL, resultado TEXT, PRIMARY KEY (clave_id, vence, tipo))"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_config (clave TEXT PRIMARY KEY, valor TEXT)"),
  ]);
  try { await db.prepare("ALTER TABLE mipos_claves ADD COLUMN email TEXT NOT NULL DEFAULT ''").run(); } catch (e) { /* ya existe */ }
  tablasVenta = true;
}

export async function mp(env, metodo, ruta, cuerpo) {
  if (!env.MP_ACCESS_TOKEN) throw new Error('Falta el secreto MP_ACCESS_TOKEN (Mercado Pago)');
  const r = await fetch(mpApi(env) + ruta, {
    method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json',
               ...(metodo === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}: ${d.message || d.error || ''}`);
  return d;
}

export async function correo(env, para, asunto, html) {
  if (!env.RESEND_API_KEY || !env.EMAIL_REMITENTE || !para) return 'sin configurar';
  try {
    const r = await fetch(resendApi(env) + '/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_REMITENTE, to: [para], subject: asunto, html }),
    });
    return r.ok ? 'enviado' : `error ${r.status}`;
  } catch (e) { return 'error ' + e.message; }
}

// Activación vigente de un PC (la de la licencia que vence más tarde)
export async function claveDeEquipo(db, equipo) {
  return db.prepare("SELECT c.* FROM mipos_activaciones a JOIN mipos_claves c ON c.id=a.clave_id WHERE a.equipo=? AND a.estado='activa' " +
    "ORDER BY c.estado='activa' DESC, COALESCE(c.vence,'9999-12-31') DESC LIMIT 1").bind(equipo).first();
}

// Pago aprobado y verificado: crea o renueva la clave, activa el PC y avisa por correo. Idempotente.
export async function cumplirCompra(db, env, compra, pago) {
  const r = await db.prepare("UPDATE mipos_compras SET estado='procesando', mp_pago=?, pagado=? WHERE id=? AND estado='pendiente'")
    .bind(String(pago.id), ahora(), compra.id).run();
  if (!r.meta.changes) return db.prepare('SELECT * FROM mipos_compras WHERE id=?').bind(compra.id).first();  // ya se procesó
  let clave = compra.clave_id ? await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(compra.clave_id).first() : null;
  if (!clave && compra.equipo) clave = await claveDeEquipo(db, compra.equipo);
  const base = clave && clave.vence && clave.vence > hoy() ? clave.vence : hoy();
  const vence = sumarMeses(base, compra.meses);
  if (clave) {
    await db.prepare("UPDATE mipos_claves SET vence=?, cajas=?, estado='activa', email=CASE WHEN email='' THEN ? ELSE email END WHERE id=?").bind(vence, compra.cajas, compra.email, clave.id).run();
    await anotar(db, 'renovacion_pagada', { clave_id: clave.id, equipo: compra.equipo, detalle: `${compra.plan_nombre} · ${clp(compra.precio)} · vence ${fechaCL(vence)}` });
  } else {
    let id = null;
    for (let i = 0; i < 5 && !id; i++) {
      try {
        const ins = await db.prepare('INSERT INTO mipos_claves(clave, cliente, contacto, cajas, vence, max_equipos, notas, creado, email) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(claveNueva(), compra.nombre, compra.telefono || compra.email, compra.cajas, vence, 1, 'Compra web', ahora(), compra.email).run();
        id = ins.meta.last_row_id;
      } catch (e) { if (!/UNIQUE/i.test(e.message)) throw e; }
    }
    clave = { id };
    await anotar(db, 'compra_pagada', { clave_id: id, equipo: compra.equipo, detalle: `${compra.nombre} · ${compra.plan_nombre} · ${clp(compra.precio)}` });
  }
  if (compra.equipo) {  // compró desde MiPOS: ese PC queda activado solo
    await db.prepare("INSERT INTO mipos_activaciones(clave_id, equipo, nombre_pc, version, creado, ultimo_contacto, estado) VALUES(?,?,?,?,?,?, 'activa') " +
      "ON CONFLICT(clave_id, equipo) DO UPDATE SET estado='activa'").bind(clave.id, compra.equipo, '', '', ahora(), null).run();
  }
  clave = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(clave.id).first();
  await db.prepare("UPDATE mipos_compras SET estado='aprobada', clave_id=?, vence_resultado=? WHERE id=?").bind(clave.id, vence, compra.id).run();
  const final = await db.prepare('SELECT * FROM mipos_compras WHERE id=?').bind(compra.id).first();
  const estadoCorreo = await correo(env, compra.email, compra.renovacion ? 'Tu licencia de MiPOS fue renovada' : 'Tu licencia de MiPOS', correoCliente(final, clave));
  await correo(env, env.EMAIL_NOTIFICACIONES, `Venta MiPOS: ${compra.nombre} · ${clp(compra.precio)}`,
    `<p><b>${escH(compra.nombre)}</b> (${escH(compra.email)}${compra.telefono ? ' · ' + escH(compra.telefono) : ''}) pagó <b>${clp(compra.precio)}</b> por ${escH(compra.plan_nombre)}.</p>
     <p>Clave ${escH(clave.clave)} · ${clave.cajas} caja(s) · vence ${fechaCL(vence)}${compra.renovacion ? ' (renovación)' : ''} · pago MP ${escH(pago.id)}.</p>
     <p>Recuerda emitir la boleta o factura de esta venta.</p>`);
  await db.prepare('UPDATE mipos_compras SET correo=? WHERE id=?').bind(estadoCorreo, compra.id).run();
  return { ...final, correo: estadoCorreo };
}

function correoCliente(compra, clave) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#161a2e">
  <h2 style="margin:0 0 8px">¡Gracias por tu compra, ${escH(compra.nombre)}!</h2>
  <p>${compra.renovacion ? 'Tu licencia de MiPOS quedó renovada.' : 'Esta es tu licencia de MiPOS.'}</p>
  <div style="font-family:Consolas,monospace;font-size:22px;letter-spacing:2px;text-align:center;padding:14px;border:2px dashed #ffd23f;border-radius:12px;background:#fffbea">${escH(clave.clave)}</div>
  <table style="margin:14px 0;font-size:14px"><tr><td style="color:#5f6580;padding-right:12px">Plan</td><td>${escH(compra.plan_nombre)}</td></tr>
    <tr><td style="color:#5f6580">Cajas</td><td>${clave.cajas}</td></tr><tr><td style="color:#5f6580">Válida hasta</td><td><b>${fechaCL(clave.vence)}</b></td></tr>
    <tr><td style="color:#5f6580">Pagado</td><td>${clp(compra.precio)} · pago Mercado Pago N° ${escH(compra.mp_pago)}</td></tr></table>
  ${compra.equipo ? '<p>Compraste desde MiPOS, así que <b>se activa solo</b> en ese computador (en unos segundos).</p>' : ''}
  <p><b>Para activarla en otro momento o en un PC nuevo:</b> abre MiPOS, escribe la clave donde dice “Clave de producto” y presiona <b>Activar</b>.</p>
  <p>Unos días antes del vencimiento MiPOS te avisará para renovar. Guarda este correo.</p>
</div>`;
}

// Revisa en Mercado Pago un pago (por id, o buscando la referencia) y, si está aprobado y cuadra, cumple la compra.
export async function revisarPago(db, env, { pagoId, compra }) {
  let pago;
  if (pagoId) pago = await mp(env, 'GET', `/v1/payments/${encodeURIComponent(pagoId)}`);
  else {
    const r = await mp(env, 'GET', `/v1/payments/search?external_reference=${encodeURIComponent(compra.ref)}&sort=date_created&criteria=desc`);
    pago = (r.results || []).find(p => p.status === 'approved') || (r.results || [])[0];
    if (!pago) return compra;
  }
  if (!compra) compra = await db.prepare('SELECT * FROM mipos_compras WHERE ref=?').bind(String(pago.external_reference || '')).first();
  if (!compra || compra.ref !== pago.external_reference) return compra;
  const cuadra = pago.status === 'approved' && (pago.currency_id || 'CLP') === 'CLP' && Number(pago.transaction_amount) >= compra.precio;
  if (pago.status === 'approved' && !cuadra) {
    await db.prepare("UPDATE mipos_compras SET mp_detalle=? WHERE id=?").bind(`Monto no cuadra: ${pago.transaction_amount} ${pago.currency_id}`, compra.id).run();
    return compra;
  }
  if (cuadra) return cumplirCompra(db, env, compra, pago);
  if (['rejected', 'cancelled'].includes(pago.status) && compra.estado === 'pendiente') {
    await db.prepare("UPDATE mipos_compras SET estado='rechazada', mp_pago=?, mp_detalle=? WHERE id=? AND estado='pendiente'")
      .bind(String(pago.id), pago.status_detail || pago.status, compra.id).run();
  }
  return db.prepare('SELECT * FROM mipos_compras WHERE id=?').bind(compra.id).first();
}

// ================================================================== RECORDATORIOS DE RENOVACIÓN (correo)
// Se revisan una vez al día, aprovechando cualquier conexión (MiPOS verifica cada 6 horas, o tu página de licencias):
// 7 días antes, 1 día antes y el día después de vencer. Cada aviso se envía una sola vez por fecha de vencimiento.
const diasEntre = (desde, hasta) => Math.round((new Date(hasta + 'T12:00:00Z') - new Date(desde + 'T12:00:00Z')) / 86400000);

export async function recordatoriosDelDia(db, env, origen, { forzar = false } = {}) {
  await asegurarTablasVenta(db);
  const hoyCL = hoy();
  if (!forzar) {
    const r = await db.prepare("INSERT INTO mipos_config(clave, valor) VALUES('recordatorios', ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor WHERE mipos_config.valor <> excluded.valor").bind(hoyCL).run();
    if (!r.meta.changes) return { omitido: 'ya se revisó hoy' };
  }
  const claves = (await db.prepare("SELECT * FROM mipos_claves WHERE estado='activa' AND vence IS NOT NULL AND vence >= ? AND vence <= ?")
    .bind(sumarDias(hoyCL, -3), sumarDias(hoyCL, 7)).all()).results;
  const resumen = { enviados: 0, sin_correo: [], revisados: claves.length };
  for (const k of claves) {
    const dias = diasEntre(hoyCL, k.vence);
    const tipo = dias < 0 ? 'vencida' : dias <= 1 ? '1d' : '7d';
    let email = k.email;
    if (!email) {
      const c = await db.prepare("SELECT email FROM mipos_compras WHERE clave_id=? AND estado='aprobada' ORDER BY id DESC LIMIT 1").bind(k.id).first();
      email = c ? c.email : '';
    }
    if (!email) { resumen.sin_correo.push(k.cliente); continue; }
    const nuevo = await db.prepare("INSERT OR IGNORE INTO mipos_recordatorios(clave_id, vence, tipo, enviado) VALUES(?,?,?,?)").bind(k.id, k.vence, tipo, ahora()).run();
    if (!nuevo.meta.changes) continue;  // ya se avisó
    const asunto = tipo === 'vencida' ? 'Tu licencia de MiPOS venció: renuévala para seguir vendiendo'
      : dias === 0 ? 'Tu licencia de MiPOS vence hoy' : dias === 1 ? 'Tu licencia de MiPOS vence mañana' : `Tu licencia de MiPOS vence en ${dias} días`;
    const res = await correo(env, email, asunto, correoRecordatorio(k, dias, `${origen}/mipos-comprar.html?clave=${encodeURIComponent(k.clave)}`));
    await db.prepare('UPDATE mipos_recordatorios SET resultado=? WHERE clave_id=? AND vence=? AND tipo=?').bind(res, k.id, k.vence, tipo).run();
    await anotar(db, 'recordatorio', { clave_id: k.id, detalle: `${asunto} · ${email} · ${res}` });
    if (res === 'enviado') resumen.enviados++;
  }
  return resumen;
}

function correoRecordatorio(k, dias, link) {
  const cuando = dias < 0 ? `venció el <b>${fechaCL(k.vence)}</b>` : dias === 0 ? '<b>vence hoy</b>' : dias === 1 ? '<b>vence mañana</b>' : `vence el <b>${fechaCL(k.vence)}</b> (en ${dias} días)`;
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#161a2e">
  <h2 style="margin:0 0 8px">Hola ${escH(k.cliente)}</h2>
  <p>Tu licencia de MiPOS ${cuando}.${dias < 0 ? ' MiPOS no permite vender hasta renovarla. <b>Tus datos están intactos</b> y vuelven apenas renuevas.' : ' Renuévala ahora y no tendrás interrupciones: los meses se suman desde tu fecha de vencimiento, así que no pierdes días.'}</p>
  <p style="text-align:center;margin:22px 0"><a href="${link}" style="background:#0063e6;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:10px;display:inline-block">Renovar ahora con Mercado Pago</a></p>
  <p>También puedes hacerlo desde MiPOS: <b>Ajustes → Licencia → Renovar o ampliar</b>. Se aplica sola en tu computador.</p>
  <p style="color:#5f6580;font-size:13px">Clave: ${escH(k.clave)} · ${k.cajas} caja(s). ¿Dudas? Responde este correo.</p></div>`;
}
