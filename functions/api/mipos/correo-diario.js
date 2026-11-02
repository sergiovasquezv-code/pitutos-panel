// POST /api/mipos/correo-diario {equipo, destinos, asunto, texto, dia, hora}
// MiPOS manda el resumen por el mismo correo del servidor (Resend), sin SMTP en el local.
// Cada hora del día es un envío distinto. No guarda el texto ni la base: solo anota
// a quién ya se le envió esa hora, para no repetirla. Responde enviado solo si Resend aceptó el mensaje.
import { ahora, base, correo, error, hoy, json, leerCuerpo, normalizarEquipo, texto } from '../../../mipos-lib/licencias.js';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function diaCercano(dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const t = new Date(dia + 'T12:00:00Z').getTime();
  const h = new Date(hoy() + 'T12:00:00Z').getTime();
  return Math.abs(t - h) <= 86400000;
}

function horaDe(valor) {
  const t = texto(valor, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '';
}

function destinosDe(d) {
  const lista = Array.isArray(d.destinos) ? d.destinos : String(d.destinos || '').split(/[,;\n]/);
  const out = [];
  for (const x of lista) {
    const e = texto(x, 120).toLowerCase();
    if (!e) continue;
    if (!CORREO.test(e)) return { error: 'Hay un correo que no es válido' };
    if (!out.includes(e)) out.push(e);
  }
  if (!out.length) return { error: 'Falta el correo de destino' };
  if (out.length > 5) return { error: 'Puedes poner hasta 5 correos' };
  return { lista: out };
}

async function asegurar(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_correo_diario (equipo TEXT NOT NULL, dia TEXT NOT NULL, hora TEXT NOT NULL DEFAULT '', destino TEXT NOT NULL, enviado TEXT NOT NULL, PRIMARY KEY (equipo, dia, hora, destino))"),
    db.prepare("CREATE TABLE IF NOT EXISTS mipos_correo_diario_intentos (id INTEGER PRIMARY KEY AUTOINCREMENT, equipo TEXT NOT NULL, dia TEXT NOT NULL, fecha TEXT NOT NULL)"),
  ]);
}

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurar(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'No se reconoce el equipo');
    const dia = texto(d.dia, 10);
    if (!diaCercano(dia)) return error(400, 'La fecha del resumen no corresponde');
    const cuerpo = texto(d.texto, 20000);
    if (!cuerpo) return error(400, 'El correo está vacío');
    if (cuerpo.includes('SQLite format')) return error(400, 'El correo no puede llevar la base de datos');
    const dest = destinosDe(d);
    if (dest.error) return error(400, dest.error);
    const hora = horaDe(d.hora);
    const asunto = texto(d.asunto, 140) || 'Ventas del día';
    const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.45;color:#1a1a1a">${escH(cuerpo).replace(/\n/g, '<br>')}</div>`;

    const hechas = new Set((await db.prepare(
      'SELECT destino FROM mipos_correo_diario WHERE equipo=? AND dia=? AND hora=?'
    ).bind(equipo, dia, hora).all()).results.map(f => f.destino));
    const pendientes = dest.lista.filter(x => !hechas.has(x));
    if (!pendientes.length) return json({ correo: 'ya_enviado' });

    const diaServidor = hoy();
    const intentos = await db.prepare('SELECT COUNT(*) AS n FROM mipos_correo_diario_intentos WHERE equipo=? AND dia=?').bind(equipo, diaServidor).first();
    if ((intentos && intentos.n) >= 40) return error(429, 'Demasiados intentos de correo hoy');
    await db.prepare('INSERT INTO mipos_correo_diario_intentos(equipo, dia, fecha) VALUES(?,?,?)').bind(equipo, diaServidor, ahora()).run();

    for (const para of pendientes) {
      const res = await correo(env, para, asunto, html);
      if (res !== 'enviado') return error(502, 'No se pudo enviar el correo');
      await db.prepare('INSERT INTO mipos_correo_diario(equipo, dia, hora, destino, enviado) VALUES(?,?,?,?,?)').bind(equipo, dia, hora, para, ahora()).run();
    }
    return json({ correo: 'enviado' });
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
