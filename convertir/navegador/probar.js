const fs = require("fs");
const path = require("path");
const initSqlJs = require("./sql-wasm.js");
const { convertir, sha256, pbkdf2Sha256, hex } = require("./motor.js");

function igual(nombre, obtenido, esperado) {
  if (obtenido !== esperado) {
    console.error(nombre, "\n obtenido ", obtenido, "\n esperado ", esperado);
    process.exit(1);
  }
}

igual("sha256", hex(sha256(new TextEncoder().encode("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
igual(
  "pbkdf2",
  hex(pbkdf2Sha256("1234", new Uint8Array(16), 1000)),
  "585f57603dc756173a0ec7cb8998fabd1030e9d4ac6527327b685c1d4ff22a5c"
);
igual(
  "pbkdf2-2",
  hex(pbkdf2Sha256("1234", Uint8Array.from(Buffer.from("270047b25e2082236a75abe98fc4e4aa", "hex")), 2)),
  "ddd46c6db4b2da34ea346f8f677310e46e7245fc93288ca196a411656dbafd81"
);

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, "sql-wasm.wasm")) });
  const csv = fs.readFileSync(path.join(__dirname, "../../lpyverse/export_items.csv"), "utf8");
  const esquema = fs.readFileSync(path.join(__dirname, "../mipos_esquema.sql"), "utf8");
  const triggers = fs.readFileSync(path.join(__dirname, "../mipos_triggers.sql"), "utf8");
  const t0 = Date.now();
  const resultado = await convertir(SQL, csv, "export_items.csv", { esquema, triggers });
  console.log("convertido en", Date.now() - t0, "ms", resultado.informe.productos, "productos");

  const py = new SQL.Database(fs.readFileSync(path.join(__dirname, "../../mipos/mipos.db")));
  const js = new SQL.Database(resultado.mipos);
  const consulta = `SELECT p.codigo, p.nombre, p.precio_costo, p.precio_venta, p.stock, p.stock_minimo,
      p.granel, p.activo, IFNULL(c.nombre, '')
    FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id ORDER BY p.codigo`;
  const a = py.exec(consulta)[0].values;
  const b = js.exec(consulta)[0].values;
  if (a.length !== b.length) {
    console.error("cantidad", a.length, b.length);
    process.exit(1);
  }
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    const izq = a[i].map((v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)).join("|");
    const der = b[i].map((v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)).join("|");
    if (izq !== der) {
      if (diffs < 8) console.error("fila", a[i], "!=", b[i]);
      diffs++;
    }
  }
  if (diffs) {
    console.error("diferencias", diffs);
    process.exit(1);
  }
  const mov = "SELECT producto_id, tipo, cantidad, stock_antes, stock_despues, costo_unitario, referencia, motivo FROM movimientos_stock ORDER BY producto_id";
  const ma = JSON.stringify(py.exec(mov)[0].values);
  const mb = JSON.stringify(js.exec(mov)[0].values);
  if (ma !== mb) {
    console.error("kárdex distinto");
    process.exit(1);
  }
  const clave = js.exec("SELECT clave_hash FROM usuarios WHERE usuario='admin'")[0].values[0][0];
  if (!/^pbkdf2\$200000\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(clave)) {
    console.error("hash", clave);
    process.exit(1);
  }
  console.log("la base del navegador calza con la de MiPOS ya convertida");
  resultado.cerrar();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
