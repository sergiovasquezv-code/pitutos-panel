import { json } from "../../../../_lib/json.js";
import { nowIso } from "../../../../_lib/dates.js";

const TIPOS_VALIDOS = ["repuesto", "servicio", "otro"];

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const trabajo = await db.prepare("SELECT id FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

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
  const descripcion = (body.descripcion || "").trim();
  const tipo = TIPOS_VALIDOS.includes(body.tipo) ? body.tipo : "otro";
  const valor = Math.max(Number(body.valor) || 0, 0);

  if (!descripcion) return json({ error: "Describe el repuesto o servicio." }, 400);

  const result = await db
    .prepare("INSERT INTO items_trabajo (trabajo_id, tipo, descripcion, valor, creado_en) VALUES (?,?,?,?,?)")
    .bind(trabajoId, tipo, descripcion, valor, nowIso())
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}
