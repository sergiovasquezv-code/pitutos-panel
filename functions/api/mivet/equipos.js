// POST /api/mivet/equipos {equipo, k, clientes}; solo el servidor principal activado puede reportar sus terminales.
import { asegurarTablas, base, error, json, leerCuerpo, normalizarEquipo, problemaClave, texto, ahora } from '../../../mivet-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    const claveId = parseInt(d.k, 10);
    if (!equipo || !Number.isInteger(claveId) || claveId < 1) return error(400, 'Identificación de licencia inválida');
    const clave = await db.prepare('SELECT * FROM mivet_claves WHERE id=?').bind(claveId).first();
    const activacion = clave && await db.prepare("SELECT * FROM mivet_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'")
      .bind(claveId, equipo).first();
    const problema = problemaClave(clave) || (!activacion ? 'El servidor no está activado con esta licencia.' : null);
    if (problema) return error(403, problema);

    const ids = new Set();
    const momento = ahora();
    await db.prepare('UPDATE mivet_activaciones SET ultimo_contacto=?, nombre_pc=?, version=? WHERE id=?')
      .bind(momento, texto(d.nombre_pc, 60) || activacion.nombre_pc, texto(d.version, 20) || activacion.version, activacion.id).run();
    const consultas = [];
    for (const p of (Array.isArray(d.clientes) ? d.clientes : []).slice(0, 50)) {
      const id = texto(p?.id, 80);
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id) || ids.has(id)) continue;
      ids.add(id);
      consultas.push(db.prepare("INSERT INTO mivet_puestos_reportados(clave_id, servidor_equipo, cliente_id, nombre, usuario, ultimo_contacto) VALUES(?,?,?,?,?,?) " +
        "ON CONFLICT(clave_id, servidor_equipo, cliente_id) DO UPDATE SET nombre=excluded.nombre, usuario=excluded.usuario, ultimo_contacto=excluded.ultimo_contacto")
        .bind(claveId, equipo, id, texto(p?.nombre, 80) || 'Computador', texto(p?.usuario, 60), momento));
    }
    if (consultas.length) await db.batch(consultas);
    return json({ ok: true, reportados: consultas.length });
  } catch (e) {
    return error(500, 'No se pudo registrar el estado de los equipos: ' + e.message);
  }
}