import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createD1 } from "./d1-shim.mjs";
import { onRequestGet as listarParametros, onRequestPost as crearOpcion } from "../functions/api/parametros/index.js";
import { onRequestDelete as quitarOpcion } from "../functions/api/parametros/opciones/[id].js";
import { onRequestGet as verElecciones, onRequestPut as marcarEleccion } from "../functions/api/trabajos/[id]/elecciones.js";
import { onRequestPost as crearTrabajo } from "../functions/api/trabajos/index.js";
import { informeDesdeSeleccion, pasosAbiertos } from "../public/js/flujo.js";
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
  await db.prepare("INSERT INTO clientes (nombre, creado_en) VALUES (?,?)").bind("Mirta Soto", "2026-10-31T15:00:00.000Z").run();
  return db;
}

function opcion(pasos, paso, nombre) {
  return pasos.find((p) => p.clave === paso).opciones.find((o) => o.nombre === nombre);
}

test("los pasos se abren uno detrás del otro", () => {
  assert.deepEqual(pasosAbiertos({ tipoMarcado: false, hechoMarcado: false, tieneLineas: false, cierreEstadoMarcado: false }), {
    tipo: true,
    hecho: false,
    cierre: false,
    informe: false,
  });
  assert.equal(pasosAbiertos({ tipoMarcado: true, hechoMarcado: false, tieneLineas: false, cierreEstadoMarcado: false }).hecho, true);
  assert.equal(pasosAbiertos({ tipoMarcado: true, hechoMarcado: false, tieneLineas: false, cierreEstadoMarcado: false }).cierre, false);
  const conDetalle = pasosAbiertos({ tipoMarcado: true, hechoMarcado: true, tieneLineas: true, cierreEstadoMarcado: false });
  assert.equal(conDetalle.cierre, true);
  assert.equal(conDetalle.informe, false);
  assert.equal(pasosAbiertos({ tipoMarcado: true, hechoMarcado: true, tieneLineas: true, cierreEstadoMarcado: true }).informe, true);
});

test("el informe arma solo las frases marcadas y el detalle", () => {
  const texto = informeDesdeSeleccion({
    nombre: "Mirta Soto",
    negocio: "Mis Pitutos Informáticos",
    frases: ["Se realizó la visita.", "Se realizó la visita.", "Se instaló el sistema.", "Se dejó listo."],
    nota: "En el escritorio del living.",
    incluirDetalle: true,
    items: [
      { cantidad: 1, descripcion: "Instalación de sistema", valor: 20000 },
      { cantidad: 1, descripcion: "RAM", valor: 15000 },
    ],
    total: 35000,
    linkUrl: "https://panel.example/seguimiento?t=abc",
  });
  assert.match(texto, /Hola Mirta/);
  assert.equal(texto.split("Se realizó la visita.").length, 2);
  assert.match(texto, /Se instaló el sistema/);
  assert.match(texto, /Se dejó listo/);
  assert.match(texto, /En el escritorio del living/);
  assert.match(texto, new RegExp(clp(35000).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(texto, /RAM/);
});

test("se puede agregar y quitar una opción, y el cierre es de a una", async () => {
  const db = await base();
  const creado = await (
    await crearTrabajo({
      request: post("https://panel.test/api/trabajos", { cliente_id: 1, tipo: "Instalación", descripcion: "Visita a Mirta" }),
      env: { DB: db },
    })
  ).json();
  const lista = await (await listarParametros({ env: { DB: db } })).json();
  assert.ok(opcion(lista.pasos, "tipo", "Upgrade"));
  assert.ok(opcion(lista.pasos, "tipo", "Cotización"));

  const nueva = await (
    await crearOpcion({
      request: post("https://panel.test/api/parametros", { paso: "hecho", nombre: "Se cambió la RAM", frase: "Se cambió la RAM." }),
      env: { DB: db },
    })
  ).json();
  assert.ok(nueva.id);

  const elec = await (await verElecciones({ env: { DB: db }, params: { id: String(creado.id) } })).json();
  const instalacion = opcion(lista.pasos, "tipo", "Instalación");
  assert.ok(elec.ids.includes(instalacion.id));

  const visita = opcion(lista.pasos, "hecho", "Se realizó la visita");
  const repuestos = opcion(lista.pasos, "hecho", "Se agregaron repuestos");
  await marcarEleccion({
    request: put("https://panel.test/api/trabajos/1/elecciones", { opcion_id: visita.id, marcada: true }),
    env: { DB: db },
    params: { id: "1" },
  });
  const ambas = await (
    await marcarEleccion({
      request: put("https://panel.test/api/trabajos/1/elecciones", { opcion_id: repuestos.id, marcada: true }),
      env: { DB: db },
      params: { id: "1" },
    })
  ).json();
  assert.ok(ambas.ids.includes(visita.id));
  assert.ok(ambas.ids.includes(repuestos.id));

  const sinFoto = opcion(lista.pasos, "cierre", "Sin foto");
  const conFoto = opcion(lista.pasos, "cierre", "Con foto");
  await marcarEleccion({
    request: put("https://panel.test/api/trabajos/1/elecciones", { opcion_id: sinFoto.id, marcada: true }),
    env: { DB: db },
    params: { id: "1" },
  });
  const fotos = await (
    await marcarEleccion({
      request: put("https://panel.test/api/trabajos/1/elecciones", { opcion_id: conFoto.id, marcada: true }),
      env: { DB: db },
      params: { id: "1" },
    })
  ).json();
  assert.ok(fotos.ids.includes(conFoto.id));
  assert.equal(fotos.ids.includes(sinFoto.id), false);

  const listo = opcion(lista.pasos, "cierre", "Está listo");
  const cerrado = await (
    await marcarEleccion({
      request: put("https://panel.test/api/trabajos/1/elecciones", { opcion_id: listo.id, marcada: true }),
      env: { DB: db },
      params: { id: "1" },
    })
  ).json();
  assert.equal(cerrado.trabajo.estado, "Listo");

  await quitarOpcion({ env: { DB: db }, params: { id: String(nueva.id) } });
  const luego = await (await listarParametros({ env: { DB: db } })).json();
  assert.equal(opcion(luego.pasos, "hecho", "Se cambió la RAM").activo, 0);
});
