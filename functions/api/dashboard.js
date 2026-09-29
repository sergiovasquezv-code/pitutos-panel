import { json } from "../_lib/json.js";
import { todayStr, periodoActual } from "../_lib/dates.js";
import { equipoConGarantia, infoAbono } from "../_lib/negocio.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  const hoy = todayStr();
  const periodo = periodoActual();

  const totalClientes = (await db.prepare("SELECT COUNT(*) AS n FROM clientes").first()).n;

  const equiposRaw = (
    await db
      .prepare(
        `SELECT equipos.*, clientes.nombre AS cliente_nombre, grupos_equipos.nombre AS grupo_nombre
         FROM equipos
         JOIN clientes ON clientes.id = equipos.cliente_id
         LEFT JOIN grupos_equipos ON grupos_equipos.id = equipos.grupo_id`
      )
      .all()
  ).results;
  const equipos = equiposRaw.map((e) => equipoConGarantia(e, hoy));
  // Los equipos "sin garantía" (meses_garantia = 0) tienen dias_restantes en
  // null — hay que excluirlos explícitamente, porque en JS "null >= 0" da
  // true y se colaban en "por vencer" mostrando "null" días.
  const conGarantia = equipos.filter((e) => e.dias_restantes !== null);
  const garantiasPorVencer = conGarantia
    .filter((e) => e.dias_restantes >= 0 && e.dias_restantes <= 15)
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
  const garantiasVencidas30d = conGarantia.filter(
    (e) => e.dias_restantes < 0 && e.dias_restantes >= -30
  );

  const trabajosAbiertos = (
    await db
      .prepare(
        `SELECT trabajos.*, clientes.nombre AS cliente_nombre
         FROM trabajos JOIN clientes ON clientes.id = trabajos.cliente_id
         WHERE trabajos.estado NOT IN ('Terminado', 'Demostración')
         ORDER BY trabajos.fecha_creacion`
      )
      .all()
  ).results;

  // Trabajos que se cerraron este mes — para que en Inicio se vea de un
  // vistazo cuánto se ha cerrado, no solo lo que sigue pendiente. Se
  // compara con LIKE porque fecha_cierre puede venir como "YYYY-MM-DD"
  // (trabajos antiguos) o como fecha y hora completa (ISO) — ambos formatos
  // empiezan igual con "YYYY-MM".
  const trabajosTerminadosMes = (
    await db
      .prepare(
        `SELECT trabajos.*, clientes.nombre AS cliente_nombre
         FROM trabajos JOIN clientes ON clientes.id = trabajos.cliente_id
         WHERE trabajos.estado = 'Terminado' AND trabajos.fecha_cierre LIKE ?
         ORDER BY trabajos.fecha_cierre DESC`
      )
      .bind(`${periodo}%`)
      .all()
  ).results;

  const mensualidadesActivas = (
    await db
      .prepare(
        `SELECT mensualidades.*, clientes.nombre AS cliente_nombre
         FROM mensualidades JOIN clientes ON clientes.id = mensualidades.cliente_id
         WHERE mensualidades.activo = 1
         ORDER BY mensualidades.dia_cobro`
      )
      .all()
  ).results;

  // Mensualidades pendientes de este mes: las que aún tienen saldo (sin
  // abonos o con un abono parcial que no cubre el mes completo).
  const mensualidadesPendientes = [];
  let pendienteMensualidades = 0;
  for (const m of mensualidadesActivas) {
    const info = await infoAbono(db, "mensualidad", m.id, m.monto, periodo);
    if (info.saldo > 0) {
      mensualidadesPendientes.push({ ...m, ...info });
      pendienteMensualidades += info.saldo;
    }
  }

  // Cuánto falta por cobrar en total: de TODOS los trabajos (estén abiertos
  // o ya terminados — si quedó un saldo pendiente igual hay que cobrarlo)
  // y de TODAS las ventas de equipo, más allá de si ya pagaron un
  // anticipo. Antes esto solo miraba los trabajos abiertos y dejaba afuera
  // por completo las ventas de equipo abonadas.
  const todosLosTrabajos = (await db.prepare("SELECT id, monto FROM trabajos").all()).results;
  let pendienteTrabajos = 0;
  for (const t of todosLosTrabajos) {
    const info = await infoAbono(db, "trabajo", t.id, t.monto);
    pendienteTrabajos += info.saldo;
  }

  // Ventas de equipo con saldo pendiente (sin abonos o con abono parcial),
  // para que se vean en Inicio igual que los trabajos y las mensualidades
  // — antes esto no aparecía en ningún lado del dashboard. Los equipos que
  // pertenecen a un mismo grupo ("sistema" con varios componentes) se
  // combinan en una sola fila con el nombre del grupo y los montos
  // sumados, en vez de salir un componente por línea.
  const gruposPendientes = new Map(); // grupo_id -> fila combinada
  const equiposPendientes = [];
  let pendienteEquipos = 0;
  for (const e of equipos) {
    const info = await infoAbono(db, "equipo", e.id, e.precio);
    if (info.saldo <= 0) continue;
    pendienteEquipos += info.saldo;

    if (e.grupo_id) {
      let fila = gruposPendientes.get(e.grupo_id);
      if (!fila) {
        fila = {
          id: e.id, // representante del grupo, para el link "?equipo="
          grupo_id: e.grupo_id,
          cliente_id: e.cliente_id,
          cliente_nombre: e.cliente_nombre,
          tipo_equipo: e.grupo_nombre || "Sistema (varios componentes)",
          marca_modelo: "",
          precio: 0,
          abonado: 0,
          saldo: 0,
        };
        gruposPendientes.set(e.grupo_id, fila);
        equiposPendientes.push(fila);
      }
      fila.precio += e.precio;
      fila.abonado += info.abonado;
      fila.saldo += info.saldo;
    } else {
      equiposPendientes.push({ ...e, ...info });
    }
  }
  equiposPendientes.sort((a, b) => b.saldo - a.saldo);

  // Ingreso real del mes: lo que efectivamente entró como abonos (de
  // cualquier categoría) con fecha de pago dentro de este periodo — plata
  // que de verdad se cobró, no lo que se facturó.
  const ingresoMes = (
    await db
      .prepare("SELECT COALESCE(SUM(monto),0) AS total FROM abonos WHERE fecha_pago LIKE ?")
      .bind(`${periodo}%`)
      .first()
  ).total;

  return json({
    total_clientes: totalClientes,
    garantias_por_vencer: garantiasPorVencer,
    garantias_vencidas_30d: garantiasVencidas30d,
    trabajos_abiertos: trabajosAbiertos,
    trabajos_terminados_mes: trabajosTerminadosMes,
    equipos_pendientes: equiposPendientes,
    mensualidades_pendientes: mensualidadesPendientes,
    total_mensualidades_activas: mensualidadesActivas.length,
    ingreso_mes: ingresoMes,
    total_por_cobrar: pendienteTrabajos + pendienteEquipos + pendienteMensualidades,
    periodo_actual: periodo,
  });
}
