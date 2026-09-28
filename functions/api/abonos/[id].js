import { json } from "../../_lib/json.js";

// Solo permite borrar (para corregir un abono mal ingresado). No hay
// edición: si te equivocaste en el monto, borra el abono y registra uno
// nuevo — así el historial y el comprobante público siempre reflejan lo
// que realmente pasó.
export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const abono = await db.prepare("SELECT * FROM abonos WHERE id = ?").bind(id).first();
  if (!abono) return json({ error: "Abono no encontrado." }, 404);

  await db.prepare("DELETE FROM abonos WHERE id = ?").bind(id).run();

  return json({ ok: true, categoria: abono.categoria, referencia_id: abono.referencia_id });
}
