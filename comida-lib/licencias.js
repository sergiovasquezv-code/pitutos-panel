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
    vence: sumarDias(prueba.inicio, dias),
    tipo: 'prueba',
  };
}
