// POST /api/mipos/verificar  {equipo, k, tipo, version, nombre_pc}
// MiPOS lo llama solo (al iniciar y cada 6 horas). Responde con la licencia renovada, o {revocada, motivo}
// si la clave se suspendió, venció o se liberó este PC. Sin internet, MiPOS sigue con la licencia que tiene.
import { asegurarTablasVenta, claveDeEquipo, asegurarTablas, base, error, firmarLicencia, json, leerCuerpo, licenciaDeClave, licenciaDePrueba,
  normalizarEquipo, problemaClave, texto, ahora, hoy , recordatoriosDelDia } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    if (waitUntil) waitUntil(recordatoriosDelDia(db, env, new URL(request.url).origin).catch(() => {}));  // una vez al día
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    if (d.tipo === 'prueba' || !parseInt(d.k, 10)) {
      // ¿Este PC compró su licencia (por ejemplo desde la prueba)? Se le entrega ya activada.
      const comprada = await claveDeEquipo(db, equipo);
      if (comprada && !problemaClave(comprada)) {
        await db.prepare('UPDATE mipos_activaciones SET ultimo_contacto=?, version=? WHERE clave_id=? AND equipo=?')
          .bind(ahora(), texto(d.version, 20), comprada.id, equipo).run();
        return json({ licencia: await firmarLicencia(env, licenciaDeClave(env, comprada, equipo)) });
      }
    }
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
