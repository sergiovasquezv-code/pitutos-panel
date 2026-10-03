// POST /api/mipos/comprar {plan_id, nombre, email, telefono (+569XXXXXXXX), equipo?, clave?} -> {pago_url, ref}
// Crea la compra pendiente y la preferencia de Mercado Pago. El precio sale SIEMPRE del plan guardado, nunca del navegador.
import { asegurarTablasVenta, base, claveDeEquipo, error, json, leerCuerpo, mp, normalizarClave, normalizarEquipo,
  TERMINOS_VERSION, texto, ahora } from '../../../mipos-lib/licencias.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = base(env);
    await asegurarTablasVenta(db);
    const d = await leerCuerpo(request);
    const plan = await db.prepare('SELECT * FROM mipos_planes WHERE id=? AND activo=1').bind(parseInt(d.plan_id, 10) || 0).first();
    if (!plan) return error(400, 'Elige un plan');
    const nombre = texto(d.nombre, 100), email = texto(d.email, 120).toLowerCase(), telefono = texto(d.telefono, 30);
    if (!nombre) return error(400, 'Escribe el nombre de tu negocio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, 'Escribe un correo válido: ahí te llega la licencia');
    const m = telefono.replace(/\D/g, '').match(/^(?:569|9)?(\d{8})$/);  // 12345678, 912345678 o 56912345678
    if (!m) return error(400, 'Escribe tu celular: +569 y 8 números');
    const cel = m[1];
    let equipo = d.equipo ? normalizarEquipo(d.equipo) : null;
    let clave = null;
    if (d.clave) {
      const txt = normalizarClave(d.clave);
      clave = txt && await db.prepare('SELECT * FROM mipos_claves WHERE clave=?').bind(txt).first();
      if (!clave) return error(400, 'No encontré esa clave de producto para renovar. Revísala o déjala vacía para comprar una nueva.');
      // el PC solo se vincula si ya estaba en esa clave (no se pasa del máximo de equipos)
      if (equipo && !(await db.prepare("SELECT 1 FROM mipos_activaciones WHERE clave_id=? AND equipo=? AND estado='activa'").bind(clave.id, equipo).first())) equipo = null;
    } else if (equipo) {
      clave = await claveDeEquipo(db, equipo);
    }
    const ref = crypto.randomUUID();
    const origen = new URL(request.url).origin;
    const pagina = env.MIPOS_URL_PAGINA || `${origen}/mipos-comprar.html`;
    await db.prepare('INSERT INTO mipos_compras(ref, plan_id, plan_nombre, precio, meses, cajas, nombre, email, telefono, equipo, clave_id, renovacion, terminos_version, terminos_aceptados, ip, creado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(ref, plan.id, plan.nombre, plan.precio, plan.meses, plan.cajas, nombre, email, '+569' + cel, equipo, clave ? clave.id : null, clave ? 1 : 0,
            TERMINOS_VERSION, ahora(), request.headers.get('CF-Connecting-IP') || '', ahora()).run();
    const pref = await mp(env, 'POST', '/checkout/preferences', {
      items: [{ id: `plan-${plan.id}`, title: `MiPOS · ${plan.nombre}${clave ? ' (renovación)' : ''}`,
                description: `${plan.cajas} caja(s) · ${plan.meses} mes(es)`, quantity: 1, currency_id: 'CLP', unit_price: plan.precio }],
      payer: { email, name: nombre },
      external_reference: ref,
      back_urls: { success: `${pagina}?ref=${ref}`, pending: `${pagina}?ref=${ref}`, failure: `${pagina}?ref=${ref}` },
      auto_return: 'approved',
      notification_url: env.MIPOS_URL_WEBHOOK || `${origen}/api/mipos/mp-webhook`,
      statement_descriptor: 'MIPOS',
    });
    await db.prepare('UPDATE mipos_compras SET mp_preferencia=? WHERE ref=?').bind(String(pref.id || ''), ref).run();
    const prueba = String(env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
    return json({ ref, pago_url: (prueba && pref.sandbox_init_point) || pref.init_point });
  } catch (e) {
    return error(500, 'No se pudo iniciar el pago: ' + e.message);
  }
}
