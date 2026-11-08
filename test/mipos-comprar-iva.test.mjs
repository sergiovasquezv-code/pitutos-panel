import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { asegurarTablasVenta, revisarPago } from '../mipos-lib/licencias.js';
import { onRequestPost, precioConIva } from '../functions/api/mipos/comprar.js';
import { createD1 } from './d1-shim.mjs';

const NETOS = [
  ['Mensual', 1, 10000, 11900],
  ['Anual', 12, 100000, 119000],
  ['Licencia Perpetua', 0, 200000, 238000],
];

test('el IVA de la licencia es 19% en pesos enteros', () => {
  for (const [, , neto, total] of NETOS) {
    assert.equal(precioConIva(neto), total);
    assert.equal(Number.isInteger(total), true);
  }
  assert.equal(precioConIva(10000.4), 11900);
  assert.notEqual(precioConIva(200000), 200000);
});

test('la página muestra el total con IVA y el botón cobra ese total', () => {
  const pagina = readFileSync(new URL('../public/mipos-comprar.html', import.meta.url), 'utf8');
  assert.match(pagina, /\+ IVA 19%/);
  assert.match(pagina, /incluye IVA/);
  assert.match(pagina, /\$11\.900/);
  assert.match(pagina, /\$119\.000/);
  assert.match(pagina, /\$238\.000/);
  assert.match(pagina, /\$10\.000/);
  assert.match(pagina, /\$100\.000/);
  assert.match(pagina, /\$200\.000/);
  assert.match(pagina, /neto \$\{clp\(porMes\)\} al mes, sin IVA/);
  assert.match(pagina, /Pagar \$\{totalVisible\(p\.precio\)\} con Mercado Pago/);
  assert.equal(pagina.includes('clp(p.precio)'), false);
  assert.equal(pagina.includes('class="equivale"'), false);
});

test('Mercado Pago cobra el total con IVA y un pago del neto no alcanza', async () => {
  const preferencias = [];
  const pagos = new Map();
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith('/checkout/preferences')) {
      const body = JSON.parse(opts.body);
      preferencias.push(body);
      return Response.json({ id: `pref-${preferencias.length}`, init_point: 'https://mp.test/checkout' }, { status: 201 });
    }
    const id = u.match(/\/v1\/payments\/(\d+)$/);
    if (id) {
      const pago = pagos.get(id[1]);
      return pago ? Response.json(pago) : Response.json({ message: 'no' }, { status: 404 });
    }
    throw new Error('fetch inesperado ' + u);
  };

  try {
    const db = createD1('SELECT 1');
    const env = { DB: db, MP_ACCESS_TOKEN: 'APP_USR-prueba', MIPOS_MP_API: 'https://mp.test' };
    await asegurarTablasVenta(db);
    const pedido = (planId) => new Request('https://panel.example/api/mipos/comprar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.8' },
      body: JSON.stringify({
        plan_id: planId, nombre: 'Almacén Rosita', email: 'rosita@ejemplo.cl', telefono: '+56911112222', precio: 1,
      }),
    });

    for (const [nombre, meses, neto] of NETOS) {
      await db.prepare(
        'INSERT INTO mipos_planes(nombre, descripcion, meses, cajas, precio, destacado, activo, orden, creado) VALUES(?,?,?,?,?,?,?,?,?)'
      ).bind(nombre, '', meses, 2, neto, meses === 0 ? 1 : 0, 1, meses, '2026-11-08T00:00:00.000Z').run();
    }
    const planes = (await db.prepare('SELECT id, nombre, precio FROM mipos_planes ORDER BY id').all()).results;

    for (const plan of planes) {
      const esperado = precioConIva(plan.precio);
      const antes = preferencias.length;
      const res = await onRequestPost({ request: pedido(plan.id), env });
      const cuerpo = await res.json();
      assert.equal(res.status, 200, JSON.stringify(cuerpo));
      const pref = preferencias[preferencias.length - 1];
      assert.equal(preferencias.length, antes + 1);
      assert.equal(pref.items[0].unit_price, esperado);
      assert.equal(pref.items[0].quantity, 1);
      assert.equal(pref.items[0].currency_id, 'CLP');
      assert.match(pref.items[0].description, /IVA incluido/);
      assert.notEqual(pref.items[0].unit_price, plan.precio);
      const guardado = await db.prepare('SELECT precio, meses, cajas FROM mipos_compras WHERE ref=?').bind(cuerpo.ref).first();
      assert.equal(guardado.precio, esperado);
      assert.equal(guardado.cajas, 2);
      assert.equal(guardado.meses, plan.nombre === 'Anual' ? 12 : plan.nombre === 'Mensual' ? 1 : 0);

      const barato = String(900 + plan.id);
      pagos.set(barato, {
        id: Number(barato), status: 'approved', status_detail: 'accredited', external_reference: cuerpo.ref,
        transaction_amount: plan.precio, currency_id: 'CLP',
      });
      const compra = await db.prepare('SELECT * FROM mipos_compras WHERE ref=?').bind(cuerpo.ref).first();
      await revisarPago(db, env, { pagoId: barato, compra });
      const rechazado = await db.prepare('SELECT estado, mp_detalle FROM mipos_compras WHERE ref=?').bind(cuerpo.ref).first();
      assert.equal(rechazado.estado, 'pendiente');
      assert.match(rechazado.mp_detalle, /Monto no cuadra/);

      const justo = String(800 + plan.id);
      pagos.set(justo, {
        id: Number(justo), status: 'approved', status_detail: 'accredited', external_reference: cuerpo.ref,
        transaction_amount: esperado, currency_id: 'CLP',
      });
      const lista = await db.prepare('SELECT * FROM mipos_compras WHERE ref=?').bind(cuerpo.ref).first();
      const ok = await revisarPago(db, env, { pagoId: justo, compra: lista });
      assert.equal(ok.estado, 'aprobada');
      assert.equal(ok.precio, esperado);
      assert.equal(ok.vence_resultado, plan.nombre === 'Licencia Perpetua' ? null : ok.vence_resultado);
      if (plan.nombre === 'Licencia Perpetua') assert.equal(ok.vence_resultado, null);
      if (plan.nombre === 'Mensual') assert.equal(ok.meses, 1);
    }
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
