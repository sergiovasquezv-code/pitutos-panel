#!/usr/bin/env python3
"""Convierte un export de artículos de Loyverse (export_items.csv) a las bases
de lpyverse/ y mipos/.

La base de mipos/ es el mismo SQLite que abre MiPOS 4.0.92 (mipos.db): mismas
tablas, columnas agregadas por migración, triggers e índices. El código de
cada producto queda en `productos.codigo`, que es lo que lee el lector de
barras.

Uso:
  python3 convertir/convertir.py                  # convierte ya
  python3 convertir/convertir.py --boton          # página con el botón
  python3 convertir/convertir.py ruta/al.csv
"""

from __future__ import annotations

import csv
import hashlib
import json
import secrets
import sqlite3
import sys
from collections import Counter
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent.parent
DIR_LOYVERSE = RAIZ / "lpyverse"
DIR_MIPOS = RAIZ / "mipos"
ESQUEMA = Path(__file__).with_name("mipos_esquema.sql").read_text(encoding="utf-8")
TRIGGERS = Path(__file__).with_name("mipos_triggers.sql").read_text(encoding="utf-8")
ZONA = ZoneInfo("America/Santiago")
VERSION = "4.0.92"
COSTO_PLACEHOLDER = 10_000_000

# Mismas columnas que agrega app.db._migrar de MiPOS 4.0.92 si faltan.
MIGRACIONES = {
    "ventas": (
        ("anulada_por", "INTEGER REFERENCES usuarios(id)"),
        ("autorizada_por", "INTEGER REFERENCES usuarios(id)"),
        ("anulada_en", "TEXT"),
        ("motivo_anulacion", "TEXT"),
        ("cliente_id", "INTEGER REFERENCES clientes(id)"),
    ),
    "caja_sesiones": (
        ("terminal_id", "INTEGER REFERENCES terminales(id)"),
        ("equipo_id", "TEXT"),
    ),
    "productos": (
        ("plu", "TEXT"),
        ("precio_cambiado_en", "TEXT"),
        ("catalogo_base", "INTEGER NOT NULL DEFAULT 0"),
    ),
    "usuarios": (("permisos", "TEXT NOT NULL DEFAULT '{}'"),),
    "clientes": (
        ("giro", "TEXT"),
        ("comuna", "TEXT"),
        ("email", "TEXT"),
    ),
    "venta_items": (
        ("promo", "TEXT"),
        ("combo_componentes", "TEXT NOT NULL DEFAULT '[]'"),
    ),
}

DEFAULT_CONFIG = {
    "negocio_nombre": "Mi Almacén",
    "negocio_rut": "",
    "negocio_direccion": "",
    "negocio_telefono": "",
    "transferencia_imprimir": "0",
    "transferencia_pago": "0",
    "transferencia_titular": "",
    "transferencia_rut": "",
    "transferencia_banco": "",
    "transferencia_tipo_cuenta": "",
    "transferencia_numero": "",
    "transferencia_email": "",
    "ticket_pie": "¡Gracias por su compra!",
    "ticket_ancho": "80",
    "ticket_auto_imprimir": "1",
    "cajon_abrir_efectivo": "1",
    "impresora_modo": "ninguna",
    "impresora_nombre": "",
    "impresora_ip": "",
    "impresora_puerto": "9100",
    "redondeo_efectivo": "1",
    "iva_activo": "0",
    "iva_tasa": "19",
    "vencimiento_aviso_dias": "15",
    "respaldo_intervalo_min": "60",
    "respaldo_copias": "48",
    "respaldo_remoto": "",
    "rclone_ruta": "",
    "dte_activo": "0",
    "dte_proveedor": "simulado",
    "dte_tipo": "39",
    "dte_rut_emisor": "",
    "dte_razon_social": "",
    "dte_giro": "",
    "dte_direccion": "",
    "dte_comuna": "",
    "dte_resolucion_num": "",
    "dte_resolucion_fecha": "",
    "dte_timeout": "8",
    "dte_voucher_tarjeta": "0",
    "dte_imprimir_timbre": "1",
    "dte_libredte_url": "https://libredte.cl",
    "dte_libredte_hash": "",
    "dte_gen_url": "",
    "dte_gen_header": "apikey",
    "dte_gen_clave": "",
    "dte_gen_envolver": "dte",
    "dte_gen_extra": "",
    "dte_gen_ruta_folio": "FOLIO",
    "dte_gen_ruta_timbre": "TIMBRE",
    "dte_gen_ruta_pdf": "PDF",
    "dte_acteco": "",
    "balanza_activa": "0",
    "balanza_prefijo": "2",
    "balanza_largo_plu": "5",
    "balanza_tipo": "precio",
    "telegram_token": "",
    "telegram_chats": "[]",
    "telegram_resumen_hora": "21:30",
    "telegram_avisos": "1",
    "actualizacion_auto": "1",
}

