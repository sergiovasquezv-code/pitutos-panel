import { json } from "../../../_lib/json.js";
import { randomToken } from "../../../_lib/tokens.js";

export async function onRequestPost({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const trabajo = await db.prepare("SELECT * FROM trabajos WHERE id = ?").bind(id).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  let token = trabajo.public_token;
  if (!token) {
    token = randomToken();
    await db.prepare("UPDATE trabajos SET public_token = ? WHERE id = ?").bind(token, id).run();
  }
  return json({ ok: true, token });
}
