import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";

// Crea un grupo de equipos (una venta tipo "sistema" con varios
// componentes que comparten garantía) y, opcionalmente, asigna de una vez
// los equipos indicados en equipo_ids — sirve tanto para agrupar al vender
// (nuevo) como para agrupar retroactivamente equipos ya cargados.
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const clienteId = Number(body.cliente_id);
  const nombre = (body.nombre || "").trim();

  if (!clienteId) return json({ error: "Falta el cliente." }, 400);
  if (!nombre) return json({ error: "Indica un nombre para el grupo (ej: Sistema de venta)." }, 400);

  const cliente = await db.prepare("SELECT id FROM clientes WHERE id = ?").bind(clienteId).first();
  if (!cliente) return json({ error: "Cliente no encontrado." }, 400);

  const result = await db
    .prepare("INSERT INTO grupos_equipos (cliente_id, nombre, creado_en) VALUES (?,?,?)")
    .bind(clienteId, nombre, nowIso())
    .run();
  const grupoId = result.meta.last_row_id;

  const equipoIds = Array.isArray(body.equipo_ids) ? body.equipo_ids.map(Number).filter(Boolean) : [];
  for (const eid of equipoIds) {
    // Solo se asignan equipos que efectivamente son de este mismo cliente.
    await db
      .prepare("UPDATE equipos SET grupo_id = ? WHERE id = ? AND cliente_id = ?")
      .bind(grupoId, eid, clienteId)
      .run();
  }

  return json({ ok: true, id: grupoId, cliente_id: clienteId, nombre });
}
