import { json } from "../../_lib/json.js";
import { equipoConGarantia, mensualidadConPago, infoAbono } from "../../_lib/negocio.js";
import { borrarAvancesDeTrabajo, borrarFotosDeEquipo } from "../../_lib/avances.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const cliente = await db.prepare("SELECT * FROM clientes WHERE id = ?").bind(id).first();
  if (!cliente) return json({ error: "Cliente no encontrado." }, 404);

  const equiposRaw = (
    await db
      .prepare("SELECT * FROM equipos WHERE cliente_id = ? ORDER BY fecha_venta DESC")
      .bind(id)
      .all()
  ).results;
  const equipos = await Promise.all(
    equiposRaw.map(async (e) => ({
      ...equipoConGarantia(e),
      ...(await infoAbono(db, "equipo", e.id, e.precio)),
    }))
  );

  const trabajosRaw = (
    await db
      .prepare("SELECT * FROM trabajos WHERE cliente_id = ? ORDER BY fecha_creacion DESC")
      .bind(id)
      .all()
  ).results;
  const trabajos = await Promise.all(
    trabajosRaw.map(async (t) => ({ ...t, ...(await infoAbono(db, "trabajo", t.id, t.monto)) }))
  );

  const mensualidadesRaw = (
    await db
      .prepare(
        "SELECT * FROM mensualidades WHERE cliente_id = ? ORDER BY activo DESC, descripcion"
      )
      .bind(id)
      .all()
  ).results;
  const mensualidades = await Promise.all(mensualidadesRaw.map((m) => mensualidadConPago(db, m)));

  return json({ cliente, equipos, trabajos, mensualidades });
}

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const existing = await db.prepare("SELECT id FROM clientes WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Cliente no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  const nombre = (body.nombre || "").trim();
  if (!nombre) return json({ error: "El nombre es obligatorio." }, 400);

  await db
    .prepare("UPDATE clientes SET nombre=?, telefono=?, email=?, direccion=?, notas=?, rut=? WHERE id=?")
    .bind(
      nombre,
      (body.telefono || "").trim(),
      (body.email || "").trim(),
      (body.direccion || "").trim(),
      (body.notas || "").trim(),
      (body.rut || "").trim(),
      id
    )
    .run();

  return json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const existing = await db.prepare("SELECT id FROM clientes WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Cliente no encontrado." }, 404);

  // Cascada manual (D1 no garantiza ON DELETE CASCADE entre requests).
  const mensIds = (
    await db.prepare("SELECT id FROM mensualidades WHERE cliente_id = ?").bind(id).all()
  ).results.map((r) => r.id);
  for (const mid of mensIds) {
    await db.prepare("DELETE FROM pagos_mensualidad WHERE mensualidad_id = ?").bind(mid).run();
    await db.prepare("DELETE FROM abonos WHERE categoria = 'mensualidad' AND referencia_id = ?").bind(mid).run();
  }

  const trabajoIds = (
    await db.prepare("SELECT id FROM trabajos WHERE cliente_id = ?").bind(id).all()
  ).results.map((r) => r.id);
  for (const tid of trabajoIds) {
    await borrarAvancesDeTrabajo(db, env, tid);
    await db.prepare("DELETE FROM abonos WHERE categoria = 'trabajo' AND referencia_id = ?").bind(tid).run();
    await db.prepare("DELETE FROM items_trabajo WHERE trabajo_id = ?").bind(tid).run();
    await db.prepare("DELETE FROM envios_cliente WHERE trabajo_id = ?").bind(tid).run();
  }

  const equipoIds = (
    await db.prepare("SELECT id FROM equipos WHERE cliente_id = ?").bind(id).all()
  ).results.map((r) => r.id);
  for (const eid of equipoIds) {
    await borrarFotosDeEquipo(db, env, eid);
    await db.prepare("DELETE FROM abonos WHERE categoria = 'equipo' AND referencia_id = ?").bind(eid).run();
  }

  await db.prepare("DELETE FROM equipos WHERE cliente_id = ?").bind(id).run();
  await db.prepare("DELETE FROM trabajos WHERE cliente_id = ?").bind(id).run();
  await db.prepare("DELETE FROM mensualidades WHERE cliente_id = ?").bind(id).run();
  await db.prepare("DELETE FROM clientes WHERE id = ?").bind(id).run();

  return json({ ok: true });
}
