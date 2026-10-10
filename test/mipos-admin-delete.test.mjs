import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/mipos-admin/[[ruta]].js';

function database({ activeActivation = false, trialExists = true } = {}) {
  const calls = [];
  return {
    calls,
    async batch() {},
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) { call.bindings = bindings; return this; },
        async first() {
          if (sql.startsWith('SELECT * FROM mipos_pruebas WHERE equipo=?')) return trialExists ? { equipo: call.bindings[0] } : null;
          if (sql.startsWith('SELECT 1 FROM mipos_activaciones')) return activeActivation ? { 1: 1 } : null;
          return null;
        },
        async run() { return { meta: { changes: sql.startsWith('DELETE') ? 3 : 1 } }; },
      };
    },
  };
}

async function borrar(db, ruta, token = 'admin') {
  const request = new Request(`https://panel.example/api/mipos-admin/${ruta}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return onRequest({ request, env: { DB: db, MIPOS_ADMIN_CLAVE: 'admin' }, params: { ruta: ruta.split('/') } });
}

test('el borrado de registros exige la clave de administración', async () => {
  const db = database();
  const response = await borrar(db, 'pruebas-bloqueadas', 'incorrecta');
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0);
});

test('limpia solo intentos bloqueados de los últimos 60 días', async () => {
  const db = database();
  const response = await borrar(db, 'pruebas-bloqueadas');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, eliminados: 3 });
  const call = db.calls.find(x => x.sql.startsWith('DELETE FROM mipos_pruebas_bloqueadas'));
  assert.match(call.sql, /fecha >= \?/);
  assert.equal(typeof call.bindings[0], 'string');
});

test('reiniciar una demo conserva su comportamiento y no la elimina', async () => {
  const db = database();
  const response = await borrar(db, 'pruebas/ABCD-EFGH-IJKL-MNOP');
  assert.equal(response.status, 200);
  assert.equal(db.calls.some(x => x.sql.startsWith('UPDATE mipos_pruebas SET inicio=')), true);
  assert.equal(db.calls.some(x => x.sql === 'DELETE FROM mipos_pruebas WHERE equipo=?'), false);
});

test('no permite borrar una demo asociada a una activación vigente', async () => {
  const db = database({ activeActivation: true });
  const response = await borrar(db, 'pruebas/ABCD-EFGH-IJKL-MNOP/eliminar');
  assert.equal(response.status, 409);
  assert.equal(db.calls.some(x => x.sql === 'DELETE FROM mipos_pruebas WHERE equipo=?'), false);
});