import { json } from "../../_lib/json.js";
import { nowIso, todayStr } from "../../_lib/dates.js";
import { equipoConGarantia, infoAbono } from "../../_lib/negocio.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT equipos.*, clientes.nombre AS cliente_nombre
       FROM equipos JOIN clientes ON clientes.id = equipos.cliente_id
       ORDER BY fecha_venta DESC`
    )
    .all();
  const equipos = await Promise.all(
    results.map(async (e) => ({
      ...equipoConGarantia(e),
      ...(await infoAbono(db, "equipo", e.id, e.precio)),
    }))
  );
  return json({ equipos });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const clienteId = Number(body.cliente_id);
  const tipoEquipo = (body.tipo_equipo || "").trim();

  if (!clienteId) return json({ error: "Selecciona un cliente." }, 400);
  if (!tipoEquipo) return json({ error: "Indica el tipo de equipo." }, 400);

  const cliente = await db.prepare("SELECT id FROM clientes WHERE id = ?").bind(clienteId).first();
  if (!cliente) return json({ error: "Cliente no encontrado." }, 400);

  const fechaVenta = (body.fecha_venta || "").trim() || todayStr();
  const trabajoId = Number(body.trabajo_id) || null;

  // Si viene grupo_id, se valida que el grupo sea de este mismo cliente
  // (permite agregar otro componente a un "sistema" ya agrupado).
  let grupoId = Number(body.grupo_id) || null;
  if (grupoId) {
    const grupo = await db
      .prepare("SELECT id FROM grupos_equipos WHERE id = ? AND cliente_id = ?")
      .bind(grupoId, clienteId)
      .first();
    if (!grupo) grupoId = null;
  }

  const result = await db
    .prepare(
      `INSERT INTO equipos
       (cliente_id, trabajo_id, tipo_equipo, marca_modelo, numero_serie, precio, fecha_venta, meses_garantia, notas, creado_en, grupo_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      clienteId,
      trabajoId,
      tipoEquipo,
      (body.marca_modelo || "").trim(),
      (body.numero_serie || "").trim(),
      Number(body.precio) || 0,
      fechaVenta,
      // 0 es válido a propósito: significa "sin garantía".
      body.meses_garantia === undefined || body.meses_garantia === "" ? 3 : Math.max(0, Number(body.meses_garantia) || 0),
      (body.notas || "").trim(),
      nowIso(),
      grupoId
    )
    .run();

  return json({ ok: true, id: result.meta.last_row_id, cliente_id: clienteId });
}
