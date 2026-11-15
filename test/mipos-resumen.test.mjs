import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SQL, corteHistorial, limpiarResumen, porCajero, vistaLocal } from '../mipos-lib/resumen.js';

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
  assert.deepEqual(vista.historial, [
    { dia: hoy, total: 3500, ventas: 0, anuladas: 0 },
    { dia: '2026-11-03', total: 8000, ventas: 0, anuladas: 0 },
  ]);
  assert.deepEqual(vista.medios, [{ metodo: 'efectivo', monto: 3500 }]);
  assert.deepEqual(vista.stock, [{ codigo: '780', nombre: 'Arroz', precio: 1200, cantidad: 4 }]);
  assert.equal('id' in vista, false);
});

test('la venta anulada queda en el detalle y no suma al total', () => {
  const venta = {
    folio: 12,
    hora: '10:15',
    cajero: 'Ana',
    cliente: 'Rosa',
    estado: 'anulada',
    total: 4000,
    devuelto: 0,
    metodos: ['efectivo'],
    items: [{ nombre: 'Pan', cantidad: 2, total: 4000, precio_costo: 10, telefono: '+569777' }],
    anulada_hora: '10:20',
    anulada_por: 'Admin',
    motivo: 'Se equivocó de producto',
    telefono: '+569777',
  };
  const limpio = limpiarResumen({
    dia: hoy,
    total: 9000,
    ventas: 1,
    anuladas: 1,
    devuelto: 0,
    medios: [{ metodo: 'efectivo', monto: 9000 }],
    lista: [
      { folio: 13, hora: '11:00', cajero: 'Ana', cliente: 'Rosa', estado: 'completada', total: 9000, metodos: ['efectivo'], items: [{ nombre: 'Leche', cantidad: 1, total: 9000 }] },
      venta,
    ],
    productos: [{ codigo: '1', nombre: 'Leche', cantidad: 1, monto: 9000, telefono: '+569777' }],
    stock: [],
  }, hoy);
  assert.equal(limpio.error, undefined);
  assert.equal(limpio.resumen.total, 9000);
  assert.equal(limpio.resumen.lista[1].estado, 'anulada');
  assert.equal(limpio.resumen.lista[1].motivo, 'Se equivocó de producto');
  assert.equal(limpio.resumen.lista[1].cliente, 'Rosa');
  const crudo = JSON.stringify(limpio.resumen);
  assert.equal(crudo.includes('+569'), false);
  assert.equal(crudo.includes('precio_costo'), false);
  const vista = vistaLocal({ cliente: 'Local' }, {
    negocio: 'Local', recibido: '2026-11-04T18:00:00.000Z', dia: hoy, total: 9000, ventas: 1,
    medios: [], stock: [{ codigo: '1', nombre: 'Leche', precio: 9000, cantidad: 3 }], stock_total: 1,
  }, [{
    dia: hoy,
    total: 9000,
    detalle: {
      ventas: 1, anuladas: 1, devuelto: 0, medios: [{ metodo: 'efectivo', monto: 9000 }],
      lista: limpio.resumen.lista, productos: limpio.resumen.productos,
    },
  }]);
  assert.equal(vista.lista[1].estado, 'anulada');
  assert.equal(vista.total, 9000);
  assert.equal(vista.ayuda.mas_plata[0].nombre, 'Leche');
  assert.equal(JSON.stringify(vista).includes('+569'), false);
  assert.deepEqual(vista.por_cajero, [{
    cajero: 'Ana',
    ventas: 1,
    total: 9000,
    medios: [{ metodo: 'efectivo', monto: 9000 }],
    sin_desglose: false,
  }]);
});

test('por cajero suma el día elegido, deja afuera la anulada y no reparte un pago mixto', () => {
  const listaHoy = [
    { folio: 1, hora: '09:00', cajero: 'Ana', estado: 'completada', total: 8000, devuelto: 0, metodos: ['efectivo'], items: [] },
    { folio: 2, hora: '09:10', cajero: 'Ana', estado: 'completada', total: 4000, devuelto: 1000, metodos: ['debito'], items: [] },
    { folio: 3, hora: '09:20', cajero: 'Ana', estado: 'anulada', total: 5000, devuelto: 0, metodos: ['efectivo'], items: [] },
    { folio: 4, hora: '10:00', cajero: 'Luis', estado: 'completada', total: 6000, devuelto: 0, metodos: ['efectivo', 'credito'], items: [] },
    { folio: 5, hora: '11:00', cajero: 'Luis', estado: 'completada', total: 2000, devuelto: 0, metodos: ['transferencia'], items: [] },
    { folio: 6, hora: '12:00', cajero: 'Marta', estado: 'completada', total: 1500, devuelto: 0, metodos: [], items: [] },
    { folio: 7, hora: '13:00', cajero: 'Nora', estado: 'completada', total: 3000, devuelto: 3000, metodos: ['fiado'], items: [] },
  ];
  const listaAyer = [
    { folio: 8, hora: '18:00', cajero: 'Rosa', estado: 'completada', total: 500, devuelto: 0, metodos: ['credito'], items: [] },
  ];
  const fila = {
    negocio: 'Local', recibido: '2026-11-04T18:00:00.000Z', dia: hoy, total: 17500, ventas: 6,
    medios: [], stock: [], stock_total: 0,
  };
  const dias = [
    { dia: hoy, total: 17500, detalle: { ventas: 6, anuladas: 1, devuelto: 4000, medios: [], lista: listaHoy, productos: [] } },
    { dia: '2026-11-03', total: 500, detalle: { ventas: 1, anuladas: 0, devuelto: 0, medios: [], lista: listaAyer, productos: [] } },
  ];
  const hoyVista = vistaLocal({ cliente: 'Local' }, fila, dias);
  assert.deepEqual(hoyVista.por_cajero, [
    {
      cajero: 'Ana', ventas: 2, total: 11000,
      medios: [{ metodo: 'efectivo', monto: 8000 }, { metodo: 'debito', monto: 3000 }],
      sin_desglose: false,
    },
    {
      cajero: 'Luis', ventas: 2, total: 8000,
      medios: [{ metodo: 'transferencia', monto: 2000 }],
      sin_desglose: true,
    },
    { cajero: 'Marta', ventas: 1, total: 1500, medios: [], sin_desglose: true },
    { cajero: 'Nora', ventas: 1, total: 0, medios: [], sin_desglose: false },
  ]);
  const ayer = vistaLocal({ cliente: 'Local' }, fila, dias, '2026-11-03');
  assert.deepEqual(ayer.por_cajero, [{
    cajero: 'Rosa', ventas: 1, total: 500,
    medios: [{ metodo: 'credito', monto: 500 }],
    sin_desglose: false,
  }]);
  assert.deepEqual(porCajero(null), []);
  const pagina = readFileSync(new URL('../public/mipos-local.html', import.meta.url), 'utf8');
  assert.match(pagina, /Por cajero/);
  assert.match(pagina, /id="cajeros"/);
  assert.match(pagina, /id="hist-cajeros"/);
  assert.equal(/whatsapp/i.test(pagina), false);
});
