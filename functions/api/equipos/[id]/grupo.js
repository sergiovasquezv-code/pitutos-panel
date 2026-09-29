import { json } from "../../../_lib/json.js";

// Asigna o quita un equipo de un grupo (grupo_id null = lo saca del
// grupo). Endpoint aparte del PUT normal de equipo para no arriesgar los
// otros dos modos que ya tiene ese PUT (toggle de visible_cliente y edición
// completa del formulario).
export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const equipo = await db.prepare("SELECT * FROM equipos WHERE id = ?").bind(id).first();
  if (!equipo) return json({ error: "Equipo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  let grupoId = null;
  if (body.grupo_id !== null && body.grupo_id !== undefined && body.grupo_id !== "") {
    grupoId = Number(body.grupo_id);
    const grupo = await db.prepare("SELECT id FROM grupos_equipos WHERE id = ?").bind(grupoId).first();
    if (!grupo) return json({ error: "Grupo no encontrado." }, 400);
  }

  await db.prepare("UPDATE equipos SET grupo_id = ? WHERE id = ?").bind(grupoId, id).run();
  return json({ ok: true, cliente_id: equipo.cliente_id, grupo_id: grupoId });
}
