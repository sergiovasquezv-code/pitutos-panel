// POST /api/mipos/prueba  {equipo, nombre_pc, version}  -> {licencia}
// Prueba gratis (MIPOS_DIAS_PRUEBA días, 15 por defecto). Se recuerda por computador: reinstalar no la reinicia.
import { anotar, asegurarTablas, base, diasPrueba, error, fechaCL, firmarLicencia, hoy, json, leerCuerpo, licenciaDePrueba,
  normalizarEquipo, texto, ahora } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    if (!diasPrueba(env)) return error(403, 'La prueba gratis no está disponible. Pide tu clave de producto a tu proveedor.');
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    let p = await db.prepare('SELECT * FROM mipos_pruebas WHERE equipo=?').bind(equipo).first();
    if (!p) {
      p = { equipo, inicio: hoy() };
      await db.prepare('INSERT INTO mipos_pruebas(equipo, inicio, nombre_pc, version, ultimo_contacto) VALUES(?,?,?,?,?)')
        .bind(equipo, p.inicio, texto(d.nombre_pc, 60), texto(d.version, 20), ahora()).run();
      await anotar(db, 'prueba', { equipo, detalle: texto(d.nombre_pc, 60) });
    }
    const lic = licenciaDePrueba(env, p);
    if (lic.vence < hoy()) {
      return error(403, `La prueba gratis de este computador terminó el ${fechaCL(lic.vence)}. Para seguir usando MiPOS pide tu clave de producto.`);
    }
    await db.prepare('UPDATE mipos_pruebas SET ultimo_contacto=? WHERE equipo=?').bind(ahora(), equipo).run();
    return json({ licencia: await firmarLicencia(env, lic) });
  } catch (e) {
    return error(500, 'Error del servidor de licencias: ' + e.message);
  }
}