CAJA_CONFIG = {
    "impresora_modo": "ninguna",
    "impresora_nombre": "",
    "impresora_ip": "",
    "impresora_puerto": "9100",
    "ticket_ancho": "80",
    "ticket_auto_imprimir": "1",
    "cajon_abrir_efectivo": "1",
}

COLUMNAS_PRODUCTO = (
    "id", "codigo", "nombre", "categoria_id", "precio_costo", "precio_venta",
    "stock", "stock_minimo", "granel", "activo", "creado", "actualizado",
    "plu", "precio_cambiado_en", "catalogo_base",
)


def ahora_santiago() -> str:
    return datetime.now(ZONA).strftime("%Y-%m-%dT%H:%M:%S")


def hash_clave(clave: str) -> str:
    """Mismo formato que MiPOS: pbkdf2$iteraciones$sal$hex."""
    sal = secrets.token_bytes(16)
    it = 200_000
    digest = hashlib.pbkdf2_hmac("sha256", clave.encode(), sal, it).hex()
    return f"pbkdf2${it}${sal.hex()}${digest}"


def pesos(valor: float) -> int:
    return int(Decimal(str(valor)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def stock_real(texto: str) -> float:
    if texto is None or str(texto).strip() == "":
        return 0.0
    return round(float(str(texto).strip().replace(",", ".")), 3)


def si_no(texto: str) -> int:
    return 1 if str(texto or "").strip().upper() in {"Y", "SI", "S", "1", "TRUE"} else 0


def buscar_csv(explicito: str | None) -> Path:
    if explicito:
        ruta = Path(explicito).expanduser().resolve()
        if not ruta.is_file():
            raise SystemExit(f"No encontré el CSV: {ruta}")
        return ruta
    candidatos = sorted(DIR_LOYVERSE.glob("export_items*.csv"))
    if candidatos:
        return candidatos[0]
    subidos = sorted(Path("/home/ubuntu/.cursor/projects/workspace/uploads").glob("export_items*.csv"))
    if subidos:
        return subidos[0]
    raise SystemExit(
        "Falta el CSV. Déjalo en lpyverse/export_items.csv o pásale la ruta: "
        "python3 convertir/convertir.py ruta/export_items.csv"
    )


def columna_tienda(nombres: list[str], prefijo: str) -> str | None:
    for nombre in nombres:
        if nombre.startswith(prefijo + " [") and nombre.endswith("]"):
            return nombre
    return None


def leer_loyverse(ruta: Path) -> tuple[str, list[dict]]:
    with ruta.open(newline="", encoding="utf-8-sig") as archivo:
        lector = csv.DictReader(archivo)
        nombres = lector.fieldnames or []
        precio = columna_tienda(nombres, "Precio")
        if not precio:
            raise SystemExit("El CSV no trae la columna Precio [tienda] de Loyverse.")
        tienda = precio[precio.find("[") + 1 : -1]
        inventario = columna_tienda(nombres, "En inventario") or ""
        bajas = columna_tienda(nombres, "Existencias bajas") or ""
        disponible = columna_tienda(nombres, "Disponibles para la venta") or ""
        filas = []
        for cruda in lector:
            filas.append({
                "handle": (cruda.get("Handle") or "").strip(),
                "ref": (cruda.get("REF") or "").strip(),
                "nombre": (cruda.get("Nombre") or "").strip(),
                "categoria": (cruda.get("Categoria") or "").strip(),
                "descripcion": (cruda.get("Descripción") or "").strip(),
                "vendido_por_peso": (cruda.get("Vendido por peso") or "").strip(),
                "opcion1_nombre": (cruda.get("Opción 1 nombre") or "").strip(),
                "opcion1_valor": (cruda.get("Opción 1 valor") or "").strip(),
                "opcion2_nombre": (cruda.get("Opción 2 nombre") or "").strip(),
                "opcion2_valor": (cruda.get("Opción 2 valor") or "").strip(),
                "opcion3_nombre": (cruda.get("Opción 3 nombre") or "").strip(),
                "opcion3_valor": (cruda.get("Opción 3 valor") or "").strip(),
                "coste": (cruda.get("Coste") or "").strip(),
                "codigo_barras": (cruda.get("Codigo de barras") or "").strip(),
                "ref_componente": (cruda.get("REF del componente") or "").strip(),
                "cantidad_componente": (cruda.get("Cantidad del componente") or "").strip(),
                "seguir_inventario": (cruda.get("Seguir el Inventario") or "").strip(),
                "disponible": (cruda.get(disponible) or "").strip() if disponible else "",
                "precio": (cruda.get(precio) or "").strip(),
                "en_inventario": (cruda.get(inventario) or "").strip() if inventario else "",
                "existencias_bajas": (cruda.get(bajas) or "").strip() if bajas else "",
            })
    return tienda, filas


def guardar_loyverse(filas: list[dict], tienda: str, origen: Path) -> Path:
    DIR_LOYVERSE.mkdir(parents=True, exist_ok=True)
    destino = DIR_LOYVERSE / "loyverse.db"
    if destino.exists():
        destino.unlink()
    con = sqlite3.connect(destino)
    con.executescript("""
        CREATE TABLE meta (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );
        CREATE TABLE articulos (
            id INTEGER PRIMARY KEY,
            handle TEXT NOT NULL,
            ref TEXT NOT NULL,
            nombre TEXT NOT NULL,
            categoria TEXT,
            descripcion TEXT,
            vendido_por_peso TEXT,
            opcion1_nombre TEXT,
            opcion1_valor TEXT,
            opcion2_nombre TEXT,
            opcion2_valor TEXT,
            opcion3_nombre TEXT,
            opcion3_valor TEXT,
            coste TEXT,
            codigo_barras TEXT,
            ref_componente TEXT,
            cantidad_componente TEXT,
            seguir_inventario TEXT,
            tienda TEXT NOT NULL,
            disponible_venta TEXT,
            precio TEXT,
            en_inventario TEXT,
            existencias_bajas TEXT
        );
    """)
    con.executemany(
        "INSERT INTO meta(clave, valor) VALUES(?, ?)",
        (("origen", str(origen)), ("tienda", tienda), ("filas", str(len(filas)))),
    )
    con.executemany(
        """INSERT INTO articulos(
            handle, ref, nombre, categoria, descripcion, vendido_por_peso,
            opcion1_nombre, opcion1_valor, opcion2_nombre, opcion2_valor,
            opcion3_nombre, opcion3_valor, coste, codigo_barras, ref_componente,
            cantidad_componente, seguir_inventario, tienda, disponible_venta,
            precio, en_inventario, existencias_bajas
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [(
            f["handle"], f["ref"], f["nombre"], f["categoria"], f["descripcion"],
            f["vendido_por_peso"], f["opcion1_nombre"], f["opcion1_valor"],
            f["opcion2_nombre"], f["opcion2_valor"], f["opcion3_nombre"], f["opcion3_valor"],
            f["coste"], f["codigo_barras"], f["ref_componente"], f["cantidad_componente"],
            f["seguir_inventario"], tienda, f["disponible"], f["precio"],
            f["en_inventario"], f["existencias_bajas"],
        ) for f in filas],
    )
    con.commit()
    con.close()
    return destino


def asignar_codigos(productos: list[dict]) -> list[dict]:
    """El lector de MiPOS busca productos.codigo. La barra gana si no está repetida;
    si dos artículos comparten barra, el primero se queda con ella y el resto usa el REF."""
    usados: set[str] = set()
    duplicados = []
    for fila in productos:
        barra = fila["codigo_barras"]
        if barra and barra not in usados:
            fila["codigo"] = barra
            fila["codigo_origen"] = "barra"
            usados.add(barra)
        else:
            if barra:
                duplicados.append({
                    "codigo_barras": barra,
                    "ref": fila["ref"],
                    "nombre": fila["nombre"],
                    "quedo_con": None,
                })
            codigo = fila["ref"] or fila["handle"]
            n = 2
            base = codigo
            while codigo in usados or not codigo:
                codigo = f"{base}-{n}"
                n += 1
            fila["codigo"] = codigo
            fila["codigo_origen"] = "ref" if not barra else "ref_por_barra_repetida"
            usados.add(codigo)
            if duplicados and duplicados[-1]["ref"] == fila["ref"] and duplicados[-1]["quedo_con"] is None:
                duplicados[-1]["quedo_con"] = codigo
    return duplicados


def preparar_producto(fila: dict, avisos: Counter) -> dict:
    precio_txt = fila["precio"].strip().lower()
    if precio_txt in {"", "variable"}:
        precio = 0
        if precio_txt == "variable":
            avisos["precio_variable"] += 1
        else:
            avisos["precio_vacio"] += 1
    else:
        precio = pesos(float(precio_txt.replace(",", ".")))
    coste_txt = fila["coste"].strip()
    if not coste_txt:
        costo = 0
    else:
        costo = pesos(float(coste_txt.replace(",", ".")))
        if costo >= COSTO_PLACEHOLDER:
            avisos["costo_placeholder"] += 1
            costo = 0
    stock = stock_real(fila["en_inventario"]) if fila["seguir_inventario"].upper() == "Y" else 0.0
    if stock < 0:
        avisos["stock_negativo"] += 1
    minimo = stock_real(fila["existencias_bajas"])
    return {
        "precio_venta": precio,
        "precio_costo": costo,
        "stock": stock,
        "stock_minimo": minimo,
        "granel": si_no(fila["vendido_por_peso"]),
        "activo": 0 if fila["disponible"].upper() == "N" else 1,
    }


def crear_mipos(productos: list[dict], tienda: str) -> tuple[Path, dict]:
    DIR_MIPOS.mkdir(parents=True, exist_ok=True)
    destino = DIR_MIPOS / "mipos.db"
    for extra in (destino, Path(str(destino) + "-wal"), Path(str(destino) + "-shm")):
        if extra.exists():
            extra.unlink()
    momento = ahora_santiago()
    avisos: Counter = Counter()
    duplicados = asignar_codigos(productos)
    con = sqlite3.connect(destino)
    con.execute("PRAGMA foreign_keys=ON")
    con.executescript(ESQUEMA)
    existentes = {
        tabla: {fila[1] for fila in con.execute(f"PRAGMA table_info({tabla})")}
        for tabla in MIGRACIONES
    }
    for tabla, columnas in MIGRACIONES.items():
        for nombre, tipo in columnas:
            if nombre not in existentes[tabla]:
                con.execute(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {tipo}")
    con.executescript(TRIGGERS)
    con.execute("CREATE INDEX IF NOT EXISTS idx_caja_terminal ON caja_sesiones(terminal_id, estado)")
    con.executemany(
        "INSERT INTO config(clave, valor) VALUES(?, ?)",
        list(DEFAULT_CONFIG.items()),
    )
    con.execute(
        "INSERT INTO config(clave, valor) VALUES('version_programa', ?) "
        "ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
        (VERSION,),
    )
    con.execute(
        "UPDATE config SET valor=? WHERE clave='negocio_nombre'",
        (tienda or "Mi Almacén",),
    )
    con.execute(
        "INSERT INTO usuarios(nombre, usuario, clave_hash, rol, debe_cambiar_clave, creado) "
        "VALUES(?,?,?,?,1,?)",
        ("Administrador", "admin", hash_clave("1234"), "admin", momento),
    )
    con.execute("INSERT OR IGNORE INTO categorias(nombre) VALUES('General')")
    con.execute(
        "INSERT INTO terminales(id, nombre, config, creado) VALUES(1, 'Caja 1', ?, ?)",
        (json.dumps(CAJA_CONFIG, ensure_ascii=False), momento),
    )

    categorias: dict[str, int] = {}
    for fila in productos:
        nombre = fila["categoria"][:60]
        if not nombre:
            continue
        clave = nombre.casefold()
        if clave not in categorias:
            con.execute("INSERT INTO categorias(nombre) VALUES(?)", (nombre,))
            categorias[clave] = con.execute("SELECT last_insert_rowid()").fetchone()[0]

    movimientos = []
    for fila in productos:
        nums = preparar_producto(fila, avisos)
        cat = fila["categoria"][:60]
        categoria_id = categorias.get(cat.casefold()) if cat else None
        cur = con.execute(
            """INSERT INTO productos(
                codigo, nombre, categoria_id, precio_costo, precio_venta, stock, stock_minimo,
                granel, activo, creado, actualizado, plu, catalogo_base
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)""",
            (
                fila["codigo"], fila["nombre"][:120], categoria_id, nums["precio_costo"],
                nums["precio_venta"], nums["stock"], nums["stock_minimo"], nums["granel"],
                nums["activo"], momento, momento, None,
            ),
        )
        if nums["stock"] != 0:
            movimientos.append((
                cur.lastrowid, momento, None, "importacion", nums["stock"], 0, nums["stock"],
                nums["precio_costo"], fila["ref"], "Importación Loyverse",
            ))
    con.executemany(
        """INSERT INTO movimientos_stock(
            producto_id, fecha, usuario_id, tipo, cantidad, stock_antes, stock_despues,
            costo_unitario, referencia, motivo
        ) VALUES (?,?,?,?,?,?,?,?,?,?)""",
        movimientos,
    )
    con.execute("UPDATE productos SET precio_cambiado_en=?", (momento,))
    con.commit()
    verificar(con, productos, tienda)
    con.close()

    informe = {
        "version_mipos": VERSION,
        "tienda": tienda,
        "productos": len(productos),
        "categorias": len(categorias),
        "con_codigo_de_barras": sum(1 for p in productos if p["codigo_origen"] == "barra"),
        "con_ref_porque_no_hay_barra": sum(1 for p in productos if p["codigo_origen"] == "ref"),
        "con_ref_porque_la_barra_estaba_repetida": sum(
            1 for p in productos if p["codigo_origen"] == "ref_por_barra_repetida"
        ),
        "vendidos_por_peso": sum(1 for p in productos if si_no(p["vendido_por_peso"])),
        "precio_variable_en_cero": avisos["precio_variable"],
        "costos_placeholder_en_cero": avisos["costo_placeholder"],
        "stock_negativo": avisos["stock_negativo"],
        "movimientos_de_stock": len(movimientos),
        "barras_repetidas": duplicados,
        "acceso": "Al abrir esta base en MiPOS, el usuario es admin y la clave es 1234. Pide cambiarla.",
        "archivo": str(destino),
    }
    (DIR_MIPOS / "informe.json").write_text(
        json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return destino, informe


def verificar(con: sqlite3.Connection, productos: list[dict], tienda: str) -> None:
    columnas = [fila[1] for fila in con.execute("PRAGMA table_info(productos)")]
    if tuple(columnas) != COLUMNAS_PRODUCTO:
        raise SystemExit(f"La tabla productos no calza con MiPOS: {columnas}")
    integridad = con.execute("PRAGMA integrity_check").fetchone()[0]
    if integridad != "ok":
        raise SystemExit(f"SQLite integrity_check: {integridad}")
    rotas = con.execute("PRAGMA foreign_key_check").fetchall()
    if rotas:
        raise SystemExit(f"Claves foráneas rotas: {rotas[:5]}")
    total = con.execute("SELECT COUNT(*) FROM productos").fetchone()[0]
    if total != len(productos):
        raise SystemExit(f"Se esperaban {len(productos)} productos y hay {total}")
    codigos = con.execute("SELECT COUNT(DISTINCT codigo) FROM productos").fetchone()[0]
    if codigos != total:
        raise SystemExit("Hay códigos repetidos en productos.codigo")
    version = con.execute("SELECT valor FROM config WHERE clave='version_programa'").fetchone()[0]
    if version != VERSION:
        raise SystemExit(f"version_programa quedó en {version}")
    negocio = con.execute("SELECT valor FROM config WHERE clave='negocio_nombre'").fetchone()[0]
    if negocio != tienda:
        raise SystemExit(f"El negocio quedó como {negocio}")
    triggers = {fila[0] for fila in con.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
    )}
    if "trg_precio_nuevo" not in triggers or "trg_precio_cambiado" not in triggers:
        raise SystemExit(f"Faltan triggers de precio: {triggers}")
    muestra = con.execute(
        "SELECT p.codigo, p.precio_venta, p.precio_costo, p.granel, c.nombre "
        "FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.codigo=?",
        ("7802810012029",),
    ).fetchone()
    if muestra != ("7802810012029", 3000, 2150, 0, "Abarrotes"):
        raise SystemExit(f"Aceite Belmont no calzó: {muestra}")
    pan = con.execute(
        "SELECT codigo, granel, precio_venta FROM productos WHERE nombre=?",
        ("1 pan a granel",),
    ).fetchone()
    if not pan or pan[1] != 1 or pan[2] != 2200:
        raise SystemExit(f"El pan a granel no calzó: {pan}")
    negativo = con.execute(
        "SELECT stock FROM productos WHERE codigo=?", ("7802820021950",)
    ).fetchone()
    if not negativo or negativo[0] >= 0:
        raise SystemExit(f"El stock negativo no se conservó: {negativo}")
    sin_fecha = con.execute(
        "SELECT COUNT(*) FROM productos WHERE precio_cambiado_en IS NULL OR creado IS NULL"
    ).fetchone()[0]
    if sin_fecha:
        raise SystemExit("Hay productos sin fecha de creación o de cambio de precio")
    descuadre = con.execute(
        """SELECT COUNT(*) FROM productos p
           LEFT JOIN movimientos_stock m ON m.producto_id=p.id AND m.tipo='importacion'
           WHERE p.stock <> 0 AND (m.id IS NULL OR m.stock_despues <> p.stock)"""
    ).fetchone()[0]
    if descuadre:
        raise SystemExit(f"El kárdex no cuadra con el stock en {descuadre} productos")


def convertir(ruta_csv: str | None = None) -> dict:
    origen = buscar_csv(ruta_csv)
    tienda, filas = leer_loyverse(origen)
    if not filas:
        raise SystemExit("El CSV no trae artículos.")
    componentes = [f for f in filas if f["ref_componente"]]
    productos = [f for f in filas if not f["ref_componente"]]
    sin_nombre = [f["ref"] for f in productos if not f["nombre"]]
    if sin_nombre:
        raise SystemExit(f"Hay artículos sin nombre: {sin_nombre[:5]}")
    guardar_loyverse(filas, tienda, origen)
    copia = DIR_LOYVERSE / "export_items.csv"
    if origen.resolve() != copia.resolve():
        copia.write_bytes(origen.read_bytes())
    destino, informe = crear_mipos(productos, tienda)
    if componentes:
        informe["filas_de_componentes_no_convertidas_a_combo"] = len(componentes)
        (DIR_MIPOS / "informe.json").write_text(
            json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    informe["loyverse"] = str(DIR_LOYVERSE / "loyverse.db")
    informe["mipos"] = str(destino)
    return informe


PAGINA = """<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loyverse a MiPOS</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
  main { max-width: 640px; margin: 8vh auto; padding: 32px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  p { color: #94a3b8; line-height: 1.5; }
  button { margin-top: 20px; background: #22c55e; color: #052e16; border: 0; border-radius: 12px;
    font-size: 20px; font-weight: 700; padding: 16px 28px; cursor: pointer; }
  button:disabled { opacity: .6; cursor: wait; }
  pre { white-space: pre-wrap; background: #1e293b; border-radius: 12px; padding: 16px; }
</style>
<main>
  <h1>Pasar artículos de Loyverse a MiPOS</h1>
  <p>Lee <b>lpyverse/export_items.csv</b>, guarda la base original en <b>lpyverse/loyverse.db</b>
  y escribe <b>mipos/mipos.db</b> con el esquema de MiPOS 4.0.92. Este botón corre en el equipo,
  con permiso para leer y escribir esas carpetas.</p>
  <button id="ir" type="button">Convertir ahora</button>
  <pre id="salida">Todavía no se convierte.</pre>
</main>
<script>
const boton = document.getElementById('ir');
const salida = document.getElementById('salida');
boton.addEventListener('click', async () => {
  boton.disabled = true;
  salida.textContent = 'Convirtiendo…';
  try {
    const r = await fetch('/convertir', { method: 'POST' });
    const data = await r.json();
    salida.textContent = data.error ? data.error : JSON.stringify(data, null, 2);
  } catch (e) {
    salida.textContent = String(e);
  }
  boton.disabled = false;
});
</script>
"""


def servir(puerto: int = 8765) -> None:
    class Manejador(BaseHTTPRequestHandler):
        def log_message(self, formato, *args):
            return

        def _enviar(self, codigo, cuerpo, tipo):
            datos = cuerpo if isinstance(cuerpo, bytes) else cuerpo.encode()
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def do_GET(self):
            self._enviar(200, PAGINA, "text/html; charset=utf-8")

        def do_POST(self):
            if self.path != "/convertir":
                self._enviar(404, '{"error":"no existe"}', "application/json")
                return
            try:
                informe = convertir(None)
                self._enviar(200, json.dumps(informe, ensure_ascii=False, indent=2), "application/json; charset=utf-8")
            except SystemExit as exc:
                self._enviar(400, json.dumps({"error": str(exc)}, ensure_ascii=False), "application/json; charset=utf-8")
            except Exception as exc:
                self._enviar(500, json.dumps({"error": str(exc)}, ensure_ascii=False), "application/json; charset=utf-8")

    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Manejador)
    print(f"Abre http://127.0.0.1:{puerto} y aprieta Convertir ahora")
    servidor.serve_forever()


def main(argv: list[str]) -> None:
    if "--boton" in argv:
        servir()
        return
    ruta = next((a for a in argv[1:] if not a.startswith("-")), None)
    informe = convertir(ruta)
    print(json.dumps({k: informe[k] for k in informe if k != "barras_repetidas"}, ensure_ascii=False, indent=2))
    print(f"Barras repetidas resueltas: {len(informe['barras_repetidas'])}")
    print(f"Listo: {informe['mipos']}")


if __name__ == "__main__":
    main(sys.argv)
