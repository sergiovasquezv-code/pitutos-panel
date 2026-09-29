import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";
import { equipoConGarantia, infoAbono } from "../../_lib/negocio.js";
import { borrarFotosDeEquipo } from "../../_lib/avances.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const equipo = await db
    .prepare(
      `SELECT equipos.*, clientes.nombre AS cliente_nombre, clientes.telefono AS cliente_telefono
       FROM equipos JOIN clientes ON clientes.id = equipos.cliente_id
       WHERE equipos.id = ?`
    )
    .bind(id)
    .first();
  if (!equipo) return json({ error: "Equipo no encontrado." }, 404);
  const info = await infoAbono(db, "equipo", id, equipo.precio);
  const { results: fotos } = await db
    .prepare(
      "SELECT id, r2_key, descripcion, creado_en, visible_cliente, visible_desde FROM fotos_equipo WHERE equipo_id = ? ORDER BY creado_en ASC, id ASC"
    )
    .bind(id)
    .all();
  return json({ equipo: { ...equipoConGarantia(equipo), ...info, fotos } });
}

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const equipo = await db.prepare("SELECT * FROM equipos WHERE id = ?").bind(id).first();
  if (!equipo) return json({ error: "Equipo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));

  // Toggle rápido de "mostrar la garantía de este equipo al cliente" en la
  // página de seguimiento del trabajo, sin tocar el resto del formulario.
  if (typeof body.visible_cliente === "boolean" && body.tipo_equipo === undefined) {
    const visibleCliente = body.visible_cliente ? 1 : 0;
    // visible_desde guarda trazabilidad de cuándo se hizo visible; no se
    // borra si después se vuelve a ocultar.
    const visibleDesde = body.visible_cliente ? nowIso() : equipo.visible_desde;
    await db
      .prepare("UPDATE equipos SET visible_cliente = ?, visible_desde = ? WHERE id = ?")
      .bind(visibleCliente, visibleDesde, id)
      .run();
    return json({ ok: true, visible_cliente: !!visibleCliente, visible_desde: visibleDesde });
  }

  await db
    .prepare(
      `UPDATE equipos SET tipo_equipo=?, marca_modelo=?, numero_serie=?, precio=?,
       fecha_venta=?, meses_garantia=?, notas=? WHERE id=?`
    )
    .bind(
      (body.tipo_equipo || "").trim() || equipo.tipo_equipo,
      (body.marca_modelo || "").trim(),
      (body.numero_serie || "").trim(),
      Number(body.precio) || 0,
      (body.fecha_venta || "").trim() || equipo.fecha_venta,
      // 0 es válido a propósito: significa "sin garantía" (no se confunde
      // con "no venía en el body", que cae en el default de 3).
      body.meses_garantia === undefined || body.meses_garantia === "" ? equipo.meses_garantia : Math.max(0, Number(body.meses_garantia) || 0),
      (body.notas || "").trim(),
      id
    )
    .run();

  return json({ ok: true, cliente_id: equipo.cliente_id });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const equipo = await db.prepare("SELECT cliente_id FROM equipos WHERE id = ?").bind(id).first();
  if (!equipo) return json({ error: "Equipo no encontrado." }, 404);

  await borrarFotosDeEquipo(db, env, id);
  await db.prepare("DELETE FROM abonos WHERE categoria = 'equipo' AND referencia_id = ?").bind(id).run();
  await db.prepare("DELETE FROM equipos WHERE id = ?").bind(id).run();
  return json({ ok: true, cliente_id: equipo.cliente_id });
}
