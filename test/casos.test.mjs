import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createD1 } from "./d1-shim.mjs";
import { onRequestGet as listarTrabajos, onRequestPost as crearTrabajo } from "../functions/api/trabajos/index.js";
import { onRequestGet as verTrabajo, onRequestPut } from "../functions/api/trabajos/[id].js";
import { onRequestGet as listarItems, onRequestPost as crearItem } from "../functions/api/trabajos/[id]/items/index.js";
import { onRequestDelete as borrarItem } from "../functions/api/trabajos/[id]/items/[itemId].js";
import { pasoDe as pasoServidor } from "../functions/_lib/casos.js";
import { pasoDe as pasoPantalla, mensajeCaso } from "../public/js/caso.js";
import { clp } from "../public/js/format.js";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

function post(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function put(url, body) {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function base() {
  const db = createD1(schema);
  await db.prepare("INSERT INTO clientes (nombre, creado_en) VALUES (?, ?)").bind("Ana Pérez", "2026-10-01T15:00:00.000Z").run();
  return db;
}

async function leer(db, id) {
  const res = await verTrabajo({ env: { DB: db }, params: { id: String(id) } });
  return (await res.json()).trabajo;
}

test("el paso de la pantalla y el del servidor coinciden", () => {
  for (const estado of ["Cotización", "Pendiente", "Demostración", "Recibido", "En preparación", "En curso", "Esperando cliente", "Cliente no ubicado", "Equipo listo", "Entrega fijada", "Listo", "Entregado", "raro"]) {
    assert.equal(pasoPantalla(estado), pasoServidor(estado), estado);
  }
  assert.equal(pasoServidor("Recibido"), "En curso");
  assert.equal(pasoServidor("Equipo listo"), "Listo");
  assert.equal(pasoServidor("Demostración"), "Cotización");
});

test("el aviso de cotización no habla de saldo y el de un caso en curso sí", () => {
  const baseMsg = {
    nombre: "Ana Pérez",
    negocio: "Mis Pitutos Informáticos",
    tipo: "Reparación",
    descripcion: "Notebook no enciende",
    total: 20000,
    abonado: 5000,
    saldo: 15000,
    linkUrl: "https://panel.example/seguimiento?t=abc",
  };
  const cotizacion = mensajeCaso({ ...baseMsg, paso: "Cotización" });
  assert.match(cotizacion, /Hola Ana, te escribimos de Mis Pitutos Informáticos/);
  assert.match(cotizacion, new RegExp(`Cotización: ${clp(20000).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.doesNotMatch(cotizacion, /Saldo/);
  assert.match(cotizacion, /seguimiento\?t=abc/);

  const enCurso = mensajeCaso({ ...baseMsg, paso: "En curso" });
  assert.match(enCurso, /está en curso/);
  assert.match(enCurso, /Abonado/);
  assert.match(enCurso, /Saldo/);
  assert.doesNotMatch(enCurso, /Cotización:/);
});

test("un trabajo nuevo nace en cotización y el monto inicial es una línea", async () => {
  const db = await base();
  const creado = await (
    await crearTrabajo({
      request: post("https://panel.test/api/trabajos", {
        cliente_id: 1,
        tipo: "Reparación",
        descripcion: "Cambio de disco",
        monto: 45000,
      }),
      env: { DB: db },
    })
  ).json();
  const trabajo = await leer(db, creado.id);
  assert.equal(trabajo.estado, "Cotización");
  assert.equal(trabajo.monto, 45000);
  assert.equal(trabajo.mostrar_detalle_cliente, 0);
  const items = (await (await listarItems({ env: { DB: db }, params: { id: String(creado.id) } })).json()).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].valor, 45000);
  assert.equal(items[0].cantidad, 1);
  assert.equal(items[0].descripcion, "Cambio de disco");
});

test("la cantidad por el precio arma el total y borrar una línea lo recalcula", async () => {
  const db = await base();
  const creado = await (
    await crearTrabajo({
      request: post("https://panel.test/api/trabajos", {
        cliente_id: 1,
        descripcion: "Venta de teclados",
      }),
      env: { DB: db },
    })
  ).json();
  const id = String(creado.id);
  const linea = await (
    await crearItem({
      request: post(`https://panel.test/api/trabajos/${id}/items`, {
        tipo: "producto",
        descripcion: "Teclado",
        cantidad: 2,
        precio_unitario: 15000,
      }),
      env: { DB: db },
      params: { id },
    })
  ).json();
  assert.equal(linea.monto, 30000);
  const segunda = await (
    await crearItem({
      request: post(`https://panel.test/api/trabajos/${id}/items`, {
        tipo: "servicio",
        descripcion: "Instalación",
        cantidad: 1,
        precio_unitario: 5000,
      }),
      env: { DB: db },
      params: { id },
    })
  ).json();
  assert.equal(segunda.monto, 35000);

  const items = (await (await listarItems({ env: { DB: db }, params: { id } })).json()).items;
  assert.equal(items[0].cantidad, 2);
  assert.equal(items[0].valor, 30000);

  const borrado = await (
    await borrarItem({ env: { DB: db }, params: { id, itemId: String(items[0].id) } })
  ).json();
  assert.equal(borrado.monto, 5000);
  assert.equal((await leer(db, id)).monto, 5000);

  await onRequestPut({
    request: put(`https://panel.test/api/trabajos/${id}`, { monto: 999999, estado: "En curso", tipo: "Venta", descripcion: "Venta de teclados" }),
    env: { DB: db },
    params: { id },
  });
  assert.equal((await leer(db, id)).monto, 5000);
});

