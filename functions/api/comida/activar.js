// POST /api/comida/activar  {clave, equipo, nombre_pc, version}  -> {licencia}
import { anotar, armarLicencia, asegurarTablas, ahora, base, error, firmarLicencia, hoy, json,
  leerCuerpo, normalizarClave, normalizarEquipo, texto } from '../../../comida-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const claveTxt = normalizarClave(d.clave);
    const equipo = normalizarEquipo(d.equipo);
    if (!claveTxt) return error(400, 'La clave de producto no tiene el formato COMIDA-XXXX-XXXX-XXXX');
    if (!equipo) return error(400, 'Código de equipo inválido');
    const clave = await db.prepare('SELECT * FROM comida_claves WHERE clave=?').bind(claveTxt).first();
    if (!clave) return error(404, 'Esa clave de Comida no existe');
    if (clave.estado !== 'activa') return error(403, 'Esta clave está suspendida. Escríbele a tu proveedor.');
    if (clave.vence && clave.vence < hoy()) return error(403, 'Esta clave está vencida. Pide la renovación a tu proveedor.');
    const ya = await db.prepare('SELECT id FROM comida_activaciones WHERE clave_id=? AND equipo=?').bind(clave.id, equipo).first();
    if (!ya) {
      const usadas = await db.prepare('SELECT COUNT(*) AS n FROM comida_activaciones WHERE clave_id=?').bind(clave.id).first();
      if (usadas.n >= clave.max_equipos) {
        return error(403, `Esta clave ya está en ${clave.max_equipos} equipo${clave.max_equipos === 1 ? '' : 's'}. Pide que liberen uno o que amplíen la licencia.`);
      }
      await db.prepare('INSERT INTO comida_activaciones(clave_id, equipo, nombre_pc, version, activada, ultimo_contacto) VALUES(?,?,?,?,?,?)')
        .bind(clave.id, equipo, texto(d.nombre_pc, 60), texto(d.version, 20), ahora(), ahora()).run();
      await anotar(db, 'activar', { clave: claveTxt, equipo, detalle: texto(d.nombre_pc, 60) });
    } else {
      await db.prepare('UPDATE comida_activaciones SET ultimo_contacto=?, nombre_pc=?, version=? WHERE id=?')
        .bind(ahora(), texto(d.nombre_pc, 60), texto(d.version, 20), ya.id).run();
    }
    return json({ licencia: await firmarLicencia(env, armarLicencia(clave, equipo)) });
  } catch (e) {
    return error(500, e.message || 'No se pudo activar');
  }
}
