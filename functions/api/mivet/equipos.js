// POST /api/mivet/equipos {k, clientes} — reporte periódico de puestos en red.
import { asegurarTablas, base, error, json, leerCuerpo, normalizarEquipo, problemaClave, texto, ahora } from '../../../mivet-lib/licencias.js';

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
      const id = texto(cliente?.id, 100);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const nombre = texto(cliente?.nombre, 60) || 'Computador';
      const usuario = texto(cliente?.usuario, 60);
      const actualizado = await db.prepare('UPDATE mivet_puestos_reportados SET nombre=?, usuario=?, ultimo_contacto=? WHERE clave_id=? AND servidor=? AND puesto_id=?')
        .bind(nombre, usuario, fecha, claveId, servidor, id).run();
      if (!actualizado.meta.changes) {
        await db.prepare('INSERT INTO mivet_puestos_reportados(clave_id, servidor, puesto_id, nombre, usuario, ultimo_contacto) VALUES(?,?,?,?,?,?)')
          .bind(claveId, servidor, id, nombre, usuario, fecha).run();
      }
    }
    return json({ ok: true });
  } catch (e) {
    return error(500, e.message);
  }
}