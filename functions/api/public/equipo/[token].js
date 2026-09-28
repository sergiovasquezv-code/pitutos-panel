import { json } from "../../../_lib/json.js";
import { equipoConGarantia, infoAbono } from "../../../_lib/negocio.js";

// Vista pública (sin login) de la garantía de un equipo: solo quien tenga
// el link con el token puede verla. A propósito no exponemos el id interno
// ni el cliente_id. El precio, el estado de pago (abonado/saldo/historial)
// y las fotos del estado del equipo sí se muestran aquí a propósito, porque
// el cliente necesita ver cuánto lleva pagado, cuánto le falta y cómo quedó
// su equipo cuando le llega este mismo link.
export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const token = params.token;

  const equipo = await db
    .prepare(
      `SELECT equipos.id, equipos.tipo_equipo, equipos.marca_modelo, equipos.numero_serie,
              equipos.precio, equipos.fecha_venta, equipos.meses_garantia,
              clientes.nombre AS cliente_nombre
       FROM equipos JOIN clientes ON clientes.id = equipos.cliente_id
       WHERE equipos.public_token = ?`
    )
    .bind(token)
    .first();

  if (!equipo) return json({ error: "Este link no es válido." }, 404);

  const info = await infoAbono(db, "equipo", equipo.id, equipo.precio);

  const historial = (
    await db
      .prepare(
        "SELECT monto, fecha_pago, nota FROM abonos WHERE categoria = 'equipo' AND referencia_id = ? ORDER BY fecha_pago, id"
      )
      .bind(equipo.id)
      .all()
  ).results;

  const fotos = (
    await db
      .prepare(
        "SELECT r2_key, descripcion, creado_en FROM fotos_equipo WHERE equipo_id = ? ORDER BY creado_en ASC, id ASC"
      )
      .bind(equipo.id)
      .all()
  ).results;

  const { id, precio, ...equipoPublico } = equipo;

  return json({
    negocio: env.NOMBRE_NEGOCIO || "Pitutos Informáticos",
    equipo: equipoConGarantia(equipoPublico),
    monto_total: precio,
    historial,
    fotos,
    ...info,
  });
}
