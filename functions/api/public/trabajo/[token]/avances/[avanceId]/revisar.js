import { json } from "../../../../../../_lib/json.js";
import { nowIso } from "../../../../../../_lib/dates.js";
import { enviarAvisoRevisado } from "../../../../../../_lib/email.js";

// El CLIENTE (sin login, solo con el token de su link) marca una nota,
// enlace o foto como revisado. Se valida que el avance pertenezca al mismo
// trabajo que el token, para que nadie pueda marcar avances de otro trabajo.
export async function onRequestPost(context) {
  const { env, params } = context;
  const db = env.DB;
  const token = params.token;
  const avanceId = Number(params.avanceId);

  const trabajo = await db
    .prepare(
      `SELECT trabajos.id, trabajos.tipo, clientes.nombre AS cliente_nombre
       FROM trabajos JOIN clientes ON clientes.id = trabajos.cliente_id
       WHERE trabajos.public_token = ?`
    )
    .bind(token)
    .first();
  if (!trabajo) return json({ error: "Este link no es válido." }, 404);

  const avance = await db
    .prepare("SELECT * FROM avances WHERE id = ? AND trabajo_id = ?")
    .bind(avanceId, trabajo.id)
    .first();
  if (!avance) return json({ error: "Avance no encontrado." }, 404);

  if (avance.tipo === "estado") {
    return json({ error: "Los hitos de estado no se marcan como revisados." }, 400);
  }
  if (!avance.visible_cliente) {
    return json({ error: "Avance no encontrado." }, 404);
  }

  // Solo avisamos por correo la primera vez que se marca como revisado (es
  // idempotente: si el cliente vuelve a tocar el botón, o llega el mismo
  // POST dos veces, no mandamos un correo por cada intento).
  const eraNuevo = !avance.revisado_en;
  if (eraNuevo) {
    await db
      .prepare("UPDATE avances SET revisado_en = ? WHERE id = ?")
      .bind(nowIso(), avanceId)
      .run();
    context.waitUntil(
      enviarAvisoRevisado(env, {
        clienteNombre: trabajo.cliente_nombre,
        trabajoTipo: trabajo.tipo,
        avance,
      })
    );
  }

  const actualizado = await db.prepare("SELECT revisado_en FROM avances WHERE id = ?").bind(avanceId).first();
  return json({ ok: true, revisado_en: actualizado.revisado_en });
}
