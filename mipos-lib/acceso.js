// Correo y contraseña que el dueño escribe él, si quiere.
// La clave de producto sigue sirviendo aunque no los guarde.
import { ahora, texto } from './licencias.js';

export const ITERACIONES = 20000;
const FALLOS_HORA = 8;
const DIAS_SESION = 30;
const enc = new TextEncoder();

let tablasListas = false;

export function correoValido(valor) {
  const correo = String(valor || '').trim().toLowerCase();
  if (correo.length < 6 || correo.length > 120) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return '';
  return correo;
}

function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesDe(textoHex) {
  const out = new Uint8Array(textoHex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(textoHex.substr(i * 2, 2), 16);
  return out;
}

function igual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}

async function derivar(clave, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERACIONES, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashClave(clave) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivar(clave, salt);
  return `pbkdf2$${ITERACIONES}$${hex(salt)}$${hex(bits)}`;
}

export async function verificarClave(clave, guardado) {
  try {
    const partes = String(guardado || '').split('$');
    if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;
    const vueltas = Number(partes[1]);
    if (vueltas !== ITERACIONES || partes[2].length !== 32 || partes[3].length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: bytesDe(partes[2]), iterations: vueltas, hash: 'SHA-256' },
      key,
      256,
    );
    return igual(hex(new Uint8Array(bits)), partes[3]);
  } catch (e) {
    return false;
  }
}

async function sha256(valor) {
  const bits = await crypto.subtle.digest('SHA-256', enc.encode(valor));
  return hex(new Uint8Array(bits));
}

export function problemaContrasena(clave, claveProducto) {
  const textoClave = String(clave ?? '');
  if (textoClave.length < 8 || textoClave.length > 72) return 'La contraseña necesita entre 8 y 72 caracteres.';
  if (/\s/.test(textoClave) && textoClave.trim().length < 8) return 'La contraseña necesita entre 8 y 72 caracteres.';
  if (claveProducto && textoClave === claveProducto) return 'Usa una contraseña distinta de la clave de producto.';
  return '';
}

export async function asegurarAcceso(db) {
  if (tablasListas) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_acceso (
      clave_id INTEGER PRIMARY KEY,
      correo TEXT NOT NULL UNIQUE,
      clave_hash TEXT NOT NULL,
      creado TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_acceso_sesion (
      token_hash TEXT PRIMARY KEY,
      clave_id INTEGER NOT NULL,
      vence TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mipos_acceso_fallos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      fecha TEXT NOT NULL
    )`),
  ]);
  tablasListas = true;
}

export async function guardarAcceso(db, claveId, correo, contrasena, claveProducto) {
  const limpio = correoValido(correo);
  if (!limpio) return { error: 'Revisa el correo. Tiene que ser uno de verdad, por ejemplo tu@correo.cl.' };
  const problema = problemaContrasena(contrasena, claveProducto);
  if (problema) return { error: problema };
  const hash = await hashClave(contrasena);
  try {
    await db.prepare(
      `INSERT INTO mipos_acceso(clave_id, correo, clave_hash, creado) VALUES(?,?,?,?)
       ON CONFLICT(clave_id) DO UPDATE SET correo=excluded.correo, clave_hash=excluded.clave_hash, creado=excluded.creado`
    ).bind(claveId, limpio, hash, ahora()).run();
  } catch (e) {
    if (String(e && e.message || e).includes('UNIQUE')) {
      return { error: 'Ese correo ya está usado en otro local. Elige otro, o sigue entrando con la clave.' };
    }
    throw e;
  }
  return { correo: limpio };
}

export async function bloqueado(db, ip) {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const viejo = new Date(Date.now() - 2 * 86400000).toISOString();
  await db.prepare('DELETE FROM mipos_acceso_fallos WHERE fecha < ?').bind(viejo).run();
  const n = await db.prepare(
    'SELECT COUNT(*) AS n FROM mipos_acceso_fallos WHERE ip=? AND fecha>=?'
  ).bind(ip, desde).first();
  return !!n && n.n >= FALLOS_HORA;
}

export async function anotarFallo(db, ip) {
  await db.prepare('INSERT INTO mipos_acceso_fallos(ip, fecha) VALUES(?,?)').bind(texto(ip, 64) || 'local', ahora()).run();
}

export async function limpiarFallos(db, ip) {
  await db.prepare('DELETE FROM mipos_acceso_fallos WHERE ip=?').bind(ip).run();
}

export async function buscarPorCorreo(db, correo) {
  const limpio = correoValido(correo);
  if (!limpio) return null;
  return db.prepare('SELECT clave_id, correo, clave_hash FROM mipos_acceso WHERE correo=?').bind(limpio).first();
}

export async function crearSesion(db, claveId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const vence = new Date(Date.now() + DIAS_SESION * 86400000).toISOString();
  await db.prepare('DELETE FROM mipos_acceso_sesion WHERE vence < ?').bind(ahora()).run();
  await db.prepare('INSERT INTO mipos_acceso_sesion(token_hash, clave_id, vence) VALUES(?,?,?)')
    .bind(await sha256(token), claveId, vence).run();
  return token;
}

export async function leerSesion(db, token) {
  const crudo = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(crudo)) return null;
  await db.prepare('DELETE FROM mipos_acceso_sesion WHERE vence < ?').bind(ahora()).run();
  const fila = await db.prepare('SELECT clave_id, vence FROM mipos_acceso_sesion WHERE token_hash=?')
    .bind(await sha256(crudo)).first();
  if (!fila || String(fila.vence) < ahora()) return null;
  return { clave_id: Number(fila.clave_id) };
}

export async function correoDe(db, claveId) {
  const fila = await db.prepare('SELECT correo FROM mipos_acceso WHERE clave_id=?').bind(claveId).first();
  return fila && fila.correo ? texto(fila.correo, 120) : '';
}
