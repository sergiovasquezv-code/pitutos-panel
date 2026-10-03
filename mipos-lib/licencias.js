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
