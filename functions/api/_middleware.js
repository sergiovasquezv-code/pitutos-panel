import { getUserFromSession } from "../_lib/auth.js";
import { json } from "../_lib/json.js";

// Rutas de /api/* que no requieren sesión iniciada.
const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/auth/setup", "/api/me"]);
// /api/public/* es la zona sin login: la página de seguimiento del cliente
// y las fotos que ve ahí.
const PUBLIC_PREFIX = "/api/public/";
// Licencias de MiPOS: /api/mipos/* lo llama el programa del cliente (sin login del panel)
// Licencias de MiVet: /api/mivet/* lo llama el programa del cliente (sin login del panel)
// y /api/mipos-admin/* tiene su propia clave (MIPOS_ADMIN_CLAVE).
// y /api/mivet-admin/* tiene su propia clave (MIVET_ADMIN_CLAVE).
const MIPOS_PREFIXES = ["/api/mipos/", "/api/mivet/", "/api/mipos-admin/", "/api/mivet-admin/"];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (
    PUBLIC_PATHS.has(url.pathname) ||
    url.pathname.startsWith(PUBLIC_PREFIX) ||
    MIPOS_PREFIXES.some((p) => url.pathname.startsWith(p))
  ) {
    return context.next();
  }
  const user = await getUserFromSession(context.env, context.request);
  if (!user) {
    return json({ error: "No autorizado" }, 401);
  }
  context.data.user = user;
  return context.next();
}