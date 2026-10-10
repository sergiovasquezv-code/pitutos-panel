// POST /api/mipos/prueba  {equipo, nombre_pc, version}  -> {licencia}
// Prueba gratis (MIPOS_DIAS_PRUEBA días, 15 por defecto). Se recuerda por computador: reinstalar no la reinicia.
import { anotar, asegurarTablas, base, diasPrueba, error, fechaCL, firmarLicencia, hoy, json, leerCuerpo, licenciaDePrueba,
  normalizarEquipo, pruebasPorConexion, sumarDias, texto, ahora } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    if (!diasPrueba(env)) return error(403, 'La prueba gratis no está disponible. Pide tu clave de producto a tu proveedor.');
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    let p = await db.prepare('SELECT * FROM mipos_pruebas WHERE equipo=?').bind(equipo).first();
    if (p?.estado === 'bloqueada') return error(403, 'La prueba gratis de este computador fue suspendida desde el panel.');
    if (!p) {
      // Prueba nueva: máximo N por conexión a internet cada 30 días (evita sacar pruebas infinitas
      // cambiando la identidad del PC o usando máquinas virtuales)
      const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
      const maximo = pruebasPorConexion(env);
      if (ip && maximo) {
        const usadas = await db.prepare('SELECT COUNT(*) AS n FROM mipos_pruebas WHERE ip=? AND inicio >= ?').bind(ip, sumarDias(hoy(), -30)).first();
        if (usadas.n >= maximo) {
          await db.prepare('INSERT INTO mipos_pruebas_bloqueadas(fecha, ip, equipo, nombre_pc) VALUES(?,?,?,?)')
            .bind(ahora(), ip, equipo, texto(d.nombre_pc, 60)).run();
          await anotar(db, 'prueba_bloqueada', { equipo, detalle: `${texto(d.nombre_pc, 60)} · ${ip}` });
          return error(429, 'Desde esta conexión a internet ya se usaron las pruebas gratis de este mes. ' +
            'Para seguir usando MiPOS compra tu licencia (botón "Comprar licencia") o pide tu clave de producto.');
        }
      }
      p = { equipo, inicio: hoy() };
      await db.prepare('INSERT INTO mipos_pruebas(equipo, inicio, nombre_pc, version, ultimo_contacto, ip) VALUES(?,?,?,?,?,?)')
        .bind(equipo, p.inicio, texto(d.nombre_pc, 60), texto(d.version, 20), ahora(), ip).run();
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
