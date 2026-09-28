import { json } from "../../_lib/json.js";
import { nowIso, todayStr, periodoActual } from "../../_lib/dates.js";
import { randomToken } from "../../_lib/tokens.js";
import { infoAbono } from "../../_lib/negocio.js";

// Configuración de a qué tabla apunta cada categoría y cuál es su campo
// de monto total, para no repetir esta lógica en cada endpoint.
const CATEGORIAS = {
  trabajo: { tabla: "trabajos", campoMonto: "monto" },
  equipo: { tabla: "equipos", campoMonto: "precio" },
  mensualidad: { tabla: "mensualidades", campoMonto: "monto" },
};

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const categoria = url.searchParams.get("categoria");
  const referenciaId = Number(url.searchParams.get("referencia_id"));

  if (!CATEGORIAS[categoria]) return json({ error: "Categoría inválida." }, 400);
  if (!referenciaId) return json({ error: "Falta la referencia." }, 400);

  const { results } = await db
    .prepare(
      "SELECT * FROM abonos WHERE categoria = ? AND referencia_id = ? ORDER BY fecha_pago DESC, id DESC"
    )
    .bind(categoria, referenciaId)
    .all();

  return json({ abonos: results });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));

  const categoria = body.categoria;
  const config = CATEGORIAS[categoria];
  if (!config) return json({ error: "Categoría inválida." }, 400);

  const referenciaId = Number(body.referencia_id);
  if (!referenciaId) return json({ error: "Falta la referencia." }, 400);

  const monto = Number(body.monto);
  if (!monto || monto <= 0) return json({ error: "Indica un monto de abono válido." }, 400);

  const item = await db
    .prepare(`SELECT * FROM ${config.tabla} WHERE id = ?`)
    .bind(referenciaId)
    .first();
  if (!item) return json({ error: "No se encontró el registro asociado a este abono." }, 400);

  const cliente = await db
    .prepare("SELECT id, nombre, telefono FROM clientes WHERE id = ?")
    .bind(item.cliente_id)
    .first();

  // Solo las mensualidades usan periodo (cobro mes a mes); trabajos y
  // equipos abonan contra su monto total de una sola vez.
  const periodo = categoria === "mensualidad" ? (body.periodo || "").trim() || periodoActual() : null;

  const token = randomToken();
  const fechaPago = (body.fecha_pago || "").trim() || todayStr();
  const nota = (body.nota || "").trim();

  const result = await db
    .prepare(
      `INSERT INTO abonos (categoria, referencia_id, periodo, monto, fecha_pago, nota, public_token, creado_en)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .bind(categoria, referenciaId, periodo, monto, fechaPago, nota, token, nowIso())
    .run();

  const info = await infoAbono(db, categoria, referenciaId, item[config.campoMonto], periodo);

  return json({
    ok: true,
    id: result.meta.last_row_id,
    token,
    cliente_id: item.cliente_id,
    cliente_nombre: cliente ? cliente.nombre : null,
    cliente_telefono: cliente ? cliente.telefono : null,
    periodo,
    ...info,
  });
}
