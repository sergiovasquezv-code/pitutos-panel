import assert from 'node:assert/strict';
import { createD1 } from './d1-shim.mjs';
import { asegurarTablasSoporte as asegurarTablasMiVet } from '../mivet-lib/licencias.js';
import { asegurarTablasSoporte as asegurarTablasMiPOS } from '../mipos-lib/licencias.js';
import { onRequestPost as soporteMiVet } from '../functions/api/mivet/soporte.js';
import { onRequestPost as soporteMiPOS } from '../functions/api/mipos/soporte.js';

async function crearCaso(handler, env, email) {
  const request = new Request('https://licencias.test/api/soporte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'crear', nombre: 'Prueba', email, texto: 'Necesito ayuda con el programa.' }),
  });
  return handler({ request, env });
}

async function comprobarLimite({ producto, asegurarTablas, handler }) {
  const db = createD1('');
  await asegurarTablas(db);
  const env = { DB: db };

  for (let intento = 0; intento < 5; intento++) {
    const email = intento === 0 ? 'Cliente@ejemplo.cl' : 'cliente@ejemplo.cl';
    const respuesta = await crearCaso(handler, env, email);
    assert.equal(respuesta.status, 200, `${producto}: intento ${intento + 1} debe permitirse`);
  }

  const bloqueado = await crearCaso(handler, env, 'CLIENTE@ejemplo.cl');
  assert.equal(bloqueado.status, 429, `${producto}: sexto caso del correo debe rechazarse`);

  const otroCorreo = await crearCaso(handler, env, 'otro@ejemplo.cl');
  assert.equal(otroCorreo.status, 200, `${producto}: otro correo debe tener su propio límite`);
}

await comprobarLimite({ producto: 'MiVet', asegurarTablas: asegurarTablasMiVet, handler: soporteMiVet });
await comprobarLimite({ producto: 'MiPOS', asegurarTablas: asegurarTablasMiPOS, handler: soporteMiPOS });

console.log('Límite de soporte por correo MiVet y MiPOS: OK');