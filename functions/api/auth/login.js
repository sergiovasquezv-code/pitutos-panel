import { verifyPassword, sessionCookie, createSession } from "../../_lib/auth.js";
import { json } from "../../_lib/json.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";

  const user = await db.prepare("SELECT * FROM usuarios WHERE username = ?").bind(username).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "Usuario o contraseña incorrectos." }, 401);
  }

  const token = await createSession(env, user.id);
  return json(
    { ok: true, username: user.username },
    200,
    { "Set-Cookie": sessionCookie(request, token) }
  );
}
