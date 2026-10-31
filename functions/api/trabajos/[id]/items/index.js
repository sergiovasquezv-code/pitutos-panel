import { json } from "../../../../_lib/json.js";
import { agregarItem, asegurarCantidad, lineaDesdeBody } from "../../../../_lib/casos.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const trabajo = await db.prepare("SELECT id FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  await asegurarCantidad(db);
  const { results } = await db
    .prepare("SELECT * FROM items_trabajo WHERE trabajo_id = ? ORDER BY creado_en, id")
    .bind(trabajoId)
    .all();
  return json({ items: results });
}

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const trabajo = await db.prepare("SELECT id FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  const linea = lineaDesdeBody(body);
  if (!linea.descripcion) return json({ error: "Describe el producto, repuesto o servicio." }, 400);

  const creado = await agregarItem(db, trabajoId, linea);
  return json({ ok: true, id: creado.id, monto: creado.monto });
}
