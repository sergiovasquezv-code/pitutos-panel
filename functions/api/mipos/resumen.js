// POST /api/mipos/resumen — lo llama el PC con la clave ya activada, igual que /respaldo.
// Guarda el día como lo ve la caja: total, cada venta (también anulada) y stock.
import { asegurarTablas, base, error, hoy, json, leerCuerpo, normalizarEquipo, problemaClave } from '../../../mipos-lib/licencias.js';
import { asegurarResumen, guardarResumen, limpiarResumen } from '../../../mipos-lib/resumen.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    await asegurarResumen(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    const claveId = parseInt(d.k, 10);
    if (!equipo || !Number.isInteger(claveId) || claveId < 1) return error(400, 'Resumen inválido');
    const clave = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(claveId).first();
    const activacion = clave && await db.prepare(
      "SELECT id FROM mipos_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'"
    ).bind(claveId, equipo).first();
    const problema = problemaClave(clave) || (!activacion ? 'El servidor no está activado con esta licencia.' : null);
    if (problema) return error(403, problema);
    const limpio = limpiarResumen(d, hoy());
    if (limpio.error) return error(400, limpio.error);
    await guardarResumen(db, claveId, limpio.resumen);
    return json({ resumen: 'recibido' });
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
