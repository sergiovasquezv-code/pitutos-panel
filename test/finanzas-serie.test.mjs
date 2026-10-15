import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createD1 } from './d1-shim.mjs';
import { onRequestGet } from '../functions/api/finanzas/resumen.js';
import { periodoActual, addMonths } from '../functions/_lib/dates.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const abonosSql = readFileSync(new URL('../migration_abonos.sql', import.meta.url), 'utf8').split('INSERT INTO abonos')[0];

function mesRel(n) { return addMonths(periodoActual() + '-01', n).slice(0, 7); }

async function armar() {
  const db = createD1(schema);
  await db.exec(abonosSql);
  const ahora = new Date().toISOString();
  await db.exec(`INSERT INTO clientes (nombre, creado_en) VALUES ('Ana','${ahora}'),('Beto','${ahora}')`);
  // Trabajo de hace 2 meses (200.000) con abono hace 1 mes (50.000) y otro este mes (30.000)
  await db.exec(`INSERT INTO trabajos (cliente_id,tipo,descripcion,monto,fecha_creacion) VALUES (1,'Soporte','a',200000,'${mesRel(-2)}-15T15:00:00.000Z')`);
  // Trabajo creado el último día del mes pasado a las 23:30 hora Chile (= ya es día 1 en UTC): debe contar en el mes pasado
  const finMesPasado = new Date(Date.UTC(Number(periodoActual().slice(0,4)), Number(periodoActual().slice(5,7)) - 1, 1, 2, 30)).toISOString();
  await db.exec(`INSERT INTO trabajos (cliente_id,tipo,descripcion,monto,fecha_creacion) VALUES (2,'Soporte','b',10000,'${finMesPasado}')`);
  await db.exec(`INSERT INTO equipos (cliente_id,tipo_equipo,precio,fecha_venta,creado_en) VALUES (2,'Notebook',350000,'${mesRel(-1)}-10','${ahora}')`);
  await db.exec(`INSERT INTO mensualidades (cliente_id,descripcion,monto,activo,creado_en) VALUES (1,'Soporte mensual',20000,1,'${mesRel(-1)}-01T12:00:00.000Z')`);
  await db.exec(`INSERT INTO abonos (categoria,referencia_id,periodo,monto,fecha_pago,creado_en) VALUES
    ('trabajo',1,NULL,50000,'${mesRel(-1)}-20','${ahora}'),
    ('trabajo',1,NULL,30000,'${periodoActual()}-02','${ahora}'),
    ('mensualidad',1,'${mesRel(-1)}',20000,'${mesRel(-1)}-05','${ahora}')`);
  return db;
}

test('serie mensual: facturado y cobrado por mes y categoría', async () => {
  const db = await armar();
  const res = await onRequestGet({ env: { DB: db } });
  const data = await res.json();
  assert.ok(Array.isArray(data.serie));
  const porMes = Object.fromEntries(data.serie.map((s) => [s.mes, s]));

  // Meses continuos, del primero con datos hasta el actual
  assert.equal(data.serie[0].mes, mesRel(-2));
  assert.equal(data.serie.at(-1).mes, periodoActual());
  assert.equal(data.serie.length, 3);

  assert.equal(porMes[mesRel(-2)].facturado.trabajo, 200000);
  // el trabajo de las 23:30 hora Chile del último día cuenta en el mes pasado
  assert.equal(porMes[mesRel(-1)].facturado.trabajo, 10000);
  assert.equal(porMes[mesRel(-1)].facturado.equipo, 350000);
  // la mensualidad se factura cada mes desde que se creó
  assert.equal(porMes[mesRel(-1)].facturado.mensualidad, 20000);
  assert.equal(porMes[periodoActual()].facturado.mensualidad, 20000);

  assert.equal(porMes[mesRel(-1)].cobrado.trabajo, 50000);
  assert.equal(porMes[mesRel(-1)].cobrado.mensualidad, 20000);
  assert.equal(porMes[periodoActual()].cobrado.trabajo, 30000);
  assert.equal(porMes[mesRel(-2)].cobrado.trabajo, 0);
});

test('los totales y la tabla por cliente de antes no cambian', async () => {
  const db = await armar();
  const data = await (await onRequestGet({ env: { DB: db } })).json();
  // 200.000 + 10.000 + 350.000 + mensualidad del mes actual 20.000
  assert.equal(data.total_facturado, 580000);
  // trabajo 80.000 + mensualidad del mes actual 0 (el abono fue del mes pasado)
  assert.equal(data.total_abonado, 80000);
  assert.equal(data.total_pendiente, 500000);
  assert.equal(data.clientes.length, 2);
});

test('sin datos: serie vacía y no se cae', async () => {
  const db = createD1(schema);
  await db.exec(abonosSql);
  const data = await (await onRequestGet({ env: { DB: db } })).json();
  assert.deepEqual(data.serie, []);
});
