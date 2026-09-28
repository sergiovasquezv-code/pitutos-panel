import { json } from "../../_lib/json.js";
import { mensualidadConPago } from "../../_lib/negocio.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const mensualidad = await db
    .prepare(
      `SELECT mensualidades.*, clientes.nombre AS cliente_nombre, clientes.telefono AS cliente_telefono
       FROM mensualidades JOIN clientes ON clientes.id = mensualidades.cliente_id
       WHERE mensualidades.id = ?`
    )
    .bind(id)
    .first();
  if (!mensualidad) return json({ error: "Mensualidad no encontrada." }, 404);
  const info = await mensualidadConPago(db, mensualidad);
  return json({ mensualidad: info });
}

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const mensualidad = await db.prepare("SELECT * FROM mensualidades WHERE id = ?").bind(id).first();
  if (!mensualidad) return json({ error: "Mensualidad no encontrada." }, 404);

  const body = await request.json().catch(() => ({}));
  await db
    .prepare("UPDATE mensualidades SET descripcion=?, monto=?, dia_cobro=?, activo=? WHERE id=?")
    .bind(
      (body.descripcion || "").trim() || mensualidad.descripcion,
      Number(body.monto) || 0,
      Number(body.dia_cobro) || 1,
      body.activo ? 1 : 0,
      id
    )
    .run();

  return json({ ok: true, cliente_id: mensualidad.cliente_id });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const mensualidad = await db
    .prepare("SELECT cliente_id FROM mensualidades WHERE id = ?")
    .bind(id)
    .first();
  if (!mensualidad) return json({ error: "Mensualidad no encontrada." }, 404);

  await db.prepare("DELETE FROM pagos_mensualidad WHERE mensualidad_id = ?").bind(id).run();
  await db.prepare("DELETE FROM abonos WHERE categoria = 'mensualidad' AND referencia_id = ?").bind(id).run();
  await db.prepare("DELETE FROM mensualidades WHERE id = ?").bind(id).run();

  return json({ ok: true, cliente_id: mensualidad.cliente_id });
}
