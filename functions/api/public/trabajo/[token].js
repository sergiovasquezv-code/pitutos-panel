import { json } from "../../../_lib/json.js";
import { infoAbono, equipoConGarantia } from "../../../_lib/negocio.js";

export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const token = params.token;
  const trabajo = await db
    .prepare(
      `SELECT trabajos.id, trabajos.tipo, trabajos.descripcion, trabajos.estado, trabajos.monto,
              trabajos.fecha_creacion, trabajos.fecha_cierre, trabajos.mostrar_detalle_cliente,
              clientes.nombre AS cliente_nombre
       FROM trabajos JOIN clientes ON clientes.id = trabajos.cliente_id
       WHERE trabajos.public_token = ?`
    )
    .bind(token)
    .first();

  if (!trabajo) return json({ error: "Este link no es válido." }, 404);

  // El "Detalle y pago" (desglose, garantía, cuánto lleva pagado) solo se
  // manda si tú lo activaste a propósito para este trabajo — mientras está
  // en curso el monto puede ser todavía provisorio y no corresponde
  // mostrárselo al cliente sin que tú decidas cuándo.
  const mostrarDetalle = !!trabajo.mostrar_detalle_cliente;

  // Solo se manda al cliente lo que el técnico marcó como visible para él
  // (los hitos de cambio de estado siempre lo son; notas/fotos/enlaces solo
  // cuando se marcan a propósito).
  const { results: avances } = await db
    .prepare(
      "SELECT id, tipo, texto, valor, creado_en, editado_en, revisado_en FROM avances WHERE trabajo_id = ? AND visible_cliente = 1 ORDER BY creado_en ASC, id ASC"
    )
    .bind(trabajo.id)
    .all();

  // Desglose del trabajo (repuestos/servicios con su valor) — para que el
  // cliente vea claro en qué se compone el total, no solo un monto suelto.
  let items = [];
  let equipos = [];
  let pago = {};
  if (mostrarDetalle) {
    items = (
      await db
        .prepare("SELECT id, tipo, descripcion, valor FROM items_trabajo WHERE trabajo_id = ? ORDER BY creado_en ASC, id ASC")
        .bind(trabajo.id)
        .all()
    ).results;

    pago = await infoAbono(db, "trabajo", trabajo.id, trabajo.monto);

    // Equipos/productos en garantía que salieron de este trabajo (ej: el
    // disco duro que se cambió). Van incluidos automáticamente junto con el
    // resto del "Detalle y pago" — no tienen un interruptor propio aparte,
    // para no duplicar la decisión de qué mostrar. Se manda el mismo
    // detalle completo que trae la ficha de garantía propia del equipo
    // (fotos, historial de pagos, condiciones) para que el cliente lo vea
    // todo aquí mismo, sin tener que abrir un link aparte.
    const equiposRaw = (
      await db
        .prepare(
          "SELECT id, tipo_equipo, marca_modelo, fecha_venta, meses_garantia, precio, public_token FROM equipos WHERE trabajo_id = ? ORDER BY creado_en ASC, id ASC"
        )
        .bind(trabajo.id)
        .all()
    ).results;
    equipos = await Promise.all(
      equiposRaw.map(async (e) => {
        const infoEquipo = await infoAbono(db, "equipo", e.id, e.precio);
        const historial = (
          await db
            .prepare("SELECT monto, fecha_pago, nota FROM abonos WHERE categoria = 'equipo' AND referencia_id = ? ORDER BY fecha_pago, id")
            .bind(e.id)
            .all()
        ).results;
        const fotos = (
          await db
            .prepare("SELECT r2_key, descripcion FROM fotos_equipo WHERE equipo_id = ? ORDER BY creado_en ASC, id ASC")
            .bind(e.id)
            .all()
        ).results;
        const { id, precio, ...equipoPublico } = equipoConGarantia(e);
        return { ...equipoPublico, monto_total: precio, ...infoEquipo, historial, fotos };
      })
    );
  }

  // Última fecha en que hubo movimiento: la del avance más reciente
  // (o su edición), o si no hay avances, cuándo se creó el trabajo.
  let ultimaActualizacion = trabajo.fecha_creacion;
  for (const a of avances) {
    const fecha = a.editado_en || a.creado_en;
    if (fecha && fecha > ultimaActualizacion) ultimaActualizacion = fecha;
  }

  const { id, mostrar_detalle_cliente, ...trabajoPublico } = trabajo;
  if (!mostrarDetalle) trabajoPublico.monto = 0;
  return json({
    negocio: env.NOMBRE_NEGOCIO || "Pitutos Informáticos",
    negocio_telefono: env.NEGOCIO_TELEFONO || null,
    trabajo: { ...trabajoPublico, ...pago },
    items,
    equipos,
    avances,
    ultima_actualizacion: ultimaActualizacion,
  });
}
