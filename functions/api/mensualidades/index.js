import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";
import { mensualidadConPago } from "../../_lib/negocio.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT mensualidades.*, clientes.nombre AS cliente_nombre
       FROM mensualidades JOIN clientes ON clientes.id = mensualidades.cliente_id
       ORDER BY mensualidades.activo DESC, clientes.nombre`
    )
    .all();
  const mensualidades = await Promise.all(results.map((m) => mensualidadConPago(db, m)));
  return json({ mensualidades });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const clienteId = Number(body.cliente_id);
  const descripcion = (body.descripcion || "").trim();

  if (!clienteId) return json({ error: "Selecciona un cliente." }, 400);
  if (!descripcion) return json({ error: "Describe el servicio." }, 400);

  const cliente = await db.prepare("SELECT id FROM clientes WHERE id = ?").bind(clienteId).first();
  if (!cliente) return json({ error: "Cliente no encontrado." }, 400);

  const result = await db
    .prepare(
      "INSERT INTO mensualidades (cliente_id, descripcion, monto, dia_cobro, activo, creado_en) VALUES (?,?,?,?,?,?)"
    )
    .bind(clienteId, descripcion, Number(body.monto) || 0, Number(body.dia_cobro) || 1, 1, nowIso())
    .run();

  return json({ ok: true, id: result.meta.last_row_id, cliente_id: clienteId });
}
