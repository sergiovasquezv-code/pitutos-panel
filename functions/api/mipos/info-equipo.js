// GET /api/mipos/info-equipo?equipo=XXXX-XXXX-XXXX-XXXX -> si ese PC ya tiene licencia (para mostrar "renovación")
import { asegurarTablasVenta, base, claveDeEquipo, error, json, normalizarEquipo } from '../../../mipos-lib/licencias.js';

export async function onRequestGet({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const equipo = normalizarEquipo(new URL(request.url).searchParams.get('equipo'));
    if (!equipo) return error(400, 'Código de equipo inválido');
    const c = await claveDeEquipo(db, equipo);
    return json(c ? { tiene: true, cliente: c.cliente, vence: c.vence, cajas: c.cajas } : { tiene: false });
  } catch (e) {
    return error(500, e.message);
  }
}
