import { json } from "../../../_lib/json.js";
import { nowIso } from "../../../_lib/dates.js";
import { randomFileKey } from "../../../_lib/tokens.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const trabajo = await db.prepare("SELECT id FROM trabajos WHERE id = ?").bind(trabajoId).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "No se pudo leer el archivo enviado." }, 400);
  }

  const file = form.get("foto");
  const texto = (form.get("texto") || "").toString().trim();

  if (!file || typeof file === "string") {
    return json({ error: "Selecciona una imagen." }, 400);
  }
  if (!TIPOS_PERMITIDOS.has(file.type)) {
    return json({ error: "Solo se permiten imágenes JPG, PNG, WEBP o GIF." }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "La imagen no puede pesar más de 8 MB." }, 400);
  }
  if (!env.FOTOS) {
    return json({ error: "El almacenamiento de fotos (R2) no está configurado." }, 500);
  }

  const key = randomFileKey(trabajoId, file.name);
  await env.FOTOS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  // Nace oculta para el cliente, igual que notas y enlaces (ver PUT en
  // avances/[avanceId].js para marcarla visible cuando corresponda).
  const result = await db
    .prepare(
      "INSERT INTO avances (trabajo_id, tipo, texto, valor, creado_en, visible_cliente) VALUES (?,?,?,?,?,0)"
    )
    .bind(trabajoId, "foto", texto || null, key, nowIso())
    .run();

  return json({ ok: true, id: result.meta.last_row_id, key });
}
