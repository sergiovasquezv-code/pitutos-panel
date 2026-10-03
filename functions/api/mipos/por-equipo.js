// POST /api/mipos/por-equipo {equipo} -> licencia vigente de ese PC, si tiene (MiPOS lo consulta mientras espera un pago)
import { asegurarTablasVenta, base, claveDeEquipo, error, firmarLicencia, json, leerCuerpo, licenciaDeClave,
  normalizarEquipo, problemaClave, texto, ahora } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    const c = await claveDeEquipo(db, equipo);
    if (!c || problemaClave(c)) return json({ licencia: null });
    await db.prepare('UPDATE mipos_activaciones SET ultimo_contacto=?, nombre_pc=COALESCE(NULLIF(?,\'\'), nombre_pc), version=? WHERE clave_id=? AND equipo=?')
      .bind(ahora(), texto(d.nombre_pc, 60), texto(d.version, 20), c.id, equipo).run();
    return json({ licencia: await firmarLicencia(env, licenciaDeClave(env, c, equipo)), cliente: c.cliente });
  } catch (e) {
    return error(500, e.message);
  }
}
