// POST /api/mipos/ordenes — lo llama el PC, igual que /resumen.
// Baja las correcciones pendientes y confirma las que ya aplicó. No crea ventas.
import { asegurarTablas, base, error, json, leerCuerpo, normalizarEquipo, problemaClave } from '../../../mipos-lib/licencias.js';
import { asegurarOrdenes, sincronizar } from '../../../mipos-lib/ordenes.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    await asegurarOrdenes(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    const claveId = parseInt(d.k, 10);
    if (!equipo || !Number.isInteger(claveId) || claveId < 1) return error(400, 'Pedido de corrección inválido');
    const clave = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(claveId).first();
    const activacion = clave && await db.prepare(
      "SELECT id FROM mipos_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'"
    ).bind(claveId, equipo).first();
    const problema = problemaClave(clave) || (!activacion ? 'El servidor no está activado con esta licencia.' : null);
    if (problema) return error(403, problema);
    if (d.accion !== 'sincronizar') return error(400, 'Pedido de corrección inválido');
    if (d.confirmar != null && !Array.isArray(d.confirmar)) return error(400, 'Pedido de corrección inválido');
    return json(await sincronizar(db, claveId, d.confirmar || []));
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
