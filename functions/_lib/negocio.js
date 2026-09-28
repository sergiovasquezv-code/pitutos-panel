import { addMonths, diffDays, todayStr, periodoActual } from "./dates.js";

export function equipoConGarantia(equipo, hoy = todayStr()) {
  const vence = addMonths(equipo.fecha_venta, equipo.meses_garantia);
  const dias = diffDays(vence, hoy);
  let estado;
  if (dias < 0) estado = "vencida";
  else if (dias <= 15) estado = "por_vencer";
  else estado = "vigente";
  return { ...equipo, vence, dias_restantes: dias, estado_garantia: estado };
}

// Suma los abonos registrados para una categoría ('trabajo' | 'equipo' |
// 'mensualidad') y una referencia (el id en su tabla). Para mensualidades
// se pasa además el periodo (YYYY-MM) porque el cobro es por mes; para
// trabajos y equipos el periodo va NULL (no son recurrentes, se abona
// contra el total de una sola vez).
export async function totalAbonado(db, categoria, referenciaId, periodo = null) {
  const stmt = periodo
    ? db
        .prepare(
          "SELECT COALESCE(SUM(monto),0) AS total FROM abonos WHERE categoria = ? AND referencia_id = ? AND periodo = ?"
        )
        .bind(categoria, referenciaId, periodo)
    : db
        .prepare(
          "SELECT COALESCE(SUM(monto),0) AS total FROM abonos WHERE categoria = ? AND referencia_id = ? AND periodo IS NULL"
        )
        .bind(categoria, referenciaId);
  const row = await stmt.first();
  return row.total;
}

// Calcula abonado/saldo/pagado_completo para cualquier categoría, dado su
// monto total (trabajo.monto, equipo.precio o mensualidad.monto).
export async function infoAbono(db, categoria, referenciaId, montoTotal, periodo = null) {
  const abonado = await totalAbonado(db, categoria, referenciaId, periodo);
  const total = Number(montoTotal) || 0;
  const saldo = Math.max(total - abonado, 0);
  return { abonado, saldo, pagado_completo: total > 0 && saldo <= 0 };
}

export async function mensualidadConPago(db, mensualidad, periodo = periodoActual()) {
  const info = await infoAbono(db, "mensualidad", mensualidad.id, mensualidad.monto, periodo);
  return { ...mensualidad, ...info, periodo_actual: periodo };
}
