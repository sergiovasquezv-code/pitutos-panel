import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const raiz = path.resolve(import.meta.dirname, "../..");
const csv = path.join(raiz, "lpyverse/export_items.csv");
const puerto = 8766;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const archivo = path.join(raiz, url === "/" ? "Convertir-Loyverse-a-MiPOS.html" : url);
  if (!archivo.startsWith(raiz) || !fs.existsSync(archivo)) {
    res.writeHead(404);
    res.end("no");
    return;
  }
  res.writeHead(200, { "Content-Type": archivo.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
  fs.createReadStream(archivo).pipe(res);
});

await new Promise((resolve) => server.listen(puerto, "127.0.0.1", resolve));

const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=9222",
  "--user-data-dir=/tmp/chrome-mipos-convertir",
  `http://127.0.0.1:${puerto}/`,
], { stdio: "ignore" });

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

let lista = [];
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch("http://127.0.0.1:9222/json/list");
    lista = await r.json();
    if (lista.some((p) => p.type === "page" && p.webSocketDebuggerUrl)) break;
  } catch { /* chrome todavía arranca */ }
  await esperar(250);
}
const pagina = lista.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
if (!pagina) {
  console.error("Chrome no abrió la página");
  chrome.kill();
  process.exit(1);
}

const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pendientes = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pendientes.has(msg.id)) {
    pendientes.get(msg.id)(msg);
    pendientes.delete(msg.id);
  }
});
function enviar(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pendientes.set(id, (msg) => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await enviar("Runtime.enable");
await enviar("DOM.enable");
await enviar("Page.enable");

let texto = "";
for (let i = 0; i < 40; i++) {
  const r = await enviar("Runtime.evaluate", {
    expression: "document.getElementById('salida').textContent",
    returnByValue: true,
  });
  texto = r.result.value;
  if (texto.startsWith("Listo")) break;
  await esperar(250);
}
if (!texto.startsWith("Listo")) {
  console.error("La página no quedó lista:", texto);
  chrome.kill();
  process.exit(1);
}
const boton = await enviar("Runtime.evaluate", {
  expression: "document.getElementById('ir').disabled",
  returnByValue: true,
});
if (boton.result.value) {
  console.error("El botón sigue deshabilitado");
  chrome.kill();
  process.exit(1);
}

const doc = await enviar("DOM.getDocument");
const nodo = await enviar("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#csv" });
await enviar("DOM.setFileInputFiles", { nodeId: nodo.nodeId, files: [csv] });
await enviar("Runtime.evaluate", {
  expression: `(() => {
    window.__escritos = {};
    function dir(prefix) {
      return {
        async getDirectoryHandle(nombre) { return dir(prefix + nombre + "/"); },
        async getFileHandle(nombre) {
          const clave = prefix + nombre;
          const slot = { data: null };
          window.__escritos[clave] = slot;
          return { async createWritable() { return { async write(d) { slot.data = d; }, async close() {} }; } };
        }
      };
    }
    window.showDirectoryPicker = async () => dir("");
  })()`,
});
await enviar("Runtime.evaluate", { expression: "document.getElementById('ir').click()" });

let final = "";
for (let i = 0; i < 40; i++) {
  const r = await enviar("Runtime.evaluate", {
    expression: "document.getElementById('salida').textContent",
    returnByValue: true,
  });
  final = r.result.value;
  if (final.startsWith("Listo.") || final.startsWith("No se pudo")) break;
  await esperar(250);
}
const chequeo = await enviar("Runtime.evaluate", {
  expression: `(async () => {
    const guardados = Object.keys(window.__escritos || {});
    const bytes = window.__escritos["mipos/mipos.db"] && window.__escritos["mipos/mipos.db"].data;
    if (!bytes) return { guardados, error: "no escribió mipos.db" };
    const sql = await initSqlJs({ wasmBinary: WASM });
    const db = new sql.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const n = db.exec("SELECT COUNT(*) FROM productos")[0].values[0][0];
    const aceite = db.exec("SELECT precio_venta, precio_costo FROM productos WHERE codigo='7802810012029'")[0].values[0];
    const negocio = db.exec("SELECT valor FROM config WHERE clave='negocio_nombre'")[0].values[0][0];
    return { guardados, n, aceite, negocio };
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("pantalla:", final);
console.log("chequeo:", JSON.stringify(chequeo.result.value));
const v = chequeo.result.value;
const ok = final.includes("carpetas lpyverse y mipos")
  && v.n === 3651
  && v.negocio === "Isadora"
  && v.aceite[0] === 3000
  && v.guardados.includes("lpyverse/loyverse.db")
  && v.guardados.includes("mipos/informe.json");
chrome.kill();
server.close();
if (!ok) process.exit(1);
console.log("el botón creó las dos carpetas y la base de MiPOS");
