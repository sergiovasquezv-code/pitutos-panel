import { json } from "../../_lib/json.js";
import { infoAbono } from "../../_lib/negocio.js";
import { periodoActual, todayStr, addMonths } from "../../_lib/dates.js";

// Mes (YYYY-MM) de una fecha. Las fechas con hora (ISO, en UTC) se pasan a
// la hora de Chile para que algo hecho el 30 a las 11 de la noche no caiga
// en el mes siguiente.
function mesDe(fecha) {
  if (!fecha) return null;
  const s = String(fecha);
  let mes;
  if (s.length > 10 && s.includes("T")) {
    const d = new Date(s);
    mes = isNaN(d.getTime()) ? s.slice(0, 7) : todayStr(d).slice(0, 7);
  } else {
    mes = s.slice(0, 7);
  }
  return /^\d{4}-\d{2}$/.test(mes) ? mes : null;
}

function sumar(mapa, mes, categoria, monto) {
  if (!mes || !monto) return;
  if (!mapa.has(mes)) mapa.set(mes, { trabajo: 0, equipo: 0, mensualidad: 0 });
  mapa.get(mes)[categoria] += monto;
}

// Serie mes a mes (hasta 36 meses hacia atrás):
//  - facturado: trabajos por fecha de creación, equipos por fecha de venta y
//    mensualidades por cada mes desde que se crearon (las desactivadas solo
//    cuentan los meses en que sí se les cobró algo).
//  - cobrado: lo que realmente entró (abonos) según su fecha de pago.
async function construirSerie(db, periodo) {
  const facturado = new Map();
  const cobrado = new Map();

  const trabajos = (await db.prepare("SELECT monto, fecha_creacion FROM trabajos").all()).results;
  for (const t of trabajos) sumar(facturado, mesDe(t.fecha_creacion), "trabajo", Number(t.monto) || 0);

  const equipos = (await db.prepare("SELECT precio, fecha_venta FROM equipos").all()).results;
  for (const e of equipos) sumar(facturado, mesDe(e.fecha_venta), "equipo", Number(e.precio) || 0);

  const abonos = (await db.prepare("SELECT categoria, referencia_id, periodo, monto, fecha_pago FROM abonos").all()).results;
  const mesesConAbonoMens = new Set(); // "id|YYYY-MM" de mensualidades con algún abono
  for (const a of abonos) {
    const cat = a.categoria;
    if (cat !== "trabajo" && cat !== "equipo" && cat !== "mensualidad") continue;
    sumar(cobrado, mesDe(a.fecha_pago), cat, Number(a.monto) || 0);
    if (cat === "mensualidad" && a.periodo) mesesConAbonoMens.add(a.referencia_id + "|" + a.periodo);
  }

  const mensualidades = (await db.prepare("SELECT id, monto, activo, creado_en FROM mensualidades").all()).results;
  for (const m of mensualidades) {
    const desde = mesDe(m.creado_en);
    if (!desde) continue;
    for (let mes = desde; mes <= periodo; mes = addMonths(mes + "-01", 1).slice(0, 7)) {
      if (m.activo === 1 || mesesConAbonoMens.has(m.id + "|" + mes)) {
        sumar(facturado, mes, "mensualidad", Number(m.monto) || 0);
      }
    }
  }

  const todos = [...facturado.keys(), ...cobrado.keys()].filter((x) => x <= periodo).sort();
  if (!todos.length) return [];
  const tope = addMonths(periodo + "-01", -35).slice(0, 7);
  let mes = todos[0] < tope ? tope : todos[0];

  const vacio = () => ({ trabajo: 0, equipo: 0, mensualidad: 0 });
  const serie = [];
  while (mes <= periodo) {
    serie.push({ mes, facturado: facturado.get(mes) || vacio(), cobrado: cobrado.get(mes) || vacio() });
    mes = addMonths(mes + "-01", 1).slice(0, 7);
  }
  return serie;
}

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
    serie: await construirSerie(db, periodo),
  });
}
