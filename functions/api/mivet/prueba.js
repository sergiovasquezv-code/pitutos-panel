// POST /api/mivet/prueba  {equipo, nombre_pc, version}  -> {licencia}
// Prueba gratis (MIVET_DIAS_PRUEBA días, 15 por defecto). Se recuerda por computador: reinstalar no la reinicia.
import { anotar, asegurarTablas, base, diasPrueba, error, fechaCL, firmarLicencia, hoy, json, leerCuerpo, licenciaDePrueba,
  normalizarEquipo, sumarDias, texto, ahora } from '../../../mivet-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablas(db);
    if (!diasPrueba(env)) return error(403, 'La prueba gratis no está disponible. Pide tu clave de producto a tu proveedor.');
    const d = await leerCuerpo(request);
    const equipo = normalizarEquipo(d.equipo);
    if (!equipo) return error(400, 'Código de equipo inválido');
    let p = await db.prepare('SELECT * FROM mivet_pruebas WHERE equipo=?').bind(equipo).first();
    if (p?.estado === 'bloqueada') return error(403, 'La prueba gratis de este computador fue suspendida desde el panel.');
    if (!p) {
      // Contra la "prueba infinita" (cambiar la identidad del PC para pedir otra): desde la misma conexión a internet,
      // el mismo PC (mismo nombre) sigue con la prueba que ya tenía, y solo se dan unas pocas pruebas nuevas al mes.
      const ip = texto(request.headers.get('CF-Connecting-IP') || '', 60);
      const nombre = texto(d.nombre_pc, 60);
      let inicio = hoy();
      if (ip) {
        const mismo = nombre && await db.prepare('SELECT inicio FROM mivet_pruebas WHERE ip=? AND nombre_pc=? ORDER BY inicio LIMIT 1').bind(ip, nombre).first();
        if (mismo) {
          inicio = mismo.inicio;
          await anotar(db, 'prueba_repetida', { equipo, detalle: `${nombre} · ${ip} · sigue la prueba del ${mismo.inicio}` });
        } else {
          const max = parseInt(env.MIVET_PRUEBAS_POR_IP || '3', 10);
          const desde = sumarDias(hoy(), -30);
          const n = (await db.prepare('SELECT COUNT(DISTINCT nombre_pc) AS n FROM mivet_pruebas WHERE ip=? AND inicio>=?').bind(ip, desde).first()).n;
          if (max > 0 && n >= max) {
            await anotar(db, 'prueba_negada', { equipo, detalle: `${nombre} · ${ip} · ${n} pruebas este mes` });
            return error(403, 'Desde esta conexión a internet ya se usaron las pruebas gratis de este mes. Para seguir, pide tu clave de producto a tu proveedor.');
          }
        }
      }
      p = { equipo, inicio };
      await db.prepare('INSERT INTO mivet_pruebas(equipo, inicio, nombre_pc, version, ultimo_contacto, ip) VALUES(?,?,?,?,?,?)')
        .bind(equipo, inicio, nombre, texto(d.version, 20), ahora(), ip).run();
      await anotar(db, 'prueba', { equipo, detalle: `${nombre}${ip ? ' · ' + ip : ''}` });
    }
    const lic = licenciaDePrueba(env, p);
    if (lic.vence < hoy()) {
      return error(403, `La prueba gratis de este computador terminó el ${fechaCL(lic.vence)}. Para seguir usando MiVet pide tu clave de producto.`);
    }
    await db.prepare('UPDATE mivet_pruebas SET ultimo_contacto=? WHERE equipo=?').bind(ahora(), equipo).run();
    return json({ licencia: await firmarLicencia(env, lic) });
  } catch (e) {
    return error(500, 'Error del servidor de licencias: ' + e.message);
  }
}
