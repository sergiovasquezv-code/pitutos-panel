// GET /api/mivet/clave-publica  -> {publica, origen}
// La clave PÚBLICA del servidor (no es un secreto). MiVet la compara con la suya cuando un código no calza,
// y herramientas_licencia\REVISAR_CLAVES.bat la usa para decirte qué clave falta poner dónde.
import { clavePublicaHex, error, json } from '../../../mivet-lib/licencias.js';

export async function onRequestGet({ env }) {
  try {
    const publica = await clavePublicaHex(env);
    return json({ publica, origen: env.MIVET_CLAVE_PRIVADA ? 'MIVET_CLAVE_PRIVADA' : env.MIPOS_CLAVE_PRIVADA ? 'MIPOS_CLAVE_PRIVADA' : '' });
  } catch (e) {
    return error(500, 'Error del servidor de licencias: ' + e.message);
  }
}
