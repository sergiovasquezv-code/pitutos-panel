import { json } from "../../../_lib/json.js";
import { equipoConGarantia, infoAbono } from "../../../_lib/negocio.js";

// Vista pública (sin login) de un link combinado: muestra exactamente los
// equipos que el negocio eligió incluir cuando generó el link. Mismo
// criterio de qué se expone que en /api/public/equipo/[token].js (precio,
// abonos y fotos sí se muestran, a propósito).
export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const token = params.token;

  const link = await db
    .prepare(
      `SELECT links_combinados.equipo_ids, clientes.nombre AS cliente_nombre
       FROM links_combinados JOIN clientes ON clientes.id = links_combinados.cliente_id
       WHERE links_combinados.public_token = ?`
    )
    .bind(token)
    .first();
  if (!link) return json({ error: "Este link no es válido." }, 404);

  let equipoIds = [];
  try {
    equipoIds = JSON.parse(link.equipo_ids);
  } catch {
    equipoIds = [];
  }
  if (!Array.isArray(equipoIds) || equipoIds.length === 0) {
    return json({ error: "Este link no es válido." }, 404);
  }

  const placeholders = equipoIds.map(() => "?").join(",");
  const { results: equiposRaw } = await db
    .prepare(
      `SELECT id, tipo_equipo, marca_modelo, numero_serie, precio, fecha_venta, meses_garantia
       FROM equipos WHERE id IN (${placeholders})`
    )
    .bind(...equipoIds)
    .all();

  // Se respeta el orden en que el negocio los eligió al generar el link.
  const porId = new Map(equiposRaw.map((e) => [e.id, e]));
  const equipos = [];
  for (const eid of equipoIds) {
    const e = porId.get(eid);
    if (!e) continue;

    const info = await infoAbono(db, "equipo", e.id, e.precio);
    const historial = (
      await db
        .prepare(
          "SELECT monto, fecha_pago, nota FROM abonos WHERE categoria = 'equipo' AND referencia_id = ? ORDER BY fecha_pago, id"
        )
        .bind(e.id)
        .all()
    ).results;
    const fotos = (
      await db
        .prepare(
          "SELECT r2_key, descripcion, creado_en FROM fotos_equipo WHERE equipo_id = ? ORDER BY creado_en ASC, id ASC"
        )
        .bind(e.id)
        .all()
    ).results;

    const { id, precio, ...equipoPublico } = e;
    equipos.push({
      equipo: equipoConGarantia(equipoPublico),
      monto_total: precio,
      historial,
      fotos,
      ...info,
    });
  }

  if (equipos.length === 0) return json({ error: "Este link no es válido." }, 404);

  return json({
    negocio: env.NOMBRE_NEGOCIO || "Pitutos Informáticos",
    cliente_nombre: link.cliente_nombre,
    equipos,
  });
}
