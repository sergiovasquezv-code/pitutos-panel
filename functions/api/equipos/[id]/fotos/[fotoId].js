import { json } from "../../../../_lib/json.js";
import { nowIso } from "../../../../_lib/dates.js";

// Marca (o desmarca) si esta foto se le muestra al cliente — nace oculta,
// igual que las fotos de avance de un trabajo.
export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const equipoId = Number(params.id);
  const fotoId = Number(params.fotoId);
  const foto = await db
    .prepare("SELECT * FROM fotos_equipo WHERE id = ? AND equipo_id = ?")
    .bind(fotoId, equipoId)
    .first();
  if (!foto) return json({ error: "Foto no encontrada." }, 404);

  const body = await request.json().catch(() => ({}));
  if (typeof body.visible_cliente !== "boolean") {
    return json({ error: "Falta indicar la visibilidad." }, 400);
  }
  const visibleCliente = body.visible_cliente ? 1 : 0;
  const visibleDesde = body.visible_cliente ? nowIso() : foto.visible_desde;
  await db
    .prepare("UPDATE fotos_equipo SET visible_cliente = ?, visible_desde = ? WHERE id = ?")
    .bind(visibleCliente, visibleDesde, fotoId)
    .run();
  return json({ ok: true, visible_cliente: !!visibleCliente, visible_desde: visibleDesde });
}

// Elimina una foto del estado de un equipo (por si se subió por error o
// ya no aplica), incluyendo el archivo en R2.
export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const equipoId = Number(params.id);
  const fotoId = Number(params.fotoId);

  const foto = await db
    .prepare("SELECT id, r2_key FROM fotos_equipo WHERE id = ? AND equipo_id = ?")
    .bind(fotoId, equipoId)
    .first();
  if (!foto) return json({ error: "Foto no encontrada." }, 404);

  if (env.FOTOS && foto.r2_key) {
    try {
      await env.FOTOS.delete(foto.r2_key);
    } catch {
      // Si falla el borrado del archivo, igual limpiamos el registro.
    }
  }

  await db.prepare("DELETE FROM fotos_equipo WHERE id = ?").bind(fotoId).run();
  return json({ ok: true });
}
