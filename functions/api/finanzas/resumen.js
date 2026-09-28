import { json } from "../../_lib/json.js";
import { infoAbono } from "../../_lib/negocio.js";
import { periodoActual } from "../../_lib/dates.js";

// Control total de la plata: para cada cliente con algún movimiento
// (trabajo, venta de equipo o mensualidad activa), cuánto se le ha
// facturado en total, cuánto ha abonado, y cuánto queda pendiente. Sirve
// para responder de un vistazo "quién está en deuda" y "quién ya pagó
// todo".
export async function onRequestGet({ env }) {
  const db = env.DB;
  const periodo = periodoActual();

  const clientes = (await db.prepare("SELECT id, nombre FROM clientes ORDER BY nombre").all()).results;

  const resumen = [];
  let totalFacturadoGlobal = 0;
  let totalAbonadoGlobal = 0;

  for (const c of clientes) {
    let totalFacturado = 0;
    let totalAbonadoCliente = 0;

    const trabajos = (
      await db.prepare("SELECT id, monto FROM trabajos WHERE cliente_id = ?").bind(c.id).all()
    ).results;
    for (const t of trabajos) {
      const info = await infoAbono(db, "trabajo", t.id, t.monto);
      totalFacturado += t.monto || 0;
      totalAbonadoCliente += info.abonado;
    }

    const equipos = (
      await db.prepare("SELECT id, precio FROM equipos WHERE cliente_id = ?").bind(c.id).all()
    ).results;
    for (const e of equipos) {
      const info = await infoAbono(db, "equipo", e.id, e.precio);
      totalFacturado += e.precio || 0;
      totalAbonadoCliente += info.abonado;
    }

    const mensualidades = (
      await db
        .prepare("SELECT id, monto FROM mensualidades WHERE cliente_id = ? AND activo = 1")
        .bind(c.id)
        .all()
    ).results;
    for (const m of mensualidades) {
      const info = await infoAbono(db, "mensualidad", m.id, m.monto, periodo);
      totalFacturado += m.monto || 0;
      totalAbonadoCliente += info.abonado;
    }

    if (totalFacturado === 0) continue; // cliente sin ningún movimiento facturable

    const saldo = Math.max(totalFacturado - totalAbonadoCliente, 0);
    totalFacturadoGlobal += totalFacturado;
    totalAbonadoGlobal += totalAbonadoCliente;

    let estado;
    if (saldo === 0) estado = "al_dia";
    else if (totalAbonadoCliente === 0) estado = "sin_abonos";
    else estado = "abono_parcial";

    resumen.push({
      cliente_id: c.id,
      cliente_nombre: c.nombre,
      total_facturado: totalFacturado,
      total_abonado: totalAbonadoCliente,
      saldo,
      estado,
    });
  }

  resumen.sort((a, b) => b.saldo - a.saldo || a.cliente_nombre.localeCompare(b.cliente_nombre));

  return json({
    periodo_actual: periodo,
    clientes: resumen,
    total_facturado: totalFacturadoGlobal,
    total_abonado: totalAbonadoGlobal,
    total_pendiente: totalFacturadoGlobal - totalAbonadoGlobal,
  });
}
