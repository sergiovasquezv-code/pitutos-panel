// POST /api/comida/para-equipo {equipo} -> licencia firmada si ese computador ya pagó.
import { armarLicencia, asegurarTablasVenta, base, claveDeEquipo, error, firmarLicencia, hoy, json,
  leerCuerpo, normalizarEquipo } from '../../../comida-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    const clave = await claveDeEquipo(db, equipo);
    if (!clave || clave.estado !== 'activa' || (clave.vence && clave.vence < hoy())) return json({ licencia: null });
    return json({ licencia: await firmarLicencia(env, armarLicencia(clave, equipo)) });
  } catch (e) {
    return error(500, e.message || 'No se pudo revisar la compra');
  }
}
