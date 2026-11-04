import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SQL, corteHistorial, limpiarResumen, vistaLocal } from '../mipos-lib/resumen.js';

const hoy = '2026-11-04';

test('el historial cabe en 90 días', () => {
  const corte = corteHistorial(hoy);
  const dias = Math.round((Date.parse(hoy + 'T12:00:00Z') - Date.parse(corte + 'T12:00:00Z')) / 86400000);
  assert.equal(dias, 89);
  assert.equal(SQL.dias.includes('dia>=?'), true);
  assert.equal(SQL.dias.includes('clave_id=?'), true);
});

test('una clave solo consulta su local y no pide datos de contacto', () => {
  assert.equal(SQL.clave, 'SELECT id, cliente, estado, vence FROM mipos_claves WHERE clave=?');
  assert.equal(SQL.clave.includes('contacto'), false);
  assert.equal(SQL.clave.includes('email'), false);
  assert.equal(SQL.resumen.includes('WHERE clave_id=?'), true);
  const pagina = readFileSync(new URL('../public/mipos-local.html', import.meta.url), 'utf8');
  const ruta = readFileSync(new URL('../functions/api/mipos/mi-local.js', import.meta.url), 'utf8');
  const subida = readFileSync(new URL('../functions/api/mipos/resumen.js', import.meta.url), 'utf8');
  for (const texto of [pagina, ruta, subida]) {
    assert.equal(/whatsapp/i.test(texto), false);
    assert.equal(/telefono/i.test(texto), false);
  }
  assert.match(ruta, /SQL\.clave/);
  assert.match(ruta, /SQL\.resumen/);
  assert.match(ruta, /SQL\.dias/);
  assert.match(subida, /guardarResumen\(db, claveId/);
});

test('el resumen guardado no arrastra clientes, teléfonos, costo ni la base', () => {
  const malo = limpiarResumen({
    dia: hoy,
    total: 3500,
    medios: [{ metodo: 'efectivo', monto: 3500, telefono: '+569000' }],
    stock: [{ codigo: 'A', nombre: 'Funda telefono', precio: 1200, cantidad: 4, precio_costo: 9, telefono: '+569111' }],
    clientes: [{ nombre: 'Juan', telefono: '+569222' }],
    telefono: '+569333',
    whatsapp: '+569444',
  }, hoy);
  assert.equal(malo.error, undefined);
  const crudo = JSON.stringify(malo.resumen);
  assert.equal(crudo.includes('+569'), false);
  assert.equal(crudo.includes('Juan'), false);
  assert.equal(crudo.includes('precio_costo'), false);
  assert.equal(malo.resumen.stock[0].nombre, 'Funda telefono');

  const base = limpiarResumen({ dia: hoy, total: 1, medios: [], stock: [], nota: 'SQLite format 3' }, hoy);
  assert.match(base.error, /base de datos/);

  const limpio = limpiarResumen({
    k: 7,
    equipo: 'AAAA-BBBB-CCCC-DDDD',
    dia: hoy,
    negocio: 'Almacén Luz',
    total: 3500,
    ventas: 1,
    medios: [{ metodo: 'efectivo', monto: 2000 }, { metodo: 'debito', monto: 1500 }],
    stock: [{ codigo: '780', nombre: 'Arroz', precio: 1200, cantidad: 4, extra: 1 }],
    stock_total: 1,
    stock_incompleto: false,
  }, hoy);
  assert.equal(limpio.error, undefined);
  assert.deepEqual(limpio.resumen.stock[0], { codigo: '780', nombre: 'Arroz', precio: 1200, cantidad: 4 });
  assert.equal(JSON.stringify(limpio.resumen).includes('AAAA'), false);
  assert.equal(limpio.resumen.total, 3500);
  assert.equal(limpiarResumen({ dia: '2020-01-01', total: 1, medios: [], stock: [] }, hoy).error !== undefined, true);
});

test('la vista de una clave no incluye la otra ni el contacto', () => {
  const clave = {
    id: 4,
    cliente: 'Almacén Luz',
    contacto: '+56900001111',
    email: 'dueno@tienda.cl',
    whatsapp: '+56911112222',
    clave: 'MIPOS-AAAA-BBBB-CCCC',
    notas: 'secreto',
  };
  const fila = {
    negocio: 'Almacén Luz',
    recibido: '2026-11-04T21:05:00.000Z',
    dia: hoy,
    total: 3500,
    ventas: 1,
    medios: [{ metodo: 'efectivo', monto: 3500, telefono: '+569333' }],
    stock: [{ codigo: '780', nombre: 'Arroz', precio: 1200, cantidad: 4, precio_costo: 10 }],
    stock_total: 1,
    stock_incompleto: 0,
    telefono: '+569333',
  };
  const vista = vistaLocal(clave, fila, [
    { dia: hoy, total: 3500, medios: 'no-copiar' },
    { dia: '2026-11-03', total: 8000 },
  ]);
  const crudo = JSON.stringify(vista);
  assert.equal(crudo.includes('+569'), false);
  assert.equal(crudo.includes('MIPOS-'), false);
  assert.equal(crudo.includes('whatsapp'), false);
  assert.equal(crudo.includes('precio_costo'), false);
  assert.equal(crudo.includes('dueno@'), false);
  assert.equal(vista.negocio, 'Almacén Luz');
  assert.deepEqual(vista.historial, [{ dia: hoy, total: 3500 }, { dia: '2026-11-03', total: 8000 }]);
  assert.deepEqual(vista.medios, [{ metodo: 'efectivo', monto: 3500 }]);
  assert.deepEqual(vista.stock, [{ codigo: '780', nombre: 'Arroz', precio: 1200, cantidad: 4 }]);
  assert.equal('id' in vista, false);
});
