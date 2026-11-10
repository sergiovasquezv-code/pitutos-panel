// POST /api/comida/prueba  {equipo, nombre_pc, version}  -> {licencia}
import { anotar, asegurarTablas, ahora, base, diasPrueba, error, fechaCL, firmarLicencia, hoy, json,
  leerCuerpo, licenciaDePrueba, normalizarEquipo, pruebasPorConexion, sumarDias, texto } from '../../../comida-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    if (!diasPrueba(env)) return error(403, 'La prueba gratis no está disponible. Pide tu clave de producto.');
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    let p = await db.prepare('SELECT * FROM comida_pruebas WHERE equipo=?').bind(equipo).first();
    if (!p) {
      const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
      const maximo = pruebasPorConexion(env);
      if (ip && maximo) {
        const usadas = await db.prepare('SELECT COUNT(*) AS n FROM comida_pruebas WHERE ip=? AND inicio >= ?').bind(ip, sumarDias(hoy(), -30)).first();
        if (usadas.n >= maximo) return error(429, 'Desde esta conexión ya se usaron las pruebas de este mes.');
      }
      p = { equipo, inicio: hoy() };
      await db.prepare('INSERT INTO comida_pruebas(equipo, inicio, nombre_pc, version, ultimo_contacto, ip) VALUES(?,?,?,?,?,?)')
        .bind(equipo, p.inicio, texto(d.nombre_pc, 60), texto(d.version, 20), ahora(), ip).run();
      await anotar(db, 'prueba', { equipo, detalle: texto(d.nombre_pc, 60) });
    }
    const lic = licenciaDePrueba(env, p);
    if (lic.vence < hoy()) return error(403, `La prueba de este computador terminó el ${fechaCL(lic.vence)}.`);
    await db.prepare('UPDATE comida_pruebas SET ultimo_contacto=? WHERE equipo=?').bind(ahora(), equipo).run();
    return json({ licencia: await firmarLicencia(env, lic) });
  } catch (e) {
    return error(500, e.message || 'No se pudo iniciar la prueba');
  }
}
