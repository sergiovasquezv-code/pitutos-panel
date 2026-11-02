// POST /api/mipos/respaldo — lo llama el PC principal, igual que /equipos (clave + equipo activado).
// No modifica el reporte de estaciones.
import { asegurarTablas, base, error, json, leerCuerpo, normalizarEquipo, problemaClave } from '../../../mipos-lib/licencias.js';
import { confirmar, consultar, dia, fallar } from '../../_lib/respaldos.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    const claveId = parseInt(d.k, 10);
    if (!equipo || !Number.isInteger(claveId) || claveId < 1) return error(400, 'Pedido de respaldo inválido');
    const clave = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(claveId).first();
    const activacion = clave && await db.prepare("SELECT id FROM mipos_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'")
      .bind(claveId, equipo).first();
    const problema = problemaClave(clave) || (!activacion ? 'El servidor no está activado con esta licencia.' : null);
    if (problema) return error(403, problema);
    const accion = d.accion || 'consultar';
    if (accion === 'dia') return json(await dia(db, env, 'mipos', claveId, equipo));
    if (accion === 'consultar') return json(await consultar(db, env, 'mipos', claveId, equipo));
    if (accion === 'confirmar') return json(await confirmar(db, env, 'mipos', claveId, equipo, d));
    if (accion === 'error') return json(await fallar(db, env, 'mipos', claveId, equipo, d));
    return error(400, 'Acción de respaldo desconocida');
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
