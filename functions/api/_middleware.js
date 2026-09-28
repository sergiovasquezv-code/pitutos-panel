import { getUserFromSession } from "../_lib/auth.js";
import { json } from "../_lib/json.js";

// Rutas de /api/* que no requieren sesión iniciada.
const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/auth/setup", "/api/me"]);
// /api/public/* es la zona sin login: la página de seguimiento del cliente
// y las fotos que ve ahí.
const PUBLIC_PREFIX = "/api/public/";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith(PUBLIC_PREFIX)) {
    return context.next();
  }
  const user = await getUserFromSession(context.env, context.request);
  if (!user) {
    return json({ error: "No autorizado" }, 401);
  }
  context.data.user = user;
  return context.next();
}
