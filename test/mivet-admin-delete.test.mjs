import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/mivet-admin/[[ruta]].js';

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
          if (sql.startsWith('SELECT * FROM mivet_pruebas WHERE equipo=?')) return trialExists ? { equipo: call.bindings[0] } : null;
          if (sql.startsWith('SELECT 1 FROM mivet_activaciones')) return activeActivation ? { 1: 1 } : null;
          return null;
        },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
}

async function borrar(db, ruta, token = 'admin') {
  const request = new Request(`https://panel.example/api/mivet-admin/${ruta}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return onRequest({ request, env: { DB: db, MIVET_ADMIN_CLAVE: 'admin' }, params: { ruta: ruta.split('/') } });
}

test('el borrado de demos exige la clave administrativa', async () => {
  const db = database();
  const response = await borrar(db, 'pruebas/ABCD-EFGH-IJKL-MNOP/eliminar', 'incorrecta');
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0);
});

test('elimina una demo y registra la acción sin borrar licencias', async () => {
  const db = database();
  const response = await borrar(db, 'pruebas/ABCD-EFGH-IJKL-MNOP/eliminar');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(db.calls.some(x => x.sql === 'DELETE FROM mivet_pruebas WHERE equipo=?'), true);
  assert.equal(db.calls.some(x => x.sql.startsWith('DELETE FROM mivet_claves')), false);
  assert.equal(db.calls.some(x => x.sql.startsWith('INSERT INTO mivet_eventos')), true);
});

test('no borra demos asociadas a una licencia vigente', async () => {
  const db = database({ activeActivation: true });
  const response = await borrar(db, 'pruebas/ABCD-EFGH-IJKL-MNOP/eliminar');
  assert.equal(response.status, 409);
  assert.equal(db.calls.some(x => x.sql === 'DELETE FROM mivet_pruebas WHERE equipo=?'), false);
});

test('reiniciar una demo conserva el comportamiento existente', async () => {
  const db = database();
  const response = await borrar(db, 'pruebas/ABCD-EFGH-IJKL-MNOP');
  assert.equal(response.status, 200);
  assert.equal(db.calls.some(x => x.sql.startsWith('UPDATE mivet_pruebas SET inicio=')), true);
  assert.equal(db.calls.some(x => x.sql === 'DELETE FROM mivet_pruebas WHERE equipo=?'), false);
});