// /api/comida-admin/*  Administración de Comida. No lee ni escribe tablas de MiPOS.
import { anotar, asegurarTablas, ahora, base, claveNueva, entero, error, exigirAdmin, firmarLicencia,
  hoy, json, leerCuerpo, normalizarClave, normalizarEquipo, sumarMeses, texto } from '../../../comida-lib/licencias.js';

function archivo(nombre, datos) {
  return new Response(JSON.stringify(datos, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequest({ request, env, params }) {
  const denegado = exigirAdmin(request, env);
  if (denegado) return denegado;
  const db = base(env);
  await asegurarTablas(db);
  const ruta = Array.isArray(params.ruta) ? params.ruta.join('/') : String(params.ruta || '');
  const m = request.method;
  try {
    if (m === 'GET' && ruta === 'resumen') return json(await resumen(db));
    if (m === 'GET' && ruta === 'base') return archivo('comida-licencias.json', await baseCompleta(db));
    if (m === 'POST' && ruta === 'claves') return json(await crear(db, await leerCuerpo(request)));
    const clave = ruta.match(/^claves\/(\d+)$/);
    if (clave && m === 'POST') return json(await editar(db, Number(clave[1]), await leerCuerpo(request)));
    if (clave && m === 'DELETE') return json(await borrar(db, Number(clave[1])));
    const liberar = ruta.match(/^claves\/(\d+)\/equipos\/(\d+)$/);
    if (liberar && m === 'DELETE') return json(await liberarEquipo(db, Number(liberar[1]), Number(liberar[2])));
    if (m === 'GET' && ruta === 'pruebas') return json({ pruebas: await listarPruebas(db) });
    const otra = ruta.match(/^pruebas\/([^/]+)\/reiniciar$/);
    if (otra && m === 'POST') return json(await reiniciarPrueba(db, decodeURIComponent(otra[1])));
    if (m === 'GET' && ruta === 'eventos') return json({ eventos: await listarEventos(db) });
    if (m === 'POST' && ruta === 'codigo') return json(await codigoOffline(env, db, await leerCuerpo(request)));
    return error(404, 'No existe');
  } catch (e) {
    return error(400, e.message || 'No se pudo completar');
  }
}

async function resumen(db) {
  const claves = (await db.prepare('SELECT * FROM comida_claves ORDER BY id DESC').all()).results;
  const equipos = (await db.prepare('SELECT * FROM comida_activaciones ORDER BY id').all()).results;
  const porClave = {};
  for (const eq of equipos) (porClave[eq.clave_id] ||= []).push(eq);
  return {
    hoy: hoy(),
    claves: claves.map((c) => ({ ...c, equipos: porClave[c.id] || [] })),
  };
}

async function baseCompleta(db) {
  return {
    producto: 'comida',
    exportado: ahora(),
    claves: (await db.prepare('SELECT * FROM comida_claves ORDER BY id').all()).results,
    activaciones: (await db.prepare('SELECT * FROM comida_activaciones ORDER BY id').all()).results,
    pruebas: (await db.prepare('SELECT * FROM comida_pruebas ORDER BY inicio').all()).results,
    eventos: (await db.prepare('SELECT * FROM comida_eventos ORDER BY id').all()).results,
  };
}

function datosClave(d, previa) {
  const cliente = texto(d.cliente, 80);
  if (!cliente) throw new Error('Escribe el nombre del cliente');
  let vence = texto(d.vence, 10);
  if (d.plazo === 'mes') vence = sumarMeses(hoy(), 1);
  if (d.plazo === 'anio') vence = sumarMeses(hoy(), 12);
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) throw new Error('La fecha de vencimiento no es válida');
  return {
    cliente,
    contacto: texto(d.contacto, 80),
    max_equipos: entero(d.max_equipos, previa ? previa.max_equipos : 1, 1, 20),
    vence,
    notas: texto(d.notas, 200),
    estado: d.estado === 'suspendida' ? 'suspendida' : 'activa',
  };
}

async function crear(db, d) {
  const datos = datosClave(d);
  let clave = normalizarClave(d.clave);
  if (d.clave && !clave) throw new Error('La clave no tiene el formato COMIDA-XXXX-XXXX-XXXX');
  if (!clave) clave = claveNueva();
  const r = await db.prepare('INSERT INTO comida_claves(clave, cliente, contacto, max_equipos, vence, estado, notas, creada) VALUES(?,?,?,?,?,?,?,?)')
    .bind(clave, datos.cliente, datos.contacto, datos.max_equipos, datos.vence, datos.estado, datos.notas, ahora()).run();
  await anotar(db, 'emitir', { clave, detalle: datos.cliente });
  return { id: r.meta.last_row_id, clave };
}

async function editar(db, id, d) {
  const previa = await db.prepare('SELECT * FROM comida_claves WHERE id=?').bind(id).first();
  if (!previa) throw new Error('No existe esa licencia');
  const datos = datosClave(d, previa);
  await db.prepare('UPDATE comida_claves SET cliente=?, contacto=?, max_equipos=?, vence=?, estado=?, notas=? WHERE id=?')
    .bind(datos.cliente, datos.contacto, datos.max_equipos, datos.vence, datos.estado, datos.notas, id).run();
  await anotar(db, datos.estado === 'suspendida' ? 'suspender' : 'editar', { clave: previa.clave, detalle: datos.cliente });
  return { ok: true };
}

async function borrar(db, id) {
  const previa = await db.prepare('SELECT * FROM comida_claves WHERE id=?').bind(id).first();
  if (!previa) throw new Error('No existe esa licencia');
  await db.prepare('DELETE FROM comida_activaciones WHERE clave_id=?').bind(id).run();
  await db.prepare('DELETE FROM comida_claves WHERE id=?').bind(id).run();
  await anotar(db, 'borrar', { clave: previa.clave, detalle: previa.cliente });
  return { ok: true };
}

async function liberarEquipo(db, claveId, activacionId) {
  const act = await db.prepare('SELECT * FROM comida_activaciones WHERE id=? AND clave_id=?').bind(activacionId, claveId).first();
  if (!act) throw new Error('Ese equipo no está en esta licencia');
  const clave = await db.prepare('SELECT clave FROM comida_claves WHERE id=?').bind(claveId).first();
  await db.prepare('DELETE FROM comida_activaciones WHERE id=?').bind(activacionId).run();
  await anotar(db, 'liberar', { clave: clave ? clave.clave : '', equipo: act.equipo, detalle: act.nombre_pc });
  return { ok: true };
}

async function listarPruebas(db) {
  return (await db.prepare('SELECT * FROM comida_pruebas ORDER BY inicio DESC').all()).results;
}

async function reiniciarPrueba(db, equipo) {
  const id = normalizarEquipo(equipo);
  if (!id) throw new Error('Código de equipo inválido');
  await db.prepare('DELETE FROM comida_pruebas WHERE equipo=?').bind(id).run();
  await anotar(db, 'prueba_reiniciar', { equipo: id });
  return { ok: true };
}

async function listarEventos(db) {
  return (await db.prepare('SELECT * FROM comida_eventos ORDER BY id DESC LIMIT 200').all()).results;
}

async function codigoOffline(env, db, d) {
  const equipo = normalizarEquipo(d.equipo);
  const cliente = texto(d.cliente, 80);
  if (!equipo) throw new Error('Código de equipo inválido');
  if (!cliente) throw new Error('Escribe el nombre del cliente');
  let vence = texto(d.vence, 10);
  if (d.plazo === 'mes') vence = sumarMeses(hoy(), 1);
  if (d.plazo === 'anio') vence = sumarMeses(hoy(), 12);
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) throw new Error('La fecha de vencimiento no es válida');
  const codigo = await firmarLicencia(env, { v: 1, cliente, id: equipo, emitida: hoy(), vence, tipo: 'completa' });
  await anotar(db, 'codigo_offline', { equipo, detalle: cliente });
  return { codigo };
}
