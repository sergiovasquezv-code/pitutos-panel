import { json } from "../../../../_lib/json.js";
import { nowIso } from "../../../../_lib/dates.js";

const TIPOS_VALIDOS = new Set(["nota", "url"]);

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const { results } = await db
    .prepare("SELECT * FROM avances WHERE trabajo_id = ? ORDER BY creado_en DESC, id DESC")
    .bind(trabajoId)
    .all();
  return json({ avances: results });
}

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const trabajo = await db.prepare("SELECT id FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  const tipo = body.tipo;
  if (!TIPOS_VALIDOS.has(tipo)) return json({ error: "Tipo de avance inválido." }, 400);

  const texto = (body.texto || "").trim();
  const valor = (body.valor || "").trim();

  if (tipo === "nota" && !texto) return json({ error: "Escribe una nota." }, 400);
  if (tipo === "url") {
    if (!valor) return json({ error: "Ingresa un enlace." }, 400);
    if (!/^https?:\/\//i.test(valor)) {
      return json({ error: "El enlace debe empezar con http:// o https://" }, 400);
    }
  }

  // Nace oculto para el cliente: tú decides cuándo marcarlo visible (ver
  // PUT en [avanceId].js), para poder armar el avance con calma antes de
  // "publicarlo".
  const result = await db
    .prepare(
      "INSERT INTO avances (trabajo_id, tipo, texto, valor, creado_en, visible_cliente) VALUES (?,?,?,?,?,0)"
    )
    .bind(trabajoId, tipo, texto || null, valor || null, nowIso())
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}
