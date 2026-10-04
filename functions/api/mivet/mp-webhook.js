// POST /api/mivet/mp-webhook  — Mercado Pago avisa aquí cada pago. No se confía en el aviso: se consulta el pago
// directamente a la API de Mercado Pago con tu token antes de entregar nada.
import { asegurarTablasVenta, base, json, leerCuerpo, revisarPago } from '../../../mivet-lib/licencias.js';

async function manejar({ request, env }) {
  const url = new URL(request.url);
  const d = request.method === 'POST' ? await leerCuerpo(request) : {};
  const tipo = d.type || d.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  const id = (d.data && d.data.id) || url.searchParams.get('data.id') || (tipo === 'payment' ? url.searchParams.get('id') : null);
  if (tipo !== 'payment' || !id) return json({ ok: true, ignorado: true });  // otros avisos (merchant_order, etc.)
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const c = await revisarPago(db, env, { pagoId: id });
    return json({ ok: true, estado: c ? c.estado : 'desconocida' });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);  // Mercado Pago reintenta
  }
}
export const onRequestPost = manejar;
export const onRequestGet = manejar;
