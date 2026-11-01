#!/usr/bin/env python3
"""Arma el HTML único que convierte Loyverse a MiPOS sin Python en el otro equipo."""

import base64
from pathlib import Path

AQUI = Path(__file__).resolve().parent
DESTINO = AQUI.parents[1] / "Convertir-Loyverse-a-MiPOS.html"

PAGINA = r"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Convertir Loyverse a MiPOS</title>
<style>
  body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f4f7f6; color: #14221c; }
  main { max-width: 680px; margin: 48px auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 8px 30px rgba(20,34,28,.08); }
  h1 { margin: 0 0 8px; font-size: 28px; }
  p { line-height: 1.5; color: #3d5248; }
  label { display: block; font-weight: 700; margin: 22px 0 8px; }
  input[type=file] { display: block; }
  button { margin-top: 22px; background: #14804a; color: white; border: 0; border-radius: 12px; font-size: 18px; font-weight: 700; padding: 14px 22px; cursor: pointer; }
  button:disabled { background: #9bb5a8; cursor: wait; }
  pre { white-space: pre-wrap; background: #f4f7f6; border-radius: 12px; padding: 16px; min-height: 4em; }
</style>
</head>
<body>
<main>
  <h1>Convertir artículos de Loyverse a MiPOS</h1>
  <p>No hace falta instalar Python. Abre este archivo con doble clic en Chrome o Edge, elige el CSV y aprieta el botón. El navegador pide permiso y crea las carpetas <b>lpyverse</b> y <b>mipos</b> donde tú indiques.</p>
  <label for="csv">Archivo export_items.csv</label>
  <input id="csv" type="file" accept=".csv,text/csv">
  <button id="ir" type="button" disabled>Convertir y crear las carpetas</button>
  <pre id="salida">Preparando el conversor…</pre>
</main>
<script>
__SQLJS__
</script>
<script>
const ESQUEMA = __ESQUEMA__;
const TRIGGERS = __TRIGGERS__;
const WASM = Uint8Array.from(atob("__WASM__"), c => c.charCodeAt(0));
</script>
<script>
__MOTOR__
</script>
<script>
const salida = document.getElementById("salida");
const boton = document.getElementById("ir");
const csv = document.getElementById("csv");
let SQL = null;

initSqlJs({ wasmBinary: WASM }).then((listo) => {
  SQL = listo;
  salida.textContent = "Listo. Elige el CSV de Loyverse y aprieta el botón.";
  boton.disabled = false;
}).catch((e) => {
  salida.textContent = "No pude preparar el conversor: " + e;
});

function descargar(nombre, datos, tipo) {
  const blob = new Blob([datos], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function escribir(carpeta, nombre, datos) {
  const archivo = await carpeta.getFileHandle(nombre, { create: true });
  const escritor = await archivo.createWritable();
  await escritor.write(datos);
  await escritor.close();
}

function textoInforme(inf, donde) {
  return [
    "Listo.",
    "Tienda: " + inf.tienda,
    "Productos: " + inf.productos,
    "Con código de barras: " + inf.con_codigo_de_barras,
    "Sin barra, usan el REF: " + inf.con_ref_porque_no_hay_barra,
    "Barra repetida, usan el REF: " + inf.con_ref_porque_la_barra_estaba_repetida,
    "Precio variable dejado en $0: " + inf.precio_variable_en_cero,
    "Para entrar a MiPOS: usuario admin, clave 1234.",
    donde
  ].join("\n");
}

boton.addEventListener("click", async () => {
  const archivo = csv.files && csv.files[0];
  if (!archivo) {
    salida.textContent = "Primero elige el CSV.";
    return;
  }
  boton.disabled = true;
  let carpeta = null;
  if (window.showDirectoryPicker) {
    try {
      carpeta = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (e) {
      if (e && e.name === "AbortError") {
        salida.textContent = "Cancelaste la carpeta. No se escribió nada.";
        boton.disabled = false;
        return;
      }
      carpeta = null;
    }
  }
  salida.textContent = "Convirtiendo " + archivo.name + "…";
  try {
    const texto = await archivo.text();
    const resultado = await Convertidor.convertir(SQL, texto, archivo.name, { esquema: ESQUEMA, triggers: TRIGGERS });
    const informeJson = JSON.stringify(resultado.informe, null, 2);
    if (carpeta) {
      const lpy = await carpeta.getDirectoryHandle("lpyverse", { create: true });
      const mip = await carpeta.getDirectoryHandle("mipos", { create: true });
      await escribir(lpy, "export_items.csv", texto);
      await escribir(lpy, "loyverse.db", resultado.loyverse);
      await escribir(mip, "mipos.db", resultado.mipos);
      await escribir(mip, "informe.json", informeJson);
      salida.textContent = textoInforme(resultado.informe, "Quedó en las carpetas lpyverse y mipos, dentro de la carpeta que elegiste. Copia mipos/mipos.db a la carpeta de datos de MiPOS.");
    } else {
      descargar("loyverse.db", resultado.loyverse, "application/x-sqlite3");
      descargar("mipos.db", resultado.mipos, "application/x-sqlite3");
      descargar("informe.json", informeJson, "application/json");
      salida.textContent = textoInforme(resultado.informe, "Este navegador no pudo crear carpetas. Se descargaron loyverse.db, mipos.db e informe.json: pon el primero en una carpeta lpyverse y los otros dos en una carpeta mipos.");
    }
    resultado.cerrar();
  } catch (e) {
    salida.textContent = "No se pudo convertir: " + (e && e.message ? e.message : e);
  }
  boton.disabled = false;
});
</script>
</body>
</html>
"""


def main():
    wasm = base64.b64encode((AQUI / "sql-wasm.wasm").read_bytes()).decode()
    sqljs = (AQUI / "sql-wasm.js").read_text(encoding="utf-8")
    motor = (AQUI / "motor.js").read_text(encoding="utf-8")
    esquema = (AQUI.parent / "mipos_esquema.sql").read_text(encoding="utf-8")
    triggers = (AQUI.parent / "mipos_triggers.sql").read_text(encoding="utf-8")
    html = (
        PAGINA.replace("__WASM__", wasm)
        .replace("__SQLJS__", sqljs)
        .replace("__MOTOR__", motor)
        .replace("__ESQUEMA__", json_js(esquema))
        .replace("__TRIGGERS__", json_js(triggers))
    )
    DESTINO.write_text(html, encoding="utf-8")
    print(DESTINO, DESTINO.stat().st_size)


def json_js(texto):
    import json
    return json.dumps(texto, ensure_ascii=False)


if __name__ == "__main__":
    main()
