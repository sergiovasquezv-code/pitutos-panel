import { getUserFromSession } from "../_lib/auth.js";
import { json } from "../_lib/json.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const anyUser = await db.prepare("SELECT id FROM usuarios LIMIT 1").first();
  if (!anyUser) {
    return json({ needsSetup: true, authenticated: false });
  }
  const user = await getUserFromSession(env, request);
  if (!user) {
    return json({ needsSetup: false, authenticated: false });
  }
  return json({
    needsSetup: false,
    authenticated: true,
    username: user.username,
    nombreNegocio: env.NOMBRE_NEGOCIO || "Mis Pitutos Informáticos",
  });
}
