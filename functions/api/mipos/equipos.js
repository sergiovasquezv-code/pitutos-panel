// POST /api/mipos/equipos {equipo, k, clientes}; solo el servidor principal activado puede reportar sus cajas.
import { asegurarTablas, base, datosRespaldo, error, guardarRespaldo, json, leerCuerpo, normalizarEquipo, problemaClave, respaldoPendiente, texto, ahora } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    const claveId = parseInt(d.k, 10);
    if (!equipo || !Number.isInteger(claveId) || claveId < 1) return error(400, 'Identificación de licencia inválida');
    const clave = await db.prepare('SELECT * FROM mipos_claves WHERE id=?').bind(claveId).first();
    const activacion = clave && await db.prepare("SELECT * FROM mipos_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'")
      .bind(claveId, equipo).first();
    const problema = problemaClave(clave) || (!activacion ? 'El servidor no está activado con esta licencia.' : null);
    if (problema) return error(403, problema);

    const ids = new Set();
    const momento = ahora();
    await db.prepare('UPDATE mipos_activaciones SET ultimo_contacto=?, nombre_pc=?, version=? WHERE id=?')
      .bind(momento, texto(d.nombre_pc, 60) || activacion.nombre_pc, texto(d.version, 20) || activacion.version, activacion.id).run();
    const consultas = [];
    for (const p of (Array.isArray(d.clientes) ? d.clientes : []).slice(0, 50)) {
      const id = texto(p?.id, 80);
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id) || ids.has(id)) continue;
      ids.add(id);
      consultas.push(db.prepare("INSERT INTO mipos_puestos_reportados(clave_id, servidor_equipo, cliente_id, nombre, usuario, ultimo_contacto) VALUES(?,?,?,?,?,?) " +
        "ON CONFLICT(clave_id, servidor_equipo, cliente_id) DO UPDATE SET nombre=excluded.nombre, usuario=excluded.usuario, ultimo_contacto=excluded.ultimo_contacto")
        .bind(claveId, equipo, id, texto(p?.nombre, 80) || 'Caja MiPOS', texto(p?.usuario, 60), momento));
    }
    if (consultas.length) await db.batch(consultas);
    const info = datosRespaldo(d);
    if (info) await guardarRespaldo(db, activacion.id, info);
    const fresco = await db.prepare('SELECT respaldo_estado, respaldo_en, respaldo_pedido FROM mipos_activaciones WHERE id=?').bind(activacion.id).first();
    return json({ ok: true, reportados: consultas.length, backup: respaldoPendiente(fresco) });
  } catch (e) {
    return error(500, 'No se pudo registrar el estado de las cajas: ' + e.message);
  }
}