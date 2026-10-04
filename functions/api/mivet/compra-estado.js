// POST /api/mivet/compra-estado {ref} -> estado de una compra (la página de compra lo consulta al volver de Mercado Pago).
// Si sigue pendiente, revisa en Mercado Pago (por si el aviso automático no llegó).
import { asegurarTablasVenta, base, error, json, leerCuerpo, revisarPago } from '../../../mivet-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    let c = await db.prepare('SELECT * FROM mivet_compras WHERE ref=?').bind(String(d.ref || '')).first();
    if (!c) return error(404, 'Compra no encontrada');
    if (c.estado === 'pendiente' && env.MP_ACCESS_TOKEN) {
      try { c = await revisarPago(db, env, { compra: c }) || c; } catch (e) { /* se reintenta en la siguiente consulta */ }
    }
    const clave = c.estado === 'aprobada' ? await db.prepare('SELECT * FROM mivet_claves WHERE id=?').bind(c.clave_id).first() : null;
    return json({ estado: c.estado, plan: c.plan_nombre, precio: c.precio, nombre: c.nombre, email: c.email, renovacion: !!c.renovacion,
                  desde_mipos: !!c.equipo, clave: clave ? clave.clave : null, vence: clave ? clave.vence : null, cajas: clave ? clave.cajas : null,
                  correo: c.correo, detalle: c.estado === 'rechazada' ? c.mp_detalle : null });
  } catch (e) {
    return error(500, e.message);
  }
}
