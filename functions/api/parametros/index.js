import { json } from "../../_lib/json.js";
import { asegurarParametros, listarParametros } from "../../_lib/parametros.js";

export async function onRequestGet({ env }) {
  const pasos = await listarParametros(env.DB);
  return json({ pasos });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  await asegurarParametros(db);
  const body = await request.json().catch(() => ({}));
  const paso = (body.paso || "").trim();
  const nombre = (body.nombre || "").trim();
  const frase = (body.frase || "").trim();
  let grupo = (body.grupo || "").trim() || null;
  if (!paso || !nombre) return json({ error: "Indica el paso y el nombre de la opción." }, 400);
  const existe = await db.prepare("SELECT clave FROM parametros_paso WHERE clave = ?").bind(paso).first();
  if (!existe) return json({ error: "Ese paso no existe." }, 400);
  if (paso === "tipo") grupo = "unico";
  if (paso === "hecho") grupo = null;
  const max = await db.prepare("SELECT COALESCE(MAX(orden),0) AS n FROM parametros_opcion WHERE paso = ?").bind(paso).first();
  const result = await db
    .prepare("INSERT INTO parametros_opcion (paso, orden, nombre, frase, grupo, activo) VALUES (?,?,?,?,?,1)")
    .bind(paso, Number(max && max.n) + 1, nombre, frase, grupo)
    .run();
  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestPut({ request, env }) {
  const db = env.DB;
  await asegurarParametros(db);
  const body = await request.json().catch(() => ({}));
  const clave = (body.clave || "").trim();
  const nombre = (body.nombre || "").trim();
  if (!clave || !nombre) return json({ error: "Indica el paso y su nombre." }, 400);
  const paso = await db.prepare("SELECT clave FROM parametros_paso WHERE clave = ?").bind(clave).first();
  if (!paso) return json({ error: "Ese paso no existe." }, 404);
  await db.prepare("UPDATE parametros_paso SET nombre = ? WHERE clave = ?").bind(nombre, clave).run();
  return json({ ok: true });
}
