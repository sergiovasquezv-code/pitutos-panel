// POST /api/comida/comprar {plan_id, nombre, email, telefono, equipo?, clave?} -> {pago_url, ref}
import { asegurarTablasVenta, ahora, base, claveDeEquipo, error, json, leerCuerpo, mp, normalizarClave,
  normalizarEquipo, precioConIva, TERMINOS_VERSION, texto } from '../../../comida-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    const plan = await db.prepare('SELECT * FROM comida_planes WHERE id=? AND activo=1').bind(parseInt(d.plan_id, 10) || 0).first();
    if (!plan) return error(400, 'Elige un plan');
    const nombre = texto(d.nombre, 100);
    const email = texto(d.email, 120).toLowerCase();
    const telefono = texto(d.telefono, 30);
    if (!nombre) return error(400, 'Escribe el nombre de tu negocio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, 'Escribe un correo válido: ahí te llega la licencia');
    const m = telefono.replace(/\D/g, '').match(/^(?:569|9)?(\d{8})$/);
    if (!m) return error(400, 'Escribe tu celular: +569 y 8 números');
    let equipo = d.equipo ? normalizarEquipo(d.equipo) : null;
    let clave = null;
    if (d.clave) {
      const txt = normalizarClave(d.clave);
      clave = txt && await db.prepare('SELECT * FROM comida_claves WHERE clave=?').bind(txt).first();
      if (!clave) return error(400, 'No encontré esa clave de Comida. Revísala o déjala vacía para comprar una nueva.');
      if (equipo && !(await db.prepare('SELECT 1 FROM comida_activaciones WHERE clave_id=? AND equipo=?').bind(clave.id, equipo).first())) equipo = null;
    } else if (equipo) {
      clave = await claveDeEquipo(db, equipo);
    }
    if (clave && !clave.vence && plan.meses > 0) return error(400, 'Esta licencia es perpetua y no necesita renovación.');
    const ref = crypto.randomUUID();
    const origen = new URL(request.url).origin;
    const pagina = `${origen}/comida-comprar.html`;
    const cobro = precioConIva(plan.precio);
    await db.prepare(`INSERT INTO comida_compras(ref, plan_id, plan_nombre, precio, meses, equipos, nombre, email, telefono, equipo, clave_id, renovacion, terminos_version, terminos_aceptados, ip, creado)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(ref, plan.id, plan.nombre, cobro, plan.meses, plan.equipos, nombre, email, '+569' + m[1], equipo, clave ? clave.id : null, clave ? 1 : 0,
        TERMINOS_VERSION, ahora(), request.headers.get('CF-Connecting-IP') || '', ahora()).run();
    const pref = await mp(env, 'POST', '/checkout/preferences', {
      items: [{
        id: `comida-${plan.id}`,
        title: `Comida · ${plan.nombre}${clave ? ' (renovación)' : ''}`,
        description: `${plan.equipos} equipo(s) · ${plan.meses === 0 ? 'Licencia perpetua' : `${plan.meses} mes(es)`} · IVA incluido`,
        quantity: 1,
        currency_id: 'CLP',
        unit_price: cobro,
      }],
      payer: { email, name: nombre },
      external_reference: ref,
      back_urls: { success: `${pagina}?ref=${ref}`, pending: `${pagina}?ref=${ref}`, failure: `${pagina}?ref=${ref}` },
      auto_return: 'approved',
      notification_url: `${origen}/api/comida/mp-webhook`,
      statement_descriptor: 'COMIDA',
    });
    await db.prepare('UPDATE comida_compras SET mp_preferencia=? WHERE ref=?').bind(String(pref.id || ''), ref).run();
    const prueba = String(env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
    return json({ ref, pago_url: (prueba && pref.sandbox_init_point) || pref.init_point, total: cobro });
  } catch (e) {
    return error(500, 'No se pudo iniciar el pago: ' + e.message);
  }
}
