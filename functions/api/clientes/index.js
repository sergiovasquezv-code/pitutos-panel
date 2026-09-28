import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  let stmt;
  if (q) {
    const like = `%${q}%`;
    stmt = db
      .prepare(
        "SELECT * FROM clientes WHERE nombre LIKE ? OR telefono LIKE ? OR email LIKE ? ORDER BY nombre"
      )
      .bind(like, like, like);
  } else {
    stmt = db.prepare("SELECT * FROM clientes ORDER BY nombre");
  }
  const { results } = await stmt.all();
  return json({ clientes: results });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const nombre = (body.nombre || "").trim();
  if (!nombre) return json({ error: "El nombre es obligatorio." }, 400);

  const result = await db
    .prepare(
      "INSERT INTO clientes (nombre, telefono, email, direccion, notas, rut, creado_en) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(
      nombre,
      (body.telefono || "").trim(),
      (body.email || "").trim(),
      (body.direccion || "").trim(),
      (body.notas || "").trim(),
      (body.rut || "").trim(),
      nowIso()
    )
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}
