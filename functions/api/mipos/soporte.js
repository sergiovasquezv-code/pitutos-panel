// POST /api/mipos/soporte {accion, ...}  — casos de soporte abiertos desde MiPOS.
//   crear:     {equipo, nombre, telefono, email, tipo, texto, adjunto?, diagnostico} -> {numero, token}
//   listar:    {tokens:[...]} -> casos de este PC (MiPOS guarda sus tokens)
//   ver:       {token} -> caso + mensajes (marca leídas las respuestas)
//   responder: {token, texto, adjunto?}
// Cada caso se identifica por un token secreto que solo tiene el MiPOS que lo creó.
import { adjuntoValido, ahora, anotar, asegurarTablasSoporte, base, claveDeEquipo, correo, correoNuevoCaso, error, json, leerCuerpo,
  normalizarEquipo, texto } from '../../../mipos-lib/licencias.js';

const publico = t => ({ numero: t.id, token: t.token, tipo: t.tipo, asunto: t.asunto, estado: t.estado, creado: t.creado,
                        actualizado: t.actualizado, sin_leer: t.sin_leer_cliente });

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasSoporte(db);
    const d = await leerCuerpo(request);
    const panel = new URL(request.url).origin;

    if (d.accion === 'crear') {
      const equipo = normalizarEquipo(d.equipo);
      const msg = texto(d.texto, 4000);
      if (!msg || msg.length < 5) return error(400, 'Cuéntanos qué pasó (al menos una frase)');
      const m = String(d.telefono || '').replace(/\D/g, '').match(/^(?:569|9)?(\d{8})$/);
      if (!m) return error(400, 'Escribe tu celular: +569 y 8 números, para poder contactarte');
      if (equipo) {
        const hoyN = await db.prepare("SELECT COUNT(*) AS n FROM mipos_tickets WHERE equipo=? AND creado >= ?").bind(equipo, new Date(Date.now() - 86400000).toISOString()).first();
        if (hoyN.n >= 10) return error(429, 'Ya enviaste muchos casos hoy. Escríbenos por WhatsApp si es urgente.');
      }
      const adj = adjuntoValido(d.adjunto);
      const clave = equipo ? await claveDeEquipo(db, equipo) : null;
      let diag = {};
      try { diag = typeof d.diagnostico === 'object' && d.diagnostico ? d.diagnostico : {}; } catch (e) { diag = {}; }
      diag = JSON.stringify({ ...diag, equipo, licencia_panel: clave ? `${clave.cliente} · ${clave.clave} · vence ${clave.vence || 'nunca'}` : 'sin clave (prueba o código)' }).slice(0, 20000);
      const token = crypto.randomUUID();
      const tipo = d.tipo === 'problema' ? 'problema' : 'consulta';
      const r = await db.prepare('INSERT INTO mipos_tickets(token, equipo, clave_id, cliente, telefono, email, tipo, asunto, diagnostico, creado, actualizado) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(token, equipo, clave ? clave.id : null, texto(d.nombre, 100) || (clave ? clave.cliente : ''), '+569' + m[1], texto(d.email, 120).toLowerCase(),
              tipo, msg.split('\n')[0].slice(0, 90), diag, ahora(), ahora()).run();
      const id = r.meta.last_row_id;
      await db.prepare("INSERT INTO mipos_ticket_msgs(ticket_id, autor, texto, adjunto, creado) VALUES(?, 'cliente', ?, ?, ?)").bind(id, msg, adj, ahora()).run();
      const t = await db.prepare('SELECT * FROM mipos_tickets WHERE id=?').bind(id).first();
      await anotar(db, 'soporte', { clave_id: t.clave_id, equipo, detalle: `Caso #${id} (${tipo}): ${t.asunto}` });
      await correo(env, env.EMAIL_NOTIFICACIONES, `Soporte MiPOS #${id} · ${tipo === 'problema' ? 'Problema' : 'Consulta'} · ${t.cliente || 'cliente'}`, correoNuevoCaso(t, msg, panel));
      return json({ numero: id, token });
    }

    if (d.accion === 'listar') {
      const tokens = (Array.isArray(d.tokens) ? d.tokens : []).map(String).filter(x => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200);
      if (!tokens.length) return json({ casos: [] });
      const filas = (await db.prepare(`SELECT * FROM mipos_tickets WHERE token IN (${tokens.map(() => '?').join(',')}) ORDER BY actualizado DESC`).bind(...tokens).all()).results;
      return json({ casos: filas.map(publico) });
    }

    const t = await db.prepare('SELECT * FROM mipos_tickets WHERE token=?').bind(String(d.token || '')).first();
    if (!t) return error(404, 'Caso no encontrado');

    if (d.accion === 'ver') {
      const msgs = (await db.prepare('SELECT autor, texto, adjunto, creado FROM mipos_ticket_msgs WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results;
      if (t.sin_leer_cliente) await db.prepare('UPDATE mipos_tickets SET sin_leer_cliente=0 WHERE id=?').bind(t.id).run();
      return json({ ...publico(t), sin_leer: 0, mensajes: msgs });
    }

    if (d.accion === 'responder') {
      const msg = texto(d.texto, 4000);
      if (!msg) return error(400, 'Escribe tu mensaje');
      const adj = adjuntoValido(d.adjunto);
      await db.batch([
        db.prepare("INSERT INTO mipos_ticket_msgs(ticket_id, autor, texto, adjunto, creado) VALUES(?, 'cliente', ?, ?, ?)").bind(t.id, msg, adj, ahora()),
        db.prepare("UPDATE mipos_tickets SET actualizado=?, sin_leer_soporte=sin_leer_soporte+1, estado=CASE WHEN estado='resuelto' THEN 'en_curso' ELSE estado END WHERE id=?").bind(ahora(), t.id),
      ]);
      await correo(env, env.EMAIL_NOTIFICACIONES, `Soporte MiPOS #${t.id} · nuevo mensaje de ${t.cliente || 'cliente'}`, correoNuevoCaso(t, msg, panel));
      return json({ ok: true });
    }
    return error(400, 'Acción desconocida');
  } catch (e) {
    return error(e.status || 500, e.message);
  }
}
