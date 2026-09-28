import { verifyPassword, hashPassword } from "../_lib/auth.js";
import { json } from "../_lib/json.js";

export async function onRequestPut({ request, env, data }) {
  const db = env.DB;
  const currentUser = data.user;
  const body = await request.json().catch(() => ({}));
  const newUsername = (body.username || "").trim();
  const currentPassword = body.current_password || "";
  const newPassword = body.new_password || "";

  if (!newUsername) return json({ error: "El usuario no puede quedar vacío." }, 400);

  const row = await db.prepare("SELECT * FROM usuarios WHERE id = ?").bind(currentUser.id).first();
  if (!row) return json({ error: "Usuario no encontrado." }, 404);

  if (!currentPassword || !(await verifyPassword(currentPassword, row.password_hash))) {
    return json({ error: "Tu contraseña actual no es correcta." }, 400);
  }

  if (newUsername !== row.username) {
    const dup = await db
      .prepare("SELECT id FROM usuarios WHERE username = ? AND id != ?")
      .bind(newUsername, row.id)
      .first();
    if (dup) return json({ error: "Ese nombre de usuario ya está en uso." }, 400);
  }

  let passwordHash = row.password_hash;
  if (newPassword) {
    if (newPassword.length < 6) {
      return json({ error: "La nueva contraseña debe tener al menos 6 caracteres." }, 400);
    }
    passwordHash = await hashPassword(newPassword);
  }

  await db
    .prepare("UPDATE usuarios SET username=?, password_hash=? WHERE id=?")
    .bind(newUsername, passwordHash, row.id)
    .run();

  return json({ ok: true, username: newUsername });
}
