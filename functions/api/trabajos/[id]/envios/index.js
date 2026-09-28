import { json } from "../../../../_lib/json.js";
import { nowIso } from "../../../../_lib/dates.js";

// Historial de envíos por WhatsApp al cliente — para que si el cliente
// pregunta algo, se pueda volver atrás y ver exactamente qué se le mandó
// y cuándo.
export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const { results } = await db
    .prepare("SELECT * FROM envios_cliente WHERE trabajo_id = ? ORDER BY creado_en DESC, id DESC")
    .bind(trabajoId)
    .all();
  return json({ envios: results });
}

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const trabajo = await db.prepare("SELECT id FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  const mensaje = (body.mensaje || "").trim();
  if (!mensaje) return json({ error: "Falta el mensaje enviado." }, 400);

  const result = await db
    .prepare("INSERT INTO envios_cliente (trabajo_id, mensaje, creado_en) VALUES (?,?,?)")
    .bind(trabajoId, mensaje, nowIso())
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}
