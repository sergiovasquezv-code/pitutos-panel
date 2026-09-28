import { destroySession, sessionCookie } from "../../_lib/auth.js";
import { json } from "../../_lib/json.js";

export async function onRequestPost({ request, env }) {
  await destroySession(env, request);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", { clear: true }) });
}
