import { esCotizacion } from "./casos.js";

// Opciones de cada paso del caso. Se pueden agregar y quitar desde el panel.
// grupo "unico" = solo una a la vez (el tipo de trabajo).
// grupo "foto" | "garantia" | "estado" = alternativas de cierre.
// sin grupo = se pueden marcar varias (lo que se hizo).

export const PASOS_CLAVE = ["tipo", "hecho", "cierre"];

const PASOS_INICIALES = [
  { clave: "tipo", orden: 1, nombre: "Qué es" },
  { clave: "hecho", orden: 2, nombre: "Qué se hizo" },
  { clave: "cierre", orden: 3, nombre: "Cómo cerrar" },
];

const OPCIONES_INICIALES = [
  ["tipo", 1, "Cotización", "Te dejamos la cotización.", "unico"],
  ["tipo", 2, "Reparación", "Se realizó la reparación.", "unico"],
  ["tipo", 3, "Upgrade", "Se realizó un upgrade.", "unico"],
  ["tipo", 4, "Instalación", "Se realizó la instalación.", "unico"],
  ["tipo", 5, "Venta", "Se realizó la venta.", "unico"],
  ["tipo", 6, "Visita", "Se realizó la visita.", "unico"],
  ["tipo", 7, "Programación", "Se realizó la programación.", "unico"],
  ["tipo", 8, "Soporte técnico", "Se realizó el soporte.", "unico"],
  ["tipo", 9, "Mantención", "Se realizó la mantención.", "unico"],
  ["tipo", 10, "Garantía", "Se revisó la garantía.", "unico"],
  ["tipo", 11, "Otro", "", "unico"],
  ["hecho", 1, "Se realizó la visita", "Se realizó la visita.", null],
  ["hecho", 2, "Se instaló el sistema", "Se instaló el sistema.", null],
  ["hecho", 3, "Se agregaron repuestos", "Se agregaron repuestos.", null],
  ["hecho", 4, "Se configuró", "Se configuró.", null],
  ["hecho", 5, "Se programó", "Se programó.", null],
  ["cierre", 1, "Sin foto", "", "foto"],
  ["cierre", 2, "Con foto", "", "foto"],
  ["cierre", 3, "Sin garantía", "", "garantia"],
  ["cierre", 4, "Con garantía", "Quedó con garantía.", "garantia"],
  ["cierre", 5, "Está listo", "Se dejó listo.", "estado"],
  ["cierre", 6, "Ya está entregado", "Ya quedó entregado.", "estado"],
];

const listas = new WeakSet();

export async function asegurarParametros(db) {
  if (listas.has(db)) return;
  // Una sentencia por llamada: el D1 local parte exec() por líneas y deja
  // el CREATE a medias.
  const tablas = [
    `CREATE TABLE IF NOT EXISTS parametros_paso (
      clave TEXT PRIMARY KEY,
      orden INTEGER NOT NULL,
      nombre TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS parametros_opcion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paso TEXT NOT NULL,
      orden INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      frase TEXT,
      grupo TEXT,
      activo INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS trabajo_eleccion (
      trabajo_id INTEGER NOT NULL,
      opcion_id INTEGER NOT NULL,
      PRIMARY KEY (trabajo_id, opcion_id)
    )`,
  ];
  for (const sql of tablas) await db.prepare(sql).run();
  const pasos = await db.prepare("SELECT clave FROM parametros_paso").all();
  if ((pasos.results || []).length === 0) {
    for (const p of PASOS_INICIALES) {
      await db
        .prepare("INSERT INTO parametros_paso (clave, orden, nombre) VALUES (?,?,?)")
        .bind(p.clave, p.orden, p.nombre)
        .run();
    }
  }
  const cuenta = await db.prepare("SELECT COUNT(*) AS n FROM parametros_opcion").first();
  if (!Number(cuenta && cuenta.n)) {
    for (const [paso, orden, nombre, frase, grupo] of OPCIONES_INICIALES) {
      await db
        .prepare(
          "INSERT INTO parametros_opcion (paso, orden, nombre, frase, grupo, activo) VALUES (?,?,?,?,?,1)"
        )
        .bind(paso, orden, nombre, frase, grupo)
        .run();
    }
  }
  listas.add(db);
}

