// POST /api/mipos/mi-local — el dueño entra con su clave y ve solo ese local.
// Si quiere, la primera vez guarda un correo y una contraseña. Si no, la clave sigue sirviendo.
import { base, error, hoy, json, leerCuerpo, normalizarClave, problemaClave, texto, asegurarTablas } from '../../../mipos-lib/licencias.js';
import { SQL, asegurarResumen, consultarDeMas, corteHistorial, vistaLocal } from '../../../mipos-lib/resumen.js';
import { asegurarOrdenes, crearOrden, listarParaDueno } from '../../../mipos-lib/ordenes.js';
import {
  asegurarAcceso, anotarFallo, bloqueado, buscarPorCorreo, correoDe, crearSesion, guardarAcceso,
  leerSesion, limpiarFallos, verificarClave,
} from '../../../mipos-lib/acceso.js';

const MENSAJE_CLAVE = 'Revisa la clave de producto. Son 12 letras y números, con el formato MIPOS-XXXX-XXXX-XXXX.';
const MENSAJE_CORREO = 'El correo o la contraseña no coinciden.';

function esEntradaCorreo(d) {
  return !!(d && d.correo && d.clave_acceso && !normalizarClave(d.clave) && !d.token && !d.accion);
}

async function clavePorId(db, id) {
  const clave = await db.prepare('SELECT id, cliente, estado, vence FROM mipos_claves WHERE id=?').bind(id).first();
  const problema = problemaClave(clave);
  if (problema) return { error: problema, status: 403 };
  return { fila: clave };
}

async function claveDe(db, d) {
  const claveTxt = normalizarClave(d.clave);
  if (claveTxt) {
    const clave = await db.prepare(SQL.clave).bind(claveTxt).first();
    const problema = problemaClave(clave);
    if (problema) return { error: problema, status: 403 };
    return { fila: clave, claveTxt };
  }
  if (d.token) {
    const sesion = await leerSesion(db, d.token);
    if (!sesion) return { error: 'La entrada venció. Entra de nuevo con tu correo o con la clave.', status: 401 };
    return clavePorId(db, sesion.clave_id);
  }
  return { error: MENSAJE_CLAVE, status: 400 };
}

async function armarVista(db, clave, dia = '') {
  const fila = await db.prepare(SQL.resumen).bind(clave.id).first();
  const dias = (await db.prepare(SQL.dias).bind(clave.id, corteHistorial(hoy())).all()).results || [];
  const vista = vistaLocal(clave, fila, dias, texto(dia, 10));
  const correo = await correoDe(db, clave.id);
  vista.acceso = correo ? { correo } : null;
  vista.pendientes = await listarParaDueno(db, clave.id);
  return vista;
}

async function entrarConCorreo(db, d, ip) {
  if (await bloqueado(db, ip)) return error(429, 'Demasiados intentos. Espera un momento y vuelve a entrar.');
  const acceso = await buscarPorCorreo(db, d.correo);
  const ok = acceso && await verificarClave(String(d.clave_acceso), acceso.clave_hash);
  if (!ok) {
    await anotarFallo(db, ip);
    return error(403, MENSAJE_CORREO);
  }
  const clave = await clavePorId(db, acceso.clave_id);
  if (clave.error) return error(clave.status, clave.error);
  await limpiarFallos(db, ip);
  const vista = await armarVista(db, clave.fila, d.dia);
  vista.token = await crearSesion(db, clave.fila.id);
  return json(vista);
}

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    await asegurarResumen(db);
    await asegurarOrdenes(db);
    await asegurarAcceso(db);
    const ip = texto(request.headers.get('CF-Connecting-IP') || 'local', 64) || 'local';
    if (await consultarDeMas(db, ip)) return error(429, 'Demasiados intentos. Espera un momento y vuelve a entrar.');
    const d = await leerCuerpo(request);
    if (esEntradaCorreo(d)) return entrarConCorreo(db, d, ip);
    const clave = await claveDe(db, d);
    if (clave.error) return error(clave.status, clave.error);
    let aviso = '';
    if (d.accion === 'guardar-acceso') {
      const guardado = await guardarAcceso(db, clave.fila.id, d.correo, d.clave_acceso, clave.claveTxt || '');
      if (guardado.error) return error(400, guardado.error);
      aviso = 'Listo. La próxima puedes entrar con ese correo. La clave de producto sigue sirviendo.';
    } else if (d.accion === 'precio' || d.accion === 'stock') {
      const orden = await crearOrden(db, clave.fila.id, d);
      if (orden.error) return error(400, orden.error);
      aviso = 'Quedó guardado. El computador del local lo aplica cuando tenga internet.';
    } else if (d.accion) {
      return error(400, 'Eso no se puede hacer desde aquí.');
    }
    const vista = await armarVista(db, clave.fila, d.dia);
    if (aviso) vista.aviso = aviso;
    return json(vista);
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
