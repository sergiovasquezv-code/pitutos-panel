// GET /api/mipos/planes  -> planes a la venta (para la página de compra)
import { asegurarTablasVenta, base, error, json, TERMINOS_VERSION } from '../../../mipos-lib/licencias.js';

export async function onRequestGet({ env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const planes = (await db.prepare('SELECT id, nombre, descripcion, meses, cajas, precio, destacado FROM mipos_planes WHERE activo=1 ORDER BY orden, precio').all()).results;
    return json({ planes, terminos: TERMINOS_VERSION, venta_activa: !!env.MP_ACCESS_TOKEN });
  } catch (e) {
    return error(500, e.message);
  }
}
