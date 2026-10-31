import { json } from "../../../_lib/json.js";
import { aplicarEleccion, eleccionesDeTrabajo } from "../../../_lib/parametros.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const trabajo = await db.prepare("SELECT * FROM trabajos WHERE id = ?").bind(id).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);
  const ids = await eleccionesDeTrabajo(db, trabajo);
  return json({ ids });
}

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const trabajo = await db.prepare("SELECT * FROM trabajos WHERE id = ?").bind(id).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);
  const body = await request.json().catch(() => ({}));
  const opcionId = Number(body.opcion_id);
  const opcion = await db.prepare("SELECT * FROM parametros_opcion WHERE id = ? AND activo = 1").bind(opcionId).first();
  if (!opcion) return json({ error: "Esa opción no está disponible." }, 400);
  await aplicarEleccion(db, trabajo, opcion, !!body.marcada);
  const ids = (
    await db.prepare("SELECT opcion_id FROM trabajo_eleccion WHERE trabajo_id = ?").bind(id).all()
  ).results.map((r) => r.opcion_id);
  const actual = await db.prepare("SELECT tipo, estado, mostrar_detalle_cliente FROM trabajos WHERE id = ?").bind(id).first();
  return json({ ok: true, ids, trabajo: actual });
}
