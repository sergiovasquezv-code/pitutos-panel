import assert from 'node:assert/strict';
import test from 'node:test';
import { nombreDescarga } from '../functions/_lib/respaldos.js';

test('el respaldo se baja con el nombre del local y el día', () => {
  assert.equal(
    nombreDescarga('mipos', 'Supermarket R&D , Posible venta de equipo', '2026-11-06T22:54:00.000Z'),
    'MiPOS Supermarket R&D , Posible venta de equipo 2026-11-06.zip',
  );
  assert.equal(
    nombreDescarga('mipos', 'Rincon del jeshu', '2026-11-06T00:00:00.000Z'),
    'MiPOS Rincon del jeshu 2026-11-06.zip',
  );
  assert.equal(nombreDescarga('mipos', 'Panadería José', '2026-11-06'), 'MiPOS Panadería José 2026-11-06.zip');
  assert.equal(nombreDescarga('mipos', 'A/B: local?', ''), 'MiPOS A B local.zip');
  assert.equal(nombreDescarga('mipos', '', '2026-11-06'), 'MiPOS local 2026-11-06.zip');
});
