const ITERATIONS = 100000;
const KEY_LEN_BYTES = 32;
const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function derive(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LEN_BYTES * 8
  );
  return bufToHex(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await derive(password, salt);
  return `${bufToHex(salt)}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  const salt = hexToBytes(saltHex);
  const derivedHex = await derive(password, salt);
  if (derivedHex.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    diff |= derivedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isHttps(request) {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

export function sessionCookie(request, token, { clear = false } = {}) {
  const maxAge = clear ? 0 : SESSION_DAYS * 24 * 60 * 60;
  const value = clear ? "" : token;
  const secure = isHttps(request) ? " Secure;" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}

export async function createSession(env, userId) {
  const token = crypto.randomUUID();
  const expira = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sesiones (token, usuario_id, creado_en, expira_en) VALUES (?,?,?,?)"
  )
    .bind(token, userId, new Date().toISOString(), expira)
    .run();
  return token;
}

export async function getUserFromSession(env, request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT usuarios.id AS id, usuarios.username AS username, sesiones.expira_en AS expira_en
     FROM sesiones JOIN usuarios ON usuarios.id = sesiones.usuario_id
     WHERE sesiones.token = ?`
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expira_en).getTime() < Date.now()) return null;
  return { id: row.id, username: row.username, token };
}

export async function destroySession(env, request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    await env.DB.prepare("DELETE FROM sesiones WHERE token = ?").bind(token).run();
  }
}
