import { json } from "../../../_lib/json.js";
import { randomToken } from "../../../_lib/tokens.js";

// Genera (o devuelve, si ya existe) el link público de garantía de un
// equipo, para que el cliente pueda ver siempre el estado de su garantía
// sin necesitar cuenta. Es idempotente: si ya tiene token, no lo cambia
// (así el link que ya mandaste sigue funcionando).
export async function onRequestPost({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const equipo = await db.prepare("SELECT * FROM equipos WHERE id = ?").bind(id).first();
  if (!equipo) return json({ error: "Equipo no encontrado." }, 404);

  let token = equipo.public_token;
  if (!token) {
    token = randomToken();
    await db.prepare("UPDATE equipos SET public_token = ? WHERE id = ?").bind(token, id).run();
  }
  return json({ ok: true, token });
}
