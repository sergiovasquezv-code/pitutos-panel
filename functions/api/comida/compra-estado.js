// POST /api/comida/compra-estado {ref}
import { asegurarTablasVenta, base, error, json, leerCuerpo, revisarPago } from '../../../comida-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    let c = await db.prepare('SELECT * FROM comida_compras WHERE ref=?').bind(String(d.ref || '')).first();
    if (!c) return error(404, 'Compra no encontrada');
    if (c.estado === 'pendiente' && env.MP_ACCESS_TOKEN) {
      try { c = await revisarPago(db, env, { compra: c }) || c; } catch (e) { /* se reintenta */ }
    }
    const clave = c.estado === 'aprobada' && c.clave_id
      ? await db.prepare('SELECT * FROM comida_claves WHERE id=?').bind(c.clave_id).first()
      : null;
    return json({
      estado: c.estado,
      plan: c.plan_nombre,
      precio: c.precio,
      nombre: c.nombre,
      email: c.email,
      renovacion: !!c.renovacion,
      desde_comida: !!c.equipo,
      clave: clave ? clave.clave : null,
      vence: clave ? clave.vence : null,
      equipos: clave ? clave.max_equipos : null,
      correo: c.correo,
      detalle: c.estado === 'rechazada' ? c.mp_detalle : null,
    });
  } catch (e) {
    return error(500, e.message);
  }
}
