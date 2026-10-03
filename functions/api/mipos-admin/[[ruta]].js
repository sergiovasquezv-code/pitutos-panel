// /api/mipos-admin/*  — administración de licencias (la usa public/mipos-licencias.html).
// Protegida con el secreto MIPOS_ADMIN_CLAVE (encabezado Authorization: Bearer <clave>).
import { anotar, asegurarTablas, base, claveNueva, diasPrueba, diasSinInternet, error, firmarLicencia, hoy, json, leerCuerpo,
  normalizarEquipo, texto, ahora } from '../../../mipos-lib/licencias.js';

function igual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] || 0) ^ (y[i] || 0);
  return dif === 0;
}

function datosClave(d, actual = {}) {
  const v = { ...actual };
  if ('cliente' in d) v.cliente = texto(d.cliente, 100);
  if ('contacto' in d) v.contacto = texto(d.contacto, 100);
  if ('notas' in d) v.notas = texto(d.notas, 500);
  if ('cajas' in d) v.cajas = Math.min(Math.max(parseInt(d.cajas, 10) || 1, 1), 50);
  if ('max_equipos' in d) v.max_equipos = Math.min(Math.max(parseInt(d.max_equipos, 10) || 1, 1), 20);
  if ('vence' in d) v.vence = /^\d{4}-\d{2}-\d{2}$/.test(d.vence || '') ? d.vence : null;
  if ('estado' in d) v.estado = d.estado === 'bloqueada' ? 'bloqueada' : 'activa';
  if (!v.cliente) throw Object.assign(new Error('Falta el nombre del cliente'), { status: 400 });
  return v;
}

async function resumen(db, env) {
  const claves = (await db.prepare('SELECT * FROM mipos_claves ORDER BY id DESC').all()).results;
  const acts = (await db.prepare('SELECT * FROM mipos_activaciones ORDER BY id').all()).results;
  const pruebas = (await db.prepare('SELECT * FROM mipos_pruebas ORDER BY inicio DESC').all()).results;
  for (const c of claves) c.equipos = acts.filter(a => a.clave_id === c.id);
  let firma = 'ok';
  try { await firmarLicencia(env, { prueba: 1 }); } catch (e) { firma = e.message; }
  return { hoy: hoy(), claves, pruebas, config: { dias_prueba: diasPrueba(env), dias_sin_internet: diasSinInternet(env), firma } };
}

export async function onRequest({ request, env, params }) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.MIPOS_ADMIN_CLAVE) return error(500, 'Falta configurar el secreto MIPOS_ADMIN_CLAVE en Cloudflare');
  if (!igual(token, env.MIPOS_ADMIN_CLAVE)) return error(401, 'Clave de administrador incorrecta');
  try {
    const db = base(env);
    await asegurarTablas(db);
    const ruta = (params.ruta || []).join('/');
    const m = request.method;
    const d = m === 'GET' || m === 'DELETE' ? {} : await leerCuerpo(request);
    let r;

    if (m === 'GET' && ruta === 'resumen') return json(await resumen(db, env));

    if (m === 'GET' && ruta === 'eventos') {
      return json((await db.prepare('SELECT e.*, c.cliente FROM mipos_eventos e LEFT JOIN mipos_claves c ON c.id=e.clave_id ORDER BY e.id DESC LIMIT 300').all()).results);
    }

    if (m === 'POST' && ruta === 'claves') {
      const v = datosClave(d, { cajas: 1, max_equipos: 1, vence: null, contacto: '', notas: '' });
      for (let intento = 0; intento < 5; intento++) {
        const clave = claveNueva();
        try {
          r = await db.prepare('INSERT INTO mipos_claves(clave, cliente, contacto, cajas, vence, max_equipos, notas, creado) VALUES(?,?,?,?,?,?,?,?)')
            .bind(clave, v.cliente, v.contacto, v.cajas, v.vence, v.max_equipos, v.notas, ahora()).run();
          const id = r.meta.last_row_id;
          await anotar(db, 'clave_creada', { clave_id: id, detalle: `${v.cliente} · ${v.cajas} caja(s) · ${v.vence || 'sin vencimiento'}` });
          return json(await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(id).first());
        } catch (e) { if (!/UNIQUE/i.test(e.message)) throw e; }
      }
      return error(500, 'No se pudo generar una clave única, intenta de nuevo');
    }

    let p = ruta.match(/^claves\/(\d+)$/);
    if (p && m === 'PUT') {
      const actual = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(+p[1]).first();
      if (!actual) return error(404, 'Clave no encontrada');
      const v = datosClave(d, actual);
      await db.prepare('UPDATE mipos_claves SET cliente=?, contacto=?, cajas=?, vence=?, max_equipos=?, estado=?, notas=? WHERE id=?')
        .bind(v.cliente, v.contacto, v.cajas, v.vence, v.max_equipos, v.estado, v.notas, actual.id).run();
      const cambios = ['cajas', 'vence', 'max_equipos', 'estado', 'cliente'].filter(k => String(actual[k]) !== String(v[k]))
        .map(k => `${k}: ${actual[k] ?? '—'} → ${v[k] ?? '—'}`).join(', ');
      await anotar(db, 'clave_editada', { clave_id: actual.id, detalle: cambios || 'sin cambios' });
      return json(await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(actual.id).first());
    }
    if (p && m === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM mipos_activaciones WHERE clave_id=?').bind(+p[1]),
                      db.prepare('DELETE FROM mipos_claves WHERE id=?').bind(+p[1])]);
      await anotar(db, 'clave_eliminada', { clave_id: +p[1] });
      return json({ ok: true });
    }

    p = ruta.match(/^claves\/(\d+)\/liberar$/);
    if (p && m === 'POST') {
      const equipo = normalizarEquipo(d.equipo);
      r = await db.prepare("UPDATE mipos_activaciones SET estado='liberada' WHERE clave_id=? AND equipo=?").bind(+p[1], equipo).run();
      if (!r.meta.changes) return error(404, 'Ese computador no está en esta clave');
      await anotar(db, 'pc_liberado', { clave_id: +p[1], equipo });
      return json({ ok: true });
    }

    p = ruta.match(/^pruebas\/([A-Z0-9-]+)$/);
    if (p && m === 'DELETE') {
      await db.prepare('DELETE FROM mipos_pruebas WHERE equipo=?').bind(p[1]).run();
      await anotar(db, 'prueba_reiniciada', { equipo: p[1] });
      return json({ ok: true });
    }

    if (m === 'POST' && ruta === 'codigo') {
      // Código de activación para un PC sin internet (el mismo formato que generar_licencia.bat)
      const equipo = normalizarEquipo(d.equipo);
      if (!equipo) return error(400, 'El código del equipo tiene 16 letras y números (ej: ABCD-EFGH-JKLM-NPQR)');
      const cliente = texto(d.cliente, 100);
      if (!cliente) return error(400, 'Falta el nombre del cliente');
      const vence = /^\d{4}-\d{2}-\d{2}$/.test(d.vence || '') ? d.vence : null;
      const lic = { v: 1, id: equipo, cliente, cajas: Math.min(Math.max(parseInt(d.cajas, 10) || 1, 1), 50), emitida: hoy(), vence };
      await anotar(db, 'codigo_sin_internet', { equipo, detalle: `${cliente} · ${lic.cajas} caja(s) · ${vence || 'sin vencimiento'}` });
      return json({ codigo: await firmarLicencia(env, lic) });
    }

    return error(404, 'Ruta no encontrada');
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
