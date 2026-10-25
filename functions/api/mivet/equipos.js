// POST /api/mivet/equipos {k, clientes} — reporte periódico de puestos en red.
import { asegurarTablas, base, datosRespaldo, error, guardarRespaldo, json, leerCuerpo, normalizarEquipo, problemaClave, respaldoPendiente, texto, ahora } from '../../../mivet-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const servidor = normalizarEquipo(d.equipo);
    const claveId = parseInt(d.k, 10);
    if (!servidor || !claveId) return error(400, 'Reporte de equipos inválido');

    const clave = await db.prepare('SELECT * FROM mivet_claves WHERE id=?').bind(claveId).first();
    if (problemaClave(clave)) return error(403, 'La clave del servidor no está activa');
    const activacion = await db.prepare("SELECT id FROM mivet_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'")
      .bind(claveId, servidor).first();
    if (!activacion) return error(403, 'Este servidor no está activado con esa clave');

    const fecha = ahora();
    await db.prepare('UPDATE mivet_activaciones SET ultimo_contacto=? WHERE clave_id=? AND equipo=?')
      .bind(fecha, claveId, servidor).run();

    const vistos = new Set();
    for (const cliente of Array.isArray(d.clientes) ? d.clientes.slice(0, 50) : []) {
      const id = texto(cliente?.id, 80);
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id) || vistos.has(id)) continue;
      vistos.add(id);
      const nombre = texto(cliente?.nombre, 60) || 'Computador';
      const usuario = texto(cliente?.usuario, 60);
      await db.prepare('INSERT INTO mivet_puestos_reportados(clave_id, servidor_equipo, cliente_id, nombre, usuario, ultimo_contacto) VALUES(?,?,?,?,?,?) ' +
        'ON CONFLICT(clave_id, servidor_equipo, cliente_id) DO UPDATE SET nombre=excluded.nombre, usuario=excluded.usuario, ultimo_contacto=excluded.ultimo_contacto')
        .bind(claveId, servidor, id, nombre, usuario, fecha).run();
    }
    const info = datosRespaldo(d);
    if (info) await guardarRespaldo(db, activacion.id, info);
    const fresco = await db.prepare('SELECT respaldo_estado, respaldo_en, respaldo_pedido FROM mivet_activaciones WHERE id=?').bind(activacion.id).first();
    return json({ ok: true, backup: respaldoPendiente(fresco) });
  } catch (e) {
    return error(500, e.message);
  }
}