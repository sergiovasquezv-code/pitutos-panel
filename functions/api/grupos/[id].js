import { json } from "../../_lib/json.js";

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const grupo = await db.prepare("SELECT * FROM grupos_equipos WHERE id = ?").bind(id).first();
  if (!grupo) return json({ error: "Grupo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  const nombre = (body.nombre || "").trim();
  if (!nombre) return json({ error: "Indica un nombre para el grupo." }, 400);

  await db.prepare("UPDATE grupos_equipos SET nombre = ? WHERE id = ?").bind(nombre, id).run();
  return json({ ok: true, cliente_id: grupo.cliente_id });
}

// Elimina el grupo (no los equipos): los equipos que estaban en él vuelven
// a quedar sueltos, tal como se veían antes de agruparlos.
export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const grupo = await db.prepare("SELECT * FROM grupos_equipos WHERE id = ?").bind(id).first();
  if (!grupo) return json({ error: "Grupo no encontrado." }, 404);

  await db.prepare("UPDATE equipos SET grupo_id = NULL WHERE grupo_id = ?").bind(id).run();
  await db.prepare("DELETE FROM grupos_equipos WHERE id = ?").bind(id).run();
  return json({ ok: true, cliente_id: grupo.cliente_id });
}
