import { json } from "../../_lib/json.js";
import { equipoConGarantia } from "../../_lib/negocio.js";

// Búsqueda pública de garantía por RUT del cliente (para el buscador de la
// web principal). Reemplaza la búsqueda anterior por número de serie: un
// cliente puede tener varios equipos, y buscar por serie lo obligaba a
// tener el papel/caja a mano; con el RUT encuentra todos sus equipos de
// una vez.
//
// A propósito devuelve MUY poca información por cada equipo — solo lo
// necesario para confirmar el estado de la garantía — y nada de precio,
// pagos/saldo, fotos ni ids internos. Para ver todo eso el cliente
// necesita el link privado que le mandas por WhatsApp
// (/api/public/equipo/[token]).
//
// El RUT no es tan reservado como una contraseña (mucha gente lo comparte
// para trámites), así que igual que con el serial antes, el diseño es no
// exponer nunca nada sensible: solo tipo de equipo, marca/modelo y estado
// de garantía. No devolvemos el nombre del cliente ni el RUT de vuelta.
//
// CORS abierto a propósito: esta información no es sensible y se llama
// desde la web pública (otro origen).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Deja solo dígitos y "K" (mayúscula), sin puntos ni guión, para poder
// comparar sin importar cómo lo haya escrito la persona (con puntos, con
// guión, con la k en minúscula, con espacios, etc).
function normalizarRut(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[^0-9K]/g, "");
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const rut = normalizarRut(url.searchParams.get("rut"));

  if (!rut) {
    return json({ error: "Escribe el RUT del cliente." }, 400, CORS_HEADERS);
  }

  const equiposRaw = (
    await db
      .prepare(
        `SELECT equipos.tipo_equipo, equipos.marca_modelo, equipos.fecha_venta, equipos.meses_garantia
         FROM equipos
         JOIN clientes ON clientes.id = equipos.cliente_id
         WHERE clientes.rut IS NOT NULL
           AND TRIM(clientes.rut) != ''
           AND UPPER(REPLACE(REPLACE(clientes.rut, '.', ''), '-', '')) = ?
         ORDER BY equipos.fecha_venta DESC`
      )
      .bind(rut)
      .all()
  ).results;

  if (!equiposRaw.length) {
    return json(
      { error: "No encontramos equipos registrados con ese RUT." },
      404,
      CORS_HEADERS
    );
  }

  const equipos = equiposRaw.map((e) => {
    const { tipo_equipo, marca_modelo, fecha_venta, meses_garantia, vence, dias_restantes, estado_garantia } =
      equipoConGarantia(e);
    return { tipo_equipo, marca_modelo, fecha_venta, meses_garantia, vence, dias_restantes, estado_garantia };
  });

  return json(
    {
      negocio: env.NOMBRE_NEGOCIO || "Pitutos Informáticos",
      equipos,
    },
    200,
    CORS_HEADERS
  );
}
