import assert from 'node:assert/strict';
import test from 'node:test';
import { asociarLicenciasVigentesAPruebas as asociarMiVet } from '../mivet-lib/licencias.js';
import { asociarLicenciasVigentesAPruebas as asociarMiPOS } from '../mipos-lib/licencias.js';

const hoy = '2026-10-10';
const pruebas = [
  { equipo: 'AAAA-BBBB-CCCC-DDDD', nombre_pc: 'PC pagado' },
  { equipo: 'EEEE-FFFF-GGGG-HHHH', nombre_pc: 'PC prueba' },
  { equipo: 'IIII-JJJJ-KKKK-LLLL', nombre_pc: 'PC clave vencida' },
  { equipo: 'MMMM-NNNN-OOOO-PPPP', nombre_pc: 'PC liberado' },
];
const claves = [
  { id: 1, cliente: 'Clínica pagada', estado: 'activa', vence: null },
  { id: 2, cliente: 'Cliente clave vencida', estado: 'activa', vence: '2026-10-09' },
  { id: 3, cliente: 'Cliente suspendido', estado: 'bloqueada', vence: null },
];
const activaciones = [
  { clave_id: 1, equipo: pruebas[0].equipo, estado: 'activa' },
  { clave_id: 2, equipo: pruebas[2].equipo, estado: 'activa' },
  { clave_id: 3, equipo: pruebas[1].equipo, estado: 'activa' },
  { clave_id: 1, equipo: pruebas[3].equipo, estado: 'liberada' },
];

for (const [producto, asociar] of [['MiVet', asociarMiVet], ['MiPOS', asociarMiPOS]]) {
  test(`${producto}: solo marca equipos con licencia vigente y activación activa`, () => {
    const resultado = asociar(pruebas, claves, activaciones, hoy);
    assert.deepEqual(resultado.map(prueba => prueba.licencia_vigente?.cliente || null), [
      'Clínica pagada', null, null, null,
    ]);
    assert.equal(resultado[1].equipo, pruebas[1].equipo);
  });
}