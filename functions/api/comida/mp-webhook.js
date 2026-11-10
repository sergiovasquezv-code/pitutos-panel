// POST /api/comida/mp-webhook  Mercado Pago avisa un pago. No se confía en el aviso: se consulta el pago.
import { asegurarTablasVenta, base, json, leerCuerpo, revisarPago } from '../../../comida-lib/licencias.js';

async function manejar({ request, env }) {
  const url = new URL(request.url);
  const d = request.method === 'POST' ? await leerCuerpo(request) : {};
  const tipo = d.type || d.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  const id = (d.data && d.data.id) || url.searchParams.get('data.id') || (tipo === 'payment' ? url.searchParams.get('id') : null);
  if (tipo !== 'payment' || !id) return json({ ok: true, ignorado: true });
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const c = await revisarPago(db, env, { pagoId: id });
    return json({ ok: true, estado: c ? c.estado : 'desconocida' });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export const onRequestPost = manejar;
export const onRequestGet = manejar;
