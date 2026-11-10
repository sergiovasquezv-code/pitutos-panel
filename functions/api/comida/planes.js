// GET /api/comida/planes  -> planes a la venta. El precio guardado es neto; total ya incluye IVA 19%.
import { asegurarTablasVenta, base, error, json, precioConIva, TERMINOS_VERSION } from '../../../comida-lib/licencias.js';

export async function onRequestGet({ env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const filas = (await db.prepare('SELECT id, nombre, descripcion, meses, equipos, precio, destacado FROM comida_planes WHERE activo=1 ORDER BY orden, precio').all()).results;
    const planes = filas.map((p) => ({ ...p, neto: p.precio, iva: precioConIva(p.precio) - p.precio, total: precioConIva(p.precio) }));
    return json({ planes, terminos: TERMINOS_VERSION, venta_activa: !!env.MP_ACCESS_TOKEN });
  } catch (e) {
    return error(500, e.message);
  }
}
