import assert from 'node:assert/strict';
import { createD1 } from './d1-shim.mjs';
import { asegurarTablas as asegurarTablasMiVet } from '../mivet-lib/licencias.js';
import { asegurarTablas as asegurarTablasMiPOS } from '../mipos-lib/licencias.js';
import { onRequestPost as reportarMiVet } from '../functions/api/mivet/equipos.js';
import { onRequestPost as reportarMiPOS } from '../functions/api/mipos/equipos.js';
import { onRequest as resumenMiVet } from '../functions/api/mivet-admin/[[ruta]].js';
import { onRequest as resumenMiPOS } from '../functions/api/mipos-admin/[[ruta]].js';

const equipoServidor = 'AAAA-BBBB-CCCC-DDDD';
const ahora = new Date().toISOString();

async function preparar(db, producto) {
  const prefijo = producto.toLowerCase();
  await db.prepare(`INSERT INTO ${prefijo}_claves(clave, cliente, creado) VALUES(?,?,?)`)
    .bind(`${producto}-1111-2222-3333`, 'Clínica de prueba', ahora).run();
  const clave = await db.prepare(`SELECT id FROM ${prefijo}_claves WHERE cliente=?`).bind('Clínica de prueba').first();
  await db.prepare(`INSERT INTO ${prefijo}_activaciones(clave_id, equipo, nombre_pc, creado, ultimo_contacto) VALUES(?,?,?,?,?)`)
    .bind(clave.id, equipoServidor, 'Servidor clínica', ahora, ahora).run();
  return clave.id;
}

async function requestPost(handler, env, body) {
  const request = new Request('https://licencias.test/api/equipos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return handler({ request, env });
}

async function verificarProducto({ producto, crearTablas, reportar, resumen, tabla }) {
  const db = createD1('');
  await crearTablas(db);
  const adminSecret = 'clave-de-prueba';
  const env = { DB: db, MIVET_ADMIN_CLAVE: adminSecret, MIPOS_ADMIN_CLAVE: adminSecret };
  const claveId = await preparar(db, producto);
  const clientes = [
    { id: 'cliente-uno', nombre: 'Recepción', usuario: 'ana' },
    { id: 'cliente-dos', nombre: 'Box 1', usuario: 'luis' },
  ];

  const respuesta = await requestPost(reportar, env, { equipo: equipoServidor, k: claveId, clientes });
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).reportados, 2);

  const request = new Request('https://licencias.test/api/admin/resumen', {
    headers: { Authorization: `Bearer ${adminSecret}` },
  });
  const adminResponse = await resumen({ request, env, params: { ruta: ['resumen'] }, waitUntil() {} });
  assert.equal(adminResponse.status, 200);
  const datos = await adminResponse.json();
  const puestos = datos.claves.find(x => x.id === claveId).equipos[0].puestos;
  assert.equal(puestos.length, 2);
  assert.deepEqual(puestos.map(x => x.nombre).sort(), ['Box 1', 'Recepción']);

  const almacenados = await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).first();
  assert.equal(almacenados.n, 2);
}

await verificarProducto({
  producto: 'mivet', crearTablas: asegurarTablasMiVet, reportar: reportarMiVet,
  resumen: resumenMiVet, tabla: 'mivet_puestos_reportados',
});
await verificarProducto({
  producto: 'mipos', crearTablas: asegurarTablasMiPOS, reportar: reportarMiPOS,
  resumen: resumenMiPOS, tabla: 'mipos_puestos_reportados',
});

console.log('Reportes de equipos MiVet y MiPOS: OK');