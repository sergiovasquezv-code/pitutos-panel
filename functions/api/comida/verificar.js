// POST /api/comida/verificar  {licencia}  -> {estado, licencia?}
import { anotar, armarLicencia, asegurarTablas, ahora, base, error, firmarLicencia, hoy, json, leerCuerpo, leerLicenciaFirmada } from '../../../comida-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    const d = await leerCuerpo(request);
    const datos = await leerLicenciaFirmada(d.licencia);
    if (!datos || !datos.k || !datos.id) return json({ estado: 'sin_cambios' });
    const clave = await db.prepare('SELECT * FROM comida_claves WHERE id=?').bind(datos.k).first();
    if (!clave || clave.estado !== 'activa' || (clave.vence && clave.vence < hoy())) {
      await anotar(db, 'revocada', { clave: clave ? clave.clave : '', equipo: datos.id, detalle: 'comprobar' });
      return json({ estado: 'revocada' });
    }
    const act = await db.prepare('SELECT id FROM comida_activaciones WHERE clave_id=? AND equipo=?').bind(clave.id, datos.id).first();
    if (!act) return json({ estado: 'revocada' });
    await db.prepare('UPDATE comida_activaciones SET ultimo_contacto=? WHERE id=?').bind(ahora(), act.id).run();
    const fresca = armarLicencia(clave, datos.id);
    const cambio = fresca.vence !== (datos.vence || '') || fresca.cliente !== datos.cliente;
    if (!cambio) return json({ estado: 'vigente' });
    await anotar(db, 'renovar', { clave: clave.clave, equipo: datos.id, detalle: fresca.vence || 'sin vencimiento' });
    return json({ estado: 'renovada', licencia: await firmarLicencia(env, fresca) });
  } catch (e) {
    return error(500, e.message || 'No se pudo comprobar');
  }
}