export async function listarParametros(db) {
  await asegurarParametros(db);
  const pasos = (await db.prepare("SELECT * FROM parametros_paso ORDER BY orden, clave").all()).results;
  const opciones = (
    await db.prepare("SELECT * FROM parametros_opcion ORDER BY paso, orden, id").all()
  ).results;
  return pasos.map((p) => ({
    ...p,
    opciones: opciones.filter((o) => o.paso === p.clave),
  }));
}

export function estadoPorOpcion(opcion) {
  if (!opcion || opcion.grupo !== "estado") return null;
  return /entreg/i.test(opcion.nombre) ? "Entregado" : "Listo";
}

export async function aplicarEleccion(db, trabajo, opcion, marcada) {
  if (marcada) {
    if (opcion.grupo) {
      await db
        .prepare(
          `DELETE FROM trabajo_eleccion
           WHERE trabajo_id = ?
             AND opcion_id IN (SELECT id FROM parametros_opcion WHERE paso = ? AND grupo = ?)`
        )
        .bind(trabajo.id, opcion.paso, opcion.grupo)
        .run();
    }
    await db
      .prepare("INSERT OR IGNORE INTO trabajo_eleccion (trabajo_id, opcion_id) VALUES (?,?)")
      .bind(trabajo.id, opcion.id)
      .run();
  } else {
    await db
      .prepare("DELETE FROM trabajo_eleccion WHERE trabajo_id = ? AND opcion_id = ?")
      .bind(trabajo.id, opcion.id)
      .run();
  }

  if (!marcada) return;

  if (opcion.paso === "tipo") {
    const esCotiz = opcion.nombre.trim().toLowerCase() === "cotización";
    const yaCerrado = trabajo.estado === "Listo" || trabajo.estado === "Entregado";
    let estado = trabajo.estado;
    let mostrar = trabajo.mostrar_detalle_cliente ? 1 : 0;
    if (esCotiz && !yaCerrado) {
      estado = "Cotización";
      mostrar = 0;
    } else if (!esCotiz && esCotizacion(trabajo.estado)) {
      estado = "En curso";
      mostrar = 1;
    } else if (!esCotiz) {
      mostrar = 1;
    }
    await db
      .prepare("UPDATE trabajos SET tipo = ?, estado = ?, mostrar_detalle_cliente = ? WHERE id = ?")
      .bind(opcion.nombre, estado, mostrar, trabajo.id)
      .run();
  }

  const estadoCierre = estadoPorOpcion(opcion);
  if (estadoCierre) {
    await db
      .prepare("UPDATE trabajos SET estado = ?, mostrar_detalle_cliente = 1 WHERE id = ?")
      .bind(estadoCierre, trabajo.id)
      .run();
  }
}

const LISTO = new Set(["Listo", "Equipo listo", "Entrega fijada"]);

export async function eleccionesDeTrabajo(db, trabajo) {
  await asegurarParametros(db);
  const opciones = (await db.prepare("SELECT * FROM parametros_opcion").all()).results;
  const actuales = (
    await db.prepare("SELECT opcion_id FROM trabajo_eleccion WHERE trabajo_id = ?").bind(trabajo.id).all()
  ).results.map((r) => r.opcion_id);

  const tieneTipo = opciones.some((o) => o.paso === "tipo" && actuales.includes(o.id));
  if (!tieneTipo) {
    const match = opciones.find(
      (o) => o.paso === "tipo" && o.activo && o.nombre.toLowerCase() === String(trabajo.tipo || "").toLowerCase()
    );
    if (match) {
      await db
        .prepare("INSERT OR IGNORE INTO trabajo_eleccion (trabajo_id, opcion_id) VALUES (?,?)")
        .bind(trabajo.id, match.id)
        .run();
      actuales.push(match.id);
    }
  }

  const tieneEstado = opciones.some((o) => o.grupo === "estado" && actuales.includes(o.id));
  if (!tieneEstado) {
    const nombre = trabajo.estado === "Entregado" ? "Ya está entregado" : LISTO.has(trabajo.estado) ? "Está listo" : "";
    const match = opciones.find((o) => o.activo && o.nombre === nombre);
    if (match) {
      await db
        .prepare("INSERT OR IGNORE INTO trabajo_eleccion (trabajo_id, opcion_id) VALUES (?,?)")
        .bind(trabajo.id, match.id)
        .run();
      actuales.push(match.id);
    }
  }

  return actuales;
}
