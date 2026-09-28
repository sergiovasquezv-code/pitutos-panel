import { hashPassword, sessionCookie, createSession } from "../../_lib/auth.js";
import { nowIso } from "../../_lib/dates.js";
import { json } from "../../_lib/json.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const existing = await db.prepare("SELECT id FROM usuarios LIMIT 1").first();
  if (existing) {
    return json({ error: "Ya existe una cuenta configurada." }, 400);
  }

  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";
  const password2 = body.password2 || "";

  if (!username) return json({ error: "Ingresa un nombre de usuario." }, 400);
  if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
  if (password !== password2) return json({ error: "Las contraseñas no coinciden." }, 400);

  const passwordHash = await hashPassword(password);
  const result = await db
    .prepare("INSERT INTO usuarios (username, password_hash, creado_en) VALUES (?,?,?)")
    .bind(username, passwordHash, nowIso())
    .run();
  const userId = result.meta.last_row_id;

  const token = await createSession(env, userId);
  return json(
    { ok: true, username },
    200,
    { "Set-Cookie": sessionCookie(request, token) }
  );
}
