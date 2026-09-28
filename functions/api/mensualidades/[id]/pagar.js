import { json } from "../../../_lib/json.js";
import { nowIso, todayStr, periodoActual } from "../../../_lib/dates.js";
import { randomToken } from "../../../_lib/tokens.js";
import { infoAbono } from "../../../_lib/negocio.js";

// Atajo de "Marcar pagado": registra un abono por el saldo que falte del
// mes actual (equivalente a pagar el mes completo de una vez) y le genera
// su comprobante público igual que un abono normal.
export async function onRequestPost({ env, params }) {
  const db = env.DB;
  const id = Number(params.id);
  const mensualidad = await db.prepare("SELECT * FROM mensualidades WHERE id = ?").bind(id).first();
  if (!mensualidad) return json({ error: "Mensualidad no encontrada." }, 404);

  const periodo = periodoActual();
  const info = await infoAbono(db, "mensualidad", id, mensualidad.monto, periodo);
  if (info.saldo <= 0) return json({ error: "Ese mes ya estaba pagado." }, 400);

  const token = randomToken();
  await db
    .prepare(
      `INSERT INTO abonos (categoria, referencia_id, periodo, monto, fecha_pago, nota, public_token, creado_en)
       VALUES ('mensualidad',?,?,?,?,?,?,?)`
    )
    .bind(id, periodo, info.saldo, todayStr(), "Pago del mes completo", token, nowIso())
    .run();

  return json({ ok: true, periodo, cliente_id: mensualidad.cliente_id, token });
}