test("la primera línea conserva el monto que ya estaba escrito a mano", async () => {
  const db = await base();
  await db
    .prepare(
      "INSERT INTO trabajos (cliente_id, tipo, descripcion, estado, monto, fecha_creacion) VALUES (1, 'Soporte técnico', 'Antiguo', 'Recibido', 80000, '2026-10-02T15:00:00.000Z')"
    )
    .run();
  const res = await (
    await crearItem({
      request: post("https://panel.test/api/trabajos/1/items", {
        tipo: "repuesto",
        descripcion: "Disco",
        valor: 20000,
      }),
      env: { DB: db },
      params: { id: "1" },
    })
  ).json();
  assert.equal(res.monto, 100000);
  const items = (await (await listarItems({ env: { DB: db }, params: { id: "1" } })).json()).items;
  assert.equal(items.length, 2);
  assert.equal(items[0].descripcion, "Según lo acordado");
  assert.equal(items[0].valor, 80000);
  assert.equal(items[1].cantidad, 1);
  assert.equal(items[1].valor, 20000);
});

test("salir de cotización muestra el detalle y el filtro En curso incluye lo recibido", async () => {
  const db = await base();
  const creado = await (
    await crearTrabajo({
      request: post("https://panel.test/api/trabajos", { cliente_id: 1, descripcion: "Cotizar cámara" }),
      env: { DB: db },
    })
  ).json();
  await onRequestPut({
    request: put("https://panel.test/api/trabajos/1", {
      estado: "En curso",
      mostrar_detalle_cliente: false,
      tipo: "Instalación",
      descripcion: "Cotizar cámara",
    }),
    env: { DB: db },
    params: { id: String(creado.id) },
  });
  const trabajo = await leer(db, creado.id);
  assert.equal(trabajo.estado, "En curso");
  assert.equal(trabajo.mostrar_detalle_cliente, 1);

  await db
    .prepare(
      "INSERT INTO trabajos (cliente_id, tipo, descripcion, estado, monto, fecha_creacion) VALUES (1, 'Programación', 'Legado', 'Recibido', 0, '2026-10-03T15:00:00.000Z')"
    )
    .run();
  const lista = await (
    await listarTrabajos({
      request: new Request("https://panel.test/api/trabajos?estado=En%20curso"),
      env: { DB: db },
    })
  ).json();
  const estados = lista.trabajos.map((t) => t.estado).sort();
  assert.deepEqual(estados, ["En curso", "Recibido"]);
});

