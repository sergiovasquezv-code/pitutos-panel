import { json } from "../../_lib/json.js";

// Lista los productos del catálogo (pitutos-catalogo) para poder elegir uno
// al registrar una venta desde el panel, y así descontar su stock
// automáticamente. Requiere el binding CATALOGO_DB (misma base de datos que
// usa pitutos-catalogo) configurado en wrangler.toml.
export async function onRequestGet({ env, request }) {
  const db = env.CATALOGO_DB;
  if (!db) return json({ productos: [] });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  let query = `SELECT id, sku, nombre, precio, stock FROM productos WHERE disponible = 1`;
  const binds = [];
  if (q) {
    query += ` AND (nombre LIKE ? OR sku LIKE ?)`;
    binds.push(`%${q}%`, `%${q}%`);
  }
  query += ` ORDER BY nombre ASC LIMIT 200`;

  try {
    const { results } = await db.prepare(query).bind(...binds).all();
    return json({ productos: results });
  } catch (err) {
    // Si la base del catálogo no está accesible por algún motivo, no debe
    // romper el registro de ventas: se responde una lista vacía y el
    // formulario simplemente no muestra el buscador de productos.
    return json({ productos: [], error: "No se pudo conectar al catálogo." });
  }
}
