import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";
import { randomToken } from "../../_lib/tokens.js";

// Genera un link público combinado con exactamente los equipos que el
// negocio elija (no necesariamente todo el grupo) para un mismo cliente.
// Cada llamada crea un link nuevo (igual que los comprobantes de abono),
// así que los links ya enviados antes siguen funcionando aunque después se
// arme otro con una selección distinta.
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const clienteId = Number(body.cliente_id);
  const equipoIds = Array.isArray(body.equipo_ids) ? [...new Set(body.equipo_ids.map(Number).filter(Boolean))] : [];

  if (!clienteId) return json({ error: "Falta el cliente." }, 400);
  if (equipoIds.length === 0) return json({ error: "Selecciona al menos un equipo." }, 400);

  const placeholders = equipoIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT id FROM equipos WHERE cliente_id = ? AND id IN (${placeholders})`)
    .bind(clienteId, ...equipoIds)
    .all();
  if (results.length !== equipoIds.length) {
    return json({ error: "Alguno de los equipos seleccionados no es de este cliente." }, 400);
  }

  // Por defecto se muestra el precio/pago (igual que siempre); se puede
  // generar un link sin esa información, por ejemplo para una demostración.
  const mostrarPrecio = body.mostrar_precio === false ? 0 : 1;

  const token = randomToken();
  await db
    .prepare(
      "INSERT INTO links_combinados (cliente_id, equipo_ids, public_token, creado_en, mostrar_precio) VALUES (?,?,?,?,?)"
    )
    .bind(clienteId, JSON.stringify(equipoIds), token, nowIso(), mostrarPrecio)
    .run();

  return json({ ok: true, token });
}
