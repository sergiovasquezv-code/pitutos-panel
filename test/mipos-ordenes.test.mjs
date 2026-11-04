import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createD1 } from './d1-shim.mjs';
import { limpiarOrden } from '../mipos-lib/ordenes.js';
import { onRequestPost as local } from '../functions/api/mipos/mi-local.js';
import { onRequestPost as ordenes } from '../functions/api/mipos/ordenes.js';

const CLAVE = 'MIPOS-ABCD-EFGH-IJKL';
const CORREO = 'dueno.local@ejemplo.cl';
const PASS = 'clave-dueno-99881';

test('la corrección de stock es una suma o una resta', () => {
  const fijo = limpiarOrden({ tipo: 'stock', codigo: 'A', nombre: 'Arroz', modo: 'fijar', cantidad: 4, motivo: 'conteo' });
  assert.match(fijo.error, /sumar o restar/);
  const ok = limpiarOrden({
    tipo: 'stock', codigo: '780', nombre: 'Arroz', modo: 'restar', cantidad: 2, motivo: 'venció', stock: 0,
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.orden.delta, -2);
  assert.equal(ok.orden.precio, null);
  assert.equal('stock' in ok.orden, false);
  assert.equal(limpiarOrden({ tipo: 'precio', codigo: '780', nombre: 'Arroz', precio: 0 }).error !== undefined, true);
  assert.equal(limpiarOrden({ tipo: 'borrar', codigo: '780', nombre: 'Arroz' }).error !== undefined, true);
  assert.match(limpiarOrden({ tipo: 'precio', codigo: 'A', nombre: 'Arroz', precio: 100, nota: 'SQLite format 3' }).error, /base/);
  assert.deepEqual(limpiarOrden({ tipo: 'precio', codigo: '780', nombre: 'Arroz', precio: 1500 }).orden, {
    tipo: 'precio', codigo: '780', nombre: 'Arroz', precio: 1500, delta: null, motivo: '',
  });
  assert.match(limpiarOrden({ tipo: 'nombre', codigo: '780', nombre: 'Arroz', nombre_nuevo: 'Arroz' }).error, /mismo/);
  assert.deepEqual(limpiarOrden({ tipo: 'nombre', codigo: '780', nombre: 'Arroz', nombre_nuevo: 'Arroz grano' }).orden, {
    tipo: 'nombre', codigo: '780', nombre: 'Arroz', precio: null, delta: null, motivo: 'Arroz grano',
  });
});

test('la página sigue dejando entrar solo con la clave', () => {
  const pagina = readFileSync(new URL('../public/mipos-local.html', import.meta.url), 'utf8');
  assert.match(pagina, /id="clave"/);
  assert.match(pagina, /Si no los escribes, la clave sigue sirviendo/);
  assert.equal(/whatsapp/i.test(pagina), false);
  assert.equal(/telefono/i.test(pagina), false);
});

function pedido(ruta, body, ip = '203.0.113.10') {
  return new Request('https://panel.example' + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

test('el dueño guarda correo si quiere, corrige, y el PC aplica una vez', async () => {
  const db = createD1('SELECT 1');
  const env = { DB: db };

  const vacia = await local({ request: pedido('/api/mipos/mi-local', { clave: 'no' }), env });
  assert.equal(vacia.status, 400);

  await db.prepare(
    "INSERT INTO mipos_claves(clave, cliente, estado, creado) VALUES(?, 'Almacén Luz', 'activa', '2026-11-04T00:00:00.000Z')"
  ).bind(CLAVE).run();
  await db.prepare(
    "INSERT INTO mipos_claves(clave, cliente, estado, creado) VALUES('MIPOS-ZZZZ-YYYY-XXXX', 'Otro', 'activa', '2026-11-04T00:00:00.000Z')"
  ).run();

  const soloClave = await (await local({ request: pedido('/api/mipos/mi-local', { clave: CLAVE }), env })).json();
  assert.equal(soloClave.acceso, null);
  assert.deepEqual(soloClave.pendientes, []);
  assert.equal(JSON.stringify(soloClave).includes('pbkdf2'), false);

  const corta = await local({
    request: pedido('/api/mipos/mi-local', { clave: CLAVE, accion: 'guardar-acceso', correo: CORREO, clave_acceso: 'corta' }),
    env,
  });
  assert.equal(corta.status, 400);

  const guardado = await (await local({
    request: pedido('/api/mipos/mi-local', { clave: CLAVE, accion: 'guardar-acceso', correo: CORREO, clave_acceso: PASS }),
    env,
  })).json();
  assert.equal(guardado.acceso.correo, CORREO);
  assert.equal(JSON.stringify(guardado).includes(PASS), false);
  assert.equal(JSON.stringify(guardado).includes('pbkdf2'), false);

  const sigueLaClave = await (await local({ request: pedido('/api/mipos/mi-local', { clave: CLAVE }), env })).json();
  assert.equal(sigueLaClave.acceso.correo, CORREO);

  const mal = await local({ request: pedido('/api/mipos/mi-local', { correo: CORREO, clave_acceso: 'otra-clave-larga' }), env });
  const desconocido = await local({ request: pedido('/api/mipos/mi-local', { correo: 'nadie@ejemplo.cl', clave_acceso: PASS }), env });
  assert.equal(mal.status, 403);
  assert.equal(desconocido.status, 403);
  assert.equal((await mal.json()).error, (await desconocido.json()).error);

  const conCorreo = await (await local({
    request: pedido('/api/mipos/mi-local', { correo: CORREO, clave_acceso: PASS }),
    env,
  })).json();
  assert.equal(typeof conCorreo.token, 'string');
  assert.equal(JSON.stringify(conCorreo).includes('MIPOS-'), false);
  assert.equal(JSON.stringify(conCorreo).includes(PASS), false);

  const conToken = await (await local({ request: pedido('/api/mipos/mi-local', { token: conCorreo.token }), env })).json();
  assert.equal(conToken.acceso.correo, CORREO);
  assert.equal(conToken.sin_datos, true);

  const precio = await local({
    request: pedido('/api/mipos/mi-local', {
      token: conCorreo.token, accion: 'precio', tipo: 'precio', codigo: '780', nombre: 'Arroz', precio: 1800,
    }),
    env,
  });
  assert.equal(precio.status, 200);
  const otraVez = await local({
    request: pedido('/api/mipos/mi-local', {
      clave: CLAVE, accion: 'precio', tipo: 'precio', codigo: '780', nombre: 'Arroz', precio: 1900,
    }),
    env,
  });
  assert.equal(otraVez.status, 400);

  const stock = await (await local({
    request: pedido('/api/mipos/mi-local', {
      clave: CLAVE, accion: 'stock', tipo: 'stock', codigo: '780', nombre: 'Arroz',
      modo: 'restar', cantidad: 2, motivo: 'venció',
    }),
    env,
  })).json();
  assert.equal(stock.pendientes.length, 2);
  const filaStock = await db.prepare("SELECT delta, precio FROM mipos_ordenes WHERE tipo='stock'").first();
  assert.equal(filaStock.delta, -2);
  assert.equal(filaStock.precio, null);

  const borrar = await local({
    request: pedido('/api/mipos/mi-local', { clave: CLAVE, accion: 'borrar', codigo: '780' }),
    env,
  });
  assert.equal(borrar.status, 400);

  const clave = await db.prepare('SELECT id FROM mipos_claves WHERE clave=?').bind(CLAVE).first();
  const otro = await db.prepare("SELECT id FROM mipos_claves WHERE cliente='Otro'").first();
  for (const id of [clave.id, otro.id]) {
    await db.prepare(
      "INSERT INTO mipos_activaciones(clave_id, equipo, estado, creado) VALUES(?, 'ABCD-EFGH-IJKL-MNOP', 'activa', '2026-11-04T00:00:00.000Z')"
    ).bind(id).run();
  }

  const bajada = await (await ordenes({
    request: pedido('/api/mipos/ordenes', { k: clave.id, equipo: 'ABCD-EFGH-IJKL-MNOP', accion: 'sincronizar', confirmar: [] }),
    env,
  })).json();
  assert.equal(bajada.ordenes.length, 2);
  assert.deepEqual(bajada.ordenes.map(o => o.tipo).sort(), ['precio', 'stock']);

  const ajena = await (await ordenes({
    request: pedido('/api/mipos/ordenes', {
      k: otro.id, equipo: 'ABCD-EFGH-IJKL-MNOP', accion: 'sincronizar',
      confirmar: bajada.ordenes.map(o => ({ id: o.id, resultado: 'aplicada', detalle: '' })),
    }),
    env,
  })).json();
  assert.equal(ajena.ordenes.length, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM mipos_ordenes WHERE estado='pendiente'").first()).n, 2);

  const confirmada = await (await ordenes({
    request: pedido('/api/mipos/ordenes', {
      k: clave.id, equipo: 'ABCD-EFGH-IJKL-MNOP', accion: 'sincronizar',
      confirmar: bajada.ordenes.map(o => ({ id: o.id, resultado: 'aplicada', detalle: '' })),
    }),
    env,
  })).json();
  assert.deepEqual(confirmada.ordenes, []);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM mipos_ordenes WHERE estado='pendiente'").first()).n, 0);

  const recien = new Date().toISOString();
  for (let i = 0; i < 8; i++) {
    await db.prepare("INSERT INTO mipos_acceso_fallos(ip, fecha) VALUES('203.0.113.99', ?)").bind(recien).run();
  }
  const bloqueo = await local({
    request: pedido('/api/mipos/mi-local', { correo: CORREO, clave_acceso: PASS }, '203.0.113.99'),
    env,
  });
  assert.equal(bloqueo.status, 429);
});
