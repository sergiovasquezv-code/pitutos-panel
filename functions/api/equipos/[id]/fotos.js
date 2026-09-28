import { json } from "../../../_lib/json.js";
import { nowIso } from "../../../_lib/dates.js";
import { randomFileKeyEquipo } from "../../../_lib/tokens.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Sube una foto que refleja el estado actual del equipo (cómo llegó, cómo
// quedó tras una reparación, etc.). El cliente la ve en su link público de
// garantía junto con el estado de pago.
export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const equipoId = Number(params.id);
  const equipo = await db.prepare("SELECT id FROM equipos WHERE id = ?").bind(equipoId).first();
  if (!equipo) return json({ error: "Equipo no encontrado." }, 404);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "No se pudo leer el archivo enviado." }, 400);
  }

  const file = form.get("foto");
  const descripcion = (form.get("descripcion") || "").toString().trim();

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

  const key = randomFileKeyEquipo(equipoId, file.name);
  await env.FOTOS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const result = await db
    .prepare("INSERT INTO fotos_equipo (equipo_id, r2_key, descripcion, creado_en) VALUES (?,?,?,?)")
    .bind(equipoId, key, descripcion || null, nowIso())
    .run();

  return json({ ok: true, id: result.meta.last_row_id, key });
}