test("lo realizado se guarda aparte del reclamo y una base vieja crea la columna", async () => {
  const sinRealizado = schema.replace(
    "\n    -- Lo que se hizo, en palabras. Va al informe. No es el reclamo inicial.\n    realizado TEXT,",
    ""
  );
  assert.equal(sinRealizado.includes("realizado TEXT"), false);
  const db = createD1(sinRealizado);
  await db.prepare("INSERT INTO clientes (nombre, creado_en) VALUES (?, ?)").bind("Mirta Librería", "2026-10-31T15:00:00.000Z").run();
  await db
    .prepare(
      "INSERT INTO trabajos (cliente_id, tipo, descripcion, estado, monto, fecha_creacion) VALUES (1, 'Soporte técnico', ?, 'Entregado', 0, '2026-10-31T15:00:00.000Z')"
    )
    .bind("El cliente reporta fallas en el funcionamiento del punto de venta (POS).")
    .run();

  await onRequestPut({
    request: put("https://panel.test/api/trabajos/1", {
      tipo: "Soporte técnico",
      estado: "Entregado",
      descripcion: "El cliente reporta fallas en el funcionamiento del punto de venta (POS).",
      realizado: "Se agregó una memoria RAM Kingston frente a la Srta. Gabriela Moyano y se revisó el punto de venta.",
      notas: "interno",
      mostrar_detalle_cliente: true,
    }),
    env: { DB: db },
    params: { id: "1" },
  });
  const guardado = await leer(db, 1);
  assert.equal(guardado.descripcion, "El cliente reporta fallas en el funcionamiento del punto de venta (POS).");
  assert.equal(guardado.realizado, "Se agregó una memoria RAM Kingston frente a la Srta. Gabriela Moyano y se revisó el punto de venta.");
  assert.equal(guardado.notas, "interno");

  await onRequestPut({
    request: put("https://panel.test/api/trabajos/1", {
      tipo: "Soporte técnico",
      estado: "Entregado",
      descripcion: "El cliente reporta fallas en el funcionamiento del punto de venta (POS).",
      mostrar_detalle_cliente: true,
    }),
    env: { DB: db },
    params: { id: "1" },
  });
  assert.equal(
    (await leer(db, 1)).realizado,
    "Se agregó una memoria RAM Kingston frente a la Srta. Gabriela Moyano y se revisó el punto de venta."
  );
});

test("en una base sin la columna cantidad, la primera línea la crea", async () => {
  const sinCantidad = schema.replace("\n    cantidad INTEGER NOT NULL DEFAULT 1,", "");
  assert.equal(sinCantidad.includes("cantidad INTEGER"), false);
  const db = createD1(sinCantidad);
  await db.prepare("INSERT INTO clientes (nombre, creado_en) VALUES (?, ?)").bind("Ana Pérez", "2026-10-01T15:00:00.000Z").run();
  await db
    .prepare(
      "INSERT INTO trabajos (cliente_id, tipo, descripcion, estado, monto, fecha_creacion) VALUES (1, 'Venta', 'Mouse', 'Cotización', 0, '2026-10-04T15:00:00.000Z')"
    )
    .run();
  const res = await (
    await crearItem({
      request: post("https://panel.test/api/trabajos/1/items", {
        tipo: "producto",
        descripcion: "Mouse",
        cantidad: 3,
        precio_unitario: 4000,
      }),
      env: { DB: db },
      params: { id: "1" },
    })
  ).json();
  assert.equal(res.monto, 12000);
  const columnas = (await db.prepare("PRAGMA table_info(items_trabajo)").all()).results.map((c) => c.name);
  assert.ok(columnas.includes("cantidad"));
  const item = await db.prepare("SELECT cantidad, valor FROM items_trabajo WHERE id = ?").bind(res.id).first();
  assert.equal(item.cantidad, 3);
  assert.equal(item.valor, 12000);
});
