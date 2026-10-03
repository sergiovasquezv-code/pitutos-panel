// POST /api/mipos/verificar  {equipo, k, tipo, version, nombre_pc}
// MiPOS lo llama solo (al iniciar y cada 6 horas). Responde con la licencia renovada, o {revocada, motivo}
// si la clave se suspendió, venció o se liberó este PC. Sin internet, MiPOS sigue con la licencia que tiene.
import { asegurarTablas, base, error, firmarLicencia, json, leerCuerpo, licenciaDeClave, licenciaDePrueba,
  normalizarEquipo, problemaClave, texto, ahora, hoy } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    if (d.tipo === 'prueba') {
      const p = await db.prepare('SELECT * FROM mipos_pruebas WHERE equipo=?').bind(equipo).first();
      if (!p) return json({ sin_cambios: true });
      await db.prepare('UPDATE mipos_pruebas SET ultimo_contacto=?, version=? WHERE equipo=?').bind(ahora(), texto(d.version, 20), equipo).run();
      const lic = licenciaDePrueba(env, p);
      return lic.vence < hoy() ? json({ sin_cambios: true }) : json({ licencia: await firmarLicencia(env, lic) });
    }
    const k = parseInt(d.k, 10);
    if (!k) return json({ sin_cambios: true });  // licencias antiguas hechas a mano: no se tocan
    const clave = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(k).first();
    const act = clave && await db.prepare('SELECT * FROM mipos_activaciones WHERE clave_id=? AND equipo=?').bind(k, equipo).first();
    const problema = !clave ? 'La clave de este computador fue eliminada.' : problemaClave(clave)
      || (!act || act.estado !== 'activa' ? 'Este computador fue desvinculado de la clave de producto.' : null);
    if (problema) return json({ revocada: true, motivo: problema });
    await db.prepare('UPDATE mipos_activaciones SET ultimo_contacto=?, version=?, nombre_pc=? WHERE id=?')
      .bind(ahora(), texto(d.version, 20), texto(d.nombre_pc, 60) || act.nombre_pc, act.id).run();
    return json({ licencia: await firmarLicencia(env, licenciaDeClave(env, clave, equipo)) });
  } catch (e) {
    return error(500, 'Error del servidor de licencias: ' + e.message);
  }
}
