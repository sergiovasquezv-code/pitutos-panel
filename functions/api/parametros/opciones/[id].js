import { json } from "../../../_lib/json.js";
import { asegurarParametros } from "../../../_lib/parametros.js";

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  await asegurarParametros(db);
  const id = Number(params.id);
  const opcion = await db.prepare("SELECT * FROM parametros_opcion WHERE id = ?").bind(id).first();
  if (!opcion) return json({ error: "Opción no encontrada." }, 404);
  const body = await request.json().catch(() => ({}));
  const nombre = body.nombre === undefined ? opcion.nombre : String(body.nombre || "").trim();
  if (!nombre) return json({ error: "La opción necesita un nombre." }, 400);
  const frase = body.frase === undefined ? opcion.frase : String(body.frase || "").trim();
  const activo = body.activo === undefined ? opcion.activo : body.activo ? 1 : 0;
  await db
    .prepare("UPDATE parametros_opcion SET nombre = ?, frase = ?, activo = ? WHERE id = ?")
    .bind(nombre, frase, activo, id)
    .run();
  return json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  await asegurarParametros(db);
  const id = Number(params.id);
  const opcion = await db.prepare("SELECT id FROM parametros_opcion WHERE id = ?").bind(id).first();
  if (!opcion) return json({ error: "Opción no encontrada." }, 404);
  await db.prepare("UPDATE parametros_opcion SET activo = 0 WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
