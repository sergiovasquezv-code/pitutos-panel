import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1 } from './d1-shim.mjs';
import { asegurarTablas as asegurarMiPOS, llevaConNosotros as llevaMiPOS } from '../mipos-lib/licencias.js';
import { onRequestPost as reportarMiPOS } from '../functions/api/mipos/equipos.js';
import { onRequest as adminMiPOS } from '../functions/api/mipos-admin/[[ruta]].js';
import { asegurarTablas as asegurarMiVet, llevaConNosotros as llevaMiVet } from '../mivet-lib/licencias.js';
import { onRequestPost as reportarMiVet } from '../functions/api/mivet/equipos.js';
import { onRequest as adminMiVet } from '../functions/api/mivet-admin/[[ruta]].js';

test('antigüedad desde la fecha de alta hasta hoy', () => {
  assert.equal(llevaMiPOS('2026-10-11T15:00:00.000Z', '2026-10-25'), 'lleva 14 días con nosotros');
  assert.equal(llevaMiPOS('2026-10-25', '2026-10-25'), 'desde hoy');
  assert.equal(llevaMiPOS('2025-10-25', '2026-10-25'), 'lleva 1 año con nosotros');
  assert.equal(llevaMiPOS('2025-08-11', '2026-10-25'), 'lleva 1 año, 2 meses y 14 días con nosotros');
  assert.equal(llevaMiVet('2026-09-11', '2026-10-25'), 'lleva 1 mes y 14 días con nosotros');
  assert.equal(llevaMiPOS('2026-10-11', '2026-10-25'), llevaMiVet('2026-10-11', '2026-10-25'));
});

async function armar(asegurar, prefijo) {
  const db = createD1('');
  await asegurar(db);
  const creado = '2026-10-11T15:00:00.000Z';
  await db.prepare(`INSERT INTO ${prefijo}_claves(clave, cliente, contacto, creado) VALUES(?,?,?,?)`)
    .bind(`${prefijo.toUpperCase()}-1111-2222-3333`, 'Rincon del jeshu', '+56978283165', creado).run();
  const clave = await db.prepare(`SELECT id FROM ${prefijo}_claves`).first();
  await db.prepare(`INSERT INTO ${prefijo}_activaciones(clave_id, equipo, nombre_pc, creado, ultimo_contacto) VALUES(?,?,?,?,?)`)
    .bind(clave.id, 'AAAA-BBBB-CCCC-DDDD', 'Caja 1', creado, creado).run();
  return { db, claveId: clave.id };
}

async function pedirBackup(admin, env, claveId) {
  const request = new Request(`https://licencias.test/api/admin/claves/${claveId}/respaldo`, {
    method: 'POST',
    headers: { Authorization: 'Bearer clave-de-prueba', 'Content-Type': 'application/json' },
    body: '{}',
  });
  return admin({ request, env, params: { ruta: ['claves', String(claveId), 'respaldo'] }, waitUntil() {} });
}

async function reportar(handler, env, body) {
  const request = new Request('https://licencias.test/api/equipos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return handler({ request, env });
}

test('MiPOS: el backup se pide sin expandir y el programa lo confirma', async () => {
  const { db, claveId } = await armar(asegurarMiPOS, 'mipos');
  const env = { DB: db, MIPOS_ADMIN_CLAVE: 'clave-de-prueba' };
  const pedido = await pedirBackup(adminMiPOS, env, claveId);
  assert.equal(pedido.status, 200);

  const avisado = await reportar(reportarMiPOS, env, { equipo: 'AAAA-BBBB-CCCC-DDDD', k: claveId, clientes: [] });
  assert.equal(avisado.status, 200);
  assert.equal((await avisado.json()).backup, true);

  const hecho = await reportar(reportarMiPOS, env, {
    equipo: 'AAAA-BBBB-CCCC-DDDD', k: claveId, clientes: [],
    respaldo: { estado: 'ok', fecha: '2026-10-25T12:00:00.000Z', detalle: 'copia local' },
  });
  assert.equal((await hecho.json()).backup, false);
  const fila = await db.prepare('SELECT respaldo_estado, respaldo_detalle, respaldo_pedido FROM mipos_activaciones WHERE clave_id=?').bind(claveId).first();
  assert.equal(fila.respaldo_estado, 'ok');
  assert.equal(fila.respaldo_detalle, 'copia local');
  assert.equal(fila.respaldo_pedido, null);
});

test('MiVet: pedir backup marca el servidor y un respaldo ok lo cierra', async () => {
  const { db, claveId } = await armar(asegurarMiVet, 'mivet');
  const env = { DB: db, MIVET_ADMIN_CLAVE: 'clave-de-prueba' };
  const pedido = await pedirBackup(adminMiVet, env, claveId);
  assert.equal(pedido.status, 200);
  const avisado = await reportar(reportarMiVet, env, { equipo: 'AAAA-BBBB-CCCC-DDDD', k: claveId, clientes: [] });
  assert.equal((await avisado.json()).backup, true);
  const hecho = await reportar(reportarMiVet, env, {
    equipo: 'AAAA-BBBB-CCCC-DDDD', k: claveId, clientes: [],
    respaldo: { ok: true, fecha: '2026-10-25T12:00:00.000Z' },
  });
  assert.equal((await hecho.json()).backup, false);
});
