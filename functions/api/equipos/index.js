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
  const result = await db
    .prepare(
      `INSERT INTO equipos
       (cliente_id, trabajo_id, tipo_equipo, marca_modelo, numero_serie, precio, fecha_venta, meses_garantia, notas, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      clienteId,
      trabajoId,
      tipoEquipo,
      (body.marca_modelo || "").trim(),
      (body.numero_serie || "").trim(),
      Number(body.precio) || 0,
      fechaVenta,
      Number(body.meses_garantia) || 3,
      (body.notas || "").trim(),
      nowIso()
    )
    .run();

  return json({ ok: true, id: result.meta.last_row_id, cliente_id: clienteId });
}
