// POST /api/mivet/activar  {clave, equipo, nombre_pc, version}  -> {licencia}
// MiVet lo llama cuando el cliente escribe su clave de producto.
import { anotar, asegurarTablas, base, error, firmarLicencia, json, leerCuerpo, licenciaDeClave, normalizarClave,
  normalizarEquipo, problemaClave, texto, ahora } from '../../../mivet-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    const txt = normalizarClave(d.clave);
    if (!txt) return error(400, 'La clave de producto tiene 12 letras y números, por ejemplo MIVET-7K3D-QX9P-4MRT');
    const clave = await db.prepare('SELECT * FROM mivet_claves WHERE clave=?').bind(txt).first();
    const problema = problemaClave(clave);
    if (problema) {
      await anotar(db, 'activacion_rechazada', { clave_id: clave?.id, equipo, detalle: problema });
      return error(clave ? 403 : 404, problema);
    }
    const nombre = texto(d.nombre_pc, 60), version = texto(d.version, 20);
    const previa = await db.prepare('SELECT * FROM mivet_activaciones WHERE clave_id=? AND equipo=?').bind(clave.id, equipo).first();
    if (!previa || previa.estado !== 'activa') {
      const usadas = await db.prepare("SELECT * FROM mivet_activaciones WHERE clave_id=? AND estado='activa'").bind(clave.id).all();
      if (usadas.results.length >= clave.max_equipos) {
        const otros = usadas.results.map(a => a.nombre_pc || a.equipo).join(', ');
        await anotar(db, 'activacion_rechazada', { clave_id: clave.id, equipo, detalle: `Clave ya usada en ${otros}` });
        return error(409, `Esta clave ya está activada en otro computador (${otros}). Si cambiaste de PC o reinstalaste Windows, pide a tu proveedor que la libere.`);
      }
    }
    if (previa) {
      await db.prepare("UPDATE mivet_activaciones SET estado='activa', nombre_pc=?, version=?, ultimo_contacto=? WHERE id=?")
        .bind(nombre, version, ahora(), previa.id).run();
    } else {
      await db.prepare('INSERT INTO mivet_activaciones(clave_id, equipo, nombre_pc, version, creado, ultimo_contacto) VALUES(?,?,?,?,?,?)')
        .bind(clave.id, equipo, nombre, version, ahora(), ahora()).run();
    }
    await anotar(db, 'activacion', { clave_id: clave.id, equipo, detalle: `${clave.cliente} · ${nombre}` });
    return json({ licencia: await firmarLicencia(env, licenciaDeClave(env, clave, equipo)), cliente: clave.cliente });
  } catch (e) {
    return error(500, 'Error del servidor de licencias: ' + e.message);
  }
}
