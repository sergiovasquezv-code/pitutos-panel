import { json } from "../../_lib/json.js";
import { nowIso } from "../../_lib/dates.js";
import { borrarAvancesDeTrabajo } from "../../_lib/avances.js";
import { infoAbono, equipoConGarantia } from "../../_lib/negocio.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const trabajo = await db
    .prepare(
      `SELECT trabajos.*, clientes.nombre AS cliente_nombre, clientes.telefono AS cliente_telefono
       FROM trabajos JOIN clientes ON clientes.id = trabajos.cliente_id
       WHERE trabajos.id = ?`
    )
    .bind(id)
    .first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);
  const info = await infoAbono(db, "trabajo", id, trabajo.monto);

  // Equipos/productos en garantía que salieron de este trabajo, para que se
  // vean aquí mismo (en la ficha del trabajo) y no haya que ir a buscarlos
  // a otra pantalla.
  const { results: equiposRaw } = await db
    .prepare(
      "SELECT * FROM equipos WHERE trabajo_id = ? ORDER BY creado_en ASC, id ASC"
    )
    .bind(id)
    .all();
  const equiposVinculados = await Promise.all(
    equiposRaw.map(async (e) => ({
      ...equipoConGarantia(e),
      ...(await infoAbono(db, "equipo", e.id, e.precio)),
    }))
  );

  return json({ trabajo: { ...trabajo, ...info }, equiposVinculados });
}

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const trabajo = await db.prepare("SELECT * FROM trabajos WHERE id = ?").bind(id).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));

  // Toggle rápido de "mostrar detalle y pago al cliente", sin pasar por el
  // formulario completo — se usa desde el botón mostrar/ocultar de esa
  // sección en la ficha del trabajo.
  if (typeof body.mostrar_detalle_cliente === "boolean" && body.tipo === undefined && body.estado === undefined) {
    const mostrar = body.mostrar_detalle_cliente ? 1 : 0;
    // detalle_visible_desde guarda trazabilidad de cuándo se activó; no se
    // borra si después se vuelve a ocultar.
    const detalleDesde = body.mostrar_detalle_cliente ? nowIso() : trabajo.detalle_visible_desde;
    await db
      .prepare("UPDATE trabajos SET mostrar_detalle_cliente = ?, detalle_visible_desde = ? WHERE id = ?")
      .bind(mostrar, detalleDesde, id)
      .run();
    return json({ ok: true, mostrar_detalle_cliente: !!mostrar, detalle_visible_desde: detalleDesde });
  }

  // Cambio de monto rápido (ej: "usar el total del desglose").
  if (body.solo_monto !== undefined) {
    await db.prepare("UPDATE trabajos SET monto = ? WHERE id = ?").bind(Math.max(Number(body.solo_monto) || 0, 0), id).run();
    return json({ ok: true });
  }

  const estado = body.estado || "Recibido";
  const fechaEntrega =
    body.fecha_entrega !== undefined ? (String(body.fecha_entrega || "").trim() || null) : trabajo.fecha_entrega;
  let fechaCierre = trabajo.fecha_cierre;
  if (estado === "Entregado" && !fechaCierre) fechaCierre = nowIso();
  else if (estado !== "Entregado") fechaCierre = null;

  const mostrarDetalle = body.mostrar_detalle_cliente ? 1 : 0;
  const detalleDesde = mostrarDetalle
    ? trabajo.mostrar_detalle_cliente
      ? trabajo.detalle_visible_desde
      : nowIso()
    : trabajo.detalle_visible_desde;

  await db
    .prepare(
      "UPDATE trabajos SET tipo=?, descripcion=?, estado=?, monto=?, fecha_cierre=?, fecha_entrega=?, notas=?, mostrar_detalle_cliente=?, detalle_visible_desde=? WHERE id=?"
    )
    .bind(
      body.tipo || trabajo.tipo,
      (body.descripcion || "").trim() || trabajo.descripcion,
      estado,
      body.monto === undefined ? trabajo.monto : Number(body.monto) || 0,
      fechaCierre,
      fechaEntrega,
      body.notas === undefined ? trabajo.notas : (body.notas || "").trim(),
      mostrarDetalle,
      detalleDesde,
      id
    )
    .run();

  // Si el estado cambió, dejamos un hito automático en la línea de tiempo.
  // Siempre es visible para el cliente — a diferencia de notas/fotos/enlaces,
  // que nacen ocultas hasta que tú las marcas.
  const entregaCambio = estado === "Entrega fijada" && fechaEntrega && fechaEntrega !== trabajo.fecha_entrega;
  if (estado !== trabajo.estado || entregaCambio) {
    const ahora = nowIso();
    const texto =
      estado === "Entrega fijada" && fechaEntrega
        ? `Entrega fijada para el ${fechaEntrega.replace("T", " a las ")}`
        : `Estado actualizado a "${estado}"`;
    await db
      .prepare(
        "INSERT INTO avances (trabajo_id, tipo, texto, valor, creado_en, visible_cliente, visible_desde) VALUES (?,?,?,?,?,1,?)"
      )
      .bind(id, "estado", texto, estado, ahora, ahora)
      .run();
  }

  // Nota opcional del paso (ej: "Se cambió el disco"): queda visible.
  const notaPaso = (body.nota_paso || "").trim();
  if (notaPaso) {
    const ahora = nowIso();
    await db
      .prepare(
        "INSERT INTO avances (trabajo_id, tipo, texto, valor, creado_en, visible_cliente, visible_desde) VALUES (?,?,?,?,?,1,?)"
      )
      .bind(id, "nota", notaPaso, null, ahora, ahora)
      .run();
  }

  return json({ ok: true, cliente_id: trabajo.cliente_id });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const trabajo = await db.prepare("SELECT cliente_id FROM trabajos WHERE id = ?").bind(id).first();
  if (!trabajo) return json({ error: "Trabajo no encontrado." }, 404);

  await borrarAvancesDeTrabajo(db, env, id);
  await db.prepare("DELETE FROM abonos WHERE categoria = 'trabajo' AND referencia_id = ?").bind(id).run();
  await db.prepare("DELETE FROM items_trabajo WHERE trabajo_id = ?").bind(id).run();
  await db.prepare("DELETE FROM envios_cliente WHERE trabajo_id = ?").bind(id).run();
  // Los equipos/garantías no se borran (siguen siendo del cliente y pueden
  // seguir bajo garantía), solo se desvinculan de este trabajo.
  await db.prepare("UPDATE equipos SET trabajo_id = NULL WHERE trabajo_id = ?").bind(id).run();
  await db.prepare("DELETE FROM trabajos WHERE id = ?").bind(id).run();
  return json({ ok: true, cliente_id: trabajo.cliente_id });
}
