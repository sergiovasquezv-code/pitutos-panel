import { json } from "../../../_lib/json.js";
import { infoAbono } from "../../../_lib/negocio.js";

const CONFIG = {
  trabajo: {
    tabla: "trabajos",
    campoMonto: "monto",
    concepto: (r) => (r.tipo ? `${r.tipo} — ${r.descripcion}` : r.descripcion),
  },
  equipo: {
    tabla: "equipos",
    campoMonto: "precio",
    concepto: (r) => (r.marca_modelo ? `${r.tipo_equipo} (${r.marca_modelo})` : r.tipo_equipo),
  },
  mensualidad: {
    tabla: "mensualidades",
    campoMonto: "monto",
    concepto: (r) => r.descripcion,
  },
};

// Vista pública (sin login) de un comprobante de abono: solo quien tenga
// el link con el token puede verla. No exponemos ids internos ni datos de
// otros clientes — solo el detalle de este pago y el estado de la cuenta
// a la que pertenece (igual criterio que garantía/seguimiento).
export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const token = params.token;

  const abono = await db.prepare("SELECT * FROM abonos WHERE public_token = ?").bind(token).first();
  if (!abono) return json({ error: "Este comprobante no es válido." }, 404);

  const config = CONFIG[abono.categoria];
  if (!config) return json({ error: "Este comprobante no es válido." }, 404);

  const item = await db
    .prepare(
      `SELECT ${config.tabla}.*, clientes.nombre AS cliente_nombre
       FROM ${config.tabla} JOIN clientes ON clientes.id = ${config.tabla}.cliente_id
       WHERE ${config.tabla}.id = ?`
    )
    .bind(abono.referencia_id)
    .first();
  if (!item) return json({ error: "Este comprobante ya no está disponible." }, 404);

  const info = await infoAbono(db, abono.categoria, abono.referencia_id, item[config.campoMonto], abono.periodo);

  const historialStmt = abono.periodo
    ? db
        .prepare(
          "SELECT monto, fecha_pago, nota FROM abonos WHERE categoria = ? AND referencia_id = ? AND periodo = ? ORDER BY fecha_pago, id"
        )
        .bind(abono.categoria, abono.referencia_id, abono.periodo)
    : db
        .prepare(
          "SELECT monto, fecha_pago, nota FROM abonos WHERE categoria = ? AND referencia_id = ? AND periodo IS NULL ORDER BY fecha_pago, id"
        )
        .bind(abono.categoria, abono.referencia_id);
  const historial = (await historialStmt.all()).results;

  return json({
    negocio: env.NOMBRE_NEGOCIO || "Pitutos Informáticos",
    categoria: abono.categoria,
    concepto: config.concepto(item),
    cliente_nombre: item.cliente_nombre,
    periodo: abono.periodo,
    abono: { monto: abono.monto, fecha_pago: abono.fecha_pago, nota: abono.nota },
    monto_total: item[config.campoMonto],
    historial,
    ...info,
  });
}
