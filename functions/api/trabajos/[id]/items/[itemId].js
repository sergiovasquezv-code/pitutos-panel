import { json } from "../../../../_lib/json.js";

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const itemId = Number(params.itemId);

  const item = await db
    .prepare("SELECT id FROM items_trabajo WHERE id = ? AND trabajo_id = ?")
    .bind(itemId, trabajoId)
    .first();
  if (!item) return json({ error: "Ítem no encontrado." }, 404);

  await db.prepare("DELETE FROM items_trabajo WHERE id = ?").bind(itemId).run();
  return json({ ok: true });
}
