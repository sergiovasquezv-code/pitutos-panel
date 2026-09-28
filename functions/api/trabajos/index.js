import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";
import { infoAbono } from "../../_lib/negocio.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const estado = (url.searchParams.get("estado") || "").trim();

  const base = `SELECT trabajos.*, clientes.nombre AS cliente_nombre
                FROM trabajos JOIN clientes ON clientes.id = trabajos.cliente_id`;
  let stmt;
  if (estado === "abiertos") {
    stmt = db.prepare(base + " WHERE trabajos.estado != 'Terminado' ORDER BY fecha_creacion DESC");
  } else if (estado) {
    stmt = db.prepare(base + " WHERE trabajos.estado = ? ORDER BY fecha_creacion DESC").bind(estado);
  } else {
    stmt = db.prepare(base + " ORDER BY fecha_creacion DESC");
  }
  const { results } = await stmt.all();
  const trabajos = await Promise.all(
    results.map(async (t) => ({ ...t, ...(await infoAbono(db, "trabajo", t.id, t.monto)) }))
  );
  return json({ trabajos });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const clienteId = Number(body.cliente_id);
  const descripcion = (body.descripcion || "").trim();

  if (!clienteId) return json({ error: "Selecciona un cliente." }, 400);
  if (!descripcion) return json({ error: "Describe el trabajo." }, 400);

  const cliente = await db.prepare("SELECT id FROM clientes WHERE id = ?").bind(clienteId).first();
  if (!cliente) return json({ error: "Cliente no encontrado." }, 400);

  const result = await db
    .prepare(
      `INSERT INTO trabajos (cliente_id, tipo, descripcion, estado, monto, fecha_creacion, fecha_cierre, notas)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .bind(
      clienteId,
      body.tipo || "Programación",
      descripcion,
      body.estado || "Pendiente",
      Number(body.monto) || 0,
      nowIso(),
      null,
      (body.notas || "").trim()
    )
    .run();

  return json({ ok: true, id: result.meta.last_row_id, cliente_id: clienteId });
}
