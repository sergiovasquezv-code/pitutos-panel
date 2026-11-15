import { json } from "../../../../_lib/json.js";
import { asegurarCantidad, lineaDesdeBody, sincronizarMonto } from "../../../../_lib/casos.js";

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const itemId = Number(params.itemId);

  await asegurarCantidad(db);
  const item = await db
    .prepare("SELECT id, tipo, descripcion, cantidad, valor FROM items_trabajo WHERE id = ? AND trabajo_id = ?")
    .bind(itemId, trabajoId)
    .first();
  if (!item) return json({ error: "Ítem no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));
  const linea = lineaDesdeBody({
    tipo: body.tipo !== undefined ? body.tipo : item.tipo,
    descripcion: body.descripcion !== undefined ? body.descripcion : item.descripcion,
    cantidad: body.cantidad !== undefined ? body.cantidad : item.cantidad,
    precio_unitario: body.precio_unitario,
    valor: body.valor !== undefined ? body.valor : item.valor,
  });
  if (!linea.descripcion) return json({ error: "Describe el producto, repuesto o servicio." }, 400);

  await db
    .prepare("UPDATE items_trabajo SET tipo = ?, descripcion = ?, cantidad = ?, valor = ? WHERE id = ?")
    .bind(linea.tipo, linea.descripcion, linea.cantidad, linea.valor, itemId)
    .run();
  const monto = await sincronizarMonto(db, trabajoId);
  return json({ ok: true, id: itemId, monto });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const trabajoId = Number(params.id);
  const itemId = Number(params.itemId);

  const item = await db
    .prepare("SELECT id FROM items_trabajo WHERE id = ? AND trabajo_id = ?")
    .bind(itemId, trabajoId)
    .first();
  if (!item) return json({ error: "Ítem no encontrado." }, 404);

  await db.prepare("DELETE FROM items_trabajo WHERE id = ?").bind(itemId).run();
  const monto = await sincronizarMonto(db, trabajoId);
  return json({ ok: true, monto });
}
