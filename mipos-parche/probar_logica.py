"""Pruebas locales del parche. No abre el instalador ni publica nada."""
import base64
import importlib.util
import json
import sqlite3
import struct
import sys
import types
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import logica  # noqa: E402

PERMISOS = {
    'retiros': ('Retiros e ingresos de efectivo', True),
    'venta_rapida': ('Venta rápida', True),
    'cerrar_caja': ('Cerrar la caja', True),
    'descuento_max': ('Descuento máximo', 10),
    'anular': ('Anular', False),
    'menu_inventario': ('Menú Inventario', False),
}
PERFILES = {
    'cajero': {k: False for k in PERMISOS},
    'supervisor': {k: True for k in PERMISOS},
}
PERFILES['cajero'].update({'venta_rapida': True, 'cerrar_caja': True, 'descuento_max': 0})
PERFILES['supervisor']['descuento_max'] = 30
logica.PERMISOS = PERMISOS
logica.PERFILES = PERFILES
logica.json = json


class Error(Exception):
    def __init__(self, status, mensaje):
        super().__init__(mensaje)
        self.status = status


def prueba_permisos():
    limpio = logica.limpiar_permisos({
        'retiros': True, 'stock_pan_granel': True, 'menu_inventario': False,
        'perfil': 'cajero', 'descuento_max': 12, 'inventado': True,
    })
    assert limpio['stock_pan_granel'] is True
    assert limpio['retiros'] is True
    assert limpio['perfil'] == 'cajero'
    assert 'inventado' not in limpio
    assert logica.limpiar_permisos({'stock_pan_granel': False})['stock_pan_granel'] is False

    cajero = {'rol': 'cajero', 'permisos': json.dumps({'perfil': 'cajero', 'retiros': True, 'stock_pan_granel': True})}
    permisos = logica.permisos_de(cajero)
    assert permisos['stock_pan_granel'] is True
    assert permisos['retiros'] is True
    assert permisos['menu_inventario'] is False
    sin_pan = {'rol': 'cajero', 'permisos': json.dumps({'perfil': 'cajero', 'retiros': False})}
    assert logica.permisos_de(sin_pan)['stock_pan_granel'] is False
    assert logica.permisos_de({'rol': 'admin', 'permisos': '{}'})['stock_pan_granel'] is True
    catalogo = {x['clave']: x for x in logica.permisos_catalogo(None)}
    assert catalogo['stock_pan_granel']['defecto'] is False
    assert catalogo['stock_pan_granel']['perfiles'] == {'cajero': False, 'supervisor': False}
    assert 'anular' not in catalogo
    assert 'retiros' in catalogo
    print('permisos ok')


def base():
    con = sqlite3.connect(':memory:')
    con.row_factory = sqlite3.Row
    con.executescript("""
        CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, granel INTEGER, activo INTEGER, stock REAL, precio_costo REAL);
        CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT);
        INSERT INTO productos VALUES (1, '1 pan a granel', 1, 1, 2.5, 800);
        INSERT INTO productos VALUES (2, 'Aceite', 0, 1, 10, 1000);
        INSERT INTO productos VALUES (3, 'pan a granel antiguo', 1, 1, 1, 700);
    """)
    return con


class Req:
    def __init__(self, con, usuario, body):
        self.con = con
        self.usuario = usuario
        self.body = body

    def decimal(self, nombre, minimo=None):
        valor = float(self.body.get(nombre) or 0)
        if minimo is not None and valor < minimo:
            valor = minimo
        return valor


def cargar_parche(movidos):
    app = types.ModuleType('app')
    server = types.ModuleType('app.server')
    server.HttpError = Error
    seguridad = types.ModuleType('app.seguridad')
    seguridad.permisos_de = logica.permisos_de
    seguridad.registrar = lambda *args, **kwargs: None
    stock = types.ModuleType('app.stock')

    def mover(con, producto_id, delta, tipo, usuario_id, referencia, motivo, costo):
        movidos.append((producto_id, delta, tipo, motivo))
        fila = con.execute('SELECT stock FROM productos WHERE id=?', (producto_id,)).fetchone()
        nuevo = round(fila['stock'] + delta, 3)
        con.execute('UPDATE productos SET stock=? WHERE id=?', (nuevo, producto_id))

    stock.mover = mover
    sys.modules['app'] = app
    sys.modules['app.server'] = server
    sys.modules['app.seguridad'] = seguridad
    sys.modules['app.stock'] = stock
    spec = importlib.util.spec_from_file_location('app.parche', AQUI / 'app_parche.py')
    modulo = importlib.util.module_from_spec(spec)
    sys.modules['app.parche'] = modulo
    spec.loader.exec_module(modulo)
    return modulo


def prueba_pan_y_logo():
    movidos = []
    modulo = cargar_parche(movidos)
    con = base()
    cajero = {'id': 4, 'rol': 'cajero', 'permisos': json.dumps({'perfil': 'cajero'})}
    try:
        modulo.pan_granel_ingreso(Req(con, cajero, {'cantidad': 1}))
        raise SystemExit('el cajero sin permiso no debió ingresar pan')
    except Error as exc:
        assert exc.status == 403
    assert con.execute('SELECT stock FROM productos WHERE id=1').fetchone()['stock'] == 2.5

    cajero['permisos'] = json.dumps({'perfil': 'cajero', 'stock_pan_granel': True, 'retiros': True})
    r = modulo.pan_granel_ingreso(Req(con, cajero, {'cantidad': 1.5}))
    assert r['nombre'] == '1 pan a granel'
    assert r['stock'] == 4
    assert con.execute('SELECT stock FROM productos WHERE id=2').fetchone()['stock'] == 10
    assert movidos == [(1, 1.5, 'entrada', 'Ingreso de pan a granel')]
    try:
        modulo.pan_granel_ingreso(Req(con, cajero, {'cantidad': 0}))
        raise SystemExit('cantidad cero no debió pasar')
    except Error as exc:
        assert exc.status == 400

    png = base64.b64encode(bytes.fromhex(
        '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de'
        '0000000c4944415408d763f80f0000010100f2c5f7f20000000049454e44ae426082'
    )).decode()
    logo = 'data:image/png;base64,' + png
    guardado = modulo.ticket_logo_guardar(Req(con, {'rol': 'admin'}, {'logo': logo}))
    assert guardado['ticket_logo'] == logo
    assert con.execute("SELECT valor FROM config WHERE clave='ticket_logo'").fetchone()['valor'] == logo
    modulo.ticket_logo_guardar(Req(con, {'rol': 'admin'}, {'logo': ''}))
    assert con.execute("SELECT valor FROM config WHERE clave='ticket_logo'").fetchone()['valor'] == ''
    try:
        modulo.ticket_logo_guardar(Req(con, {'rol': 'admin'}, {'logo': 'data:image/png;base64,AAAA'}))
        raise SystemExit('un logo falso no debió guardarse')
    except Error as exc:
        assert exc.status == 400
    print('pan y logo ok')


def prueba_retiro():
    class Pedido:
        def __init__(self, tipo, motivo):
            self.tipo = tipo
            self.motivo = motivo
            self.con = types.SimpleNamespace(execute=lambda *a, **k: None, commit=lambda: None)
            self.terminal_id = 1
            self.usuario = {'id': 4}
            self.inserts = []

        def texto(self, nombre, maximo=None):
            return self.tipo if nombre == 'tipo' else self.motivo

        def entero(self, nombre, requerido=False, minimo=None):
            return 1000

        def cfg(self):
            return {'impresora_modo': 'ninguna'}

    logica.HttpError = Error
    logica._sesion_abierta = lambda con, terminal: {'id': 9}
    logica.seguridad = types.SimpleNamespace(
        autorizar=lambda *a, **k: {'id': 4},
        registrar=lambda *a, **k: None,
    )
    logica.printing = types.SimpleNamespace(clp=lambda n: '$' + str(n), solo_cajon=lambda cfg: None)
    logica.resumen_caja = lambda con, sesion: {'efectivo_esperado_calc': 5000}
    logica.db = types.SimpleNamespace(ahora=lambda: '2026-11-01T18:00:00')
    logica.caja_estado = lambda req: {'abierta': True}

    try:
        logica.caja_movimiento(Pedido('retiro', '   '))
        raise SystemExit('el retiro sin motivo no debió guardarse')
    except Error as exc:
        assert 'motivo' in str(exc)
    ingreso = logica.caja_movimiento(Pedido('ingreso', ''))
    assert ingreso['impresion_error'] is None
    print('retiro ok')


def prueba_pyz():
    import parche
    ruta = parche.reconstruir(destino='/tmp/mipos/PYZ-parche.pyz')
    parche.verificar(ruta)
    exe = parche.aplicar_en_exe(
        '/tmp/mipos/unpacked/{app}/MiPOS.exe',
        '/tmp/mipos/MiPOS-prueba.exe',
        ruta,
    )
    datos = exe.read_bytes()
    cookie = datos[-88:]
    largo_paquete, toc_off = struct.unpack('!II', cookie[8:16])
    inicio = len(datos) - largo_paquete
    extraido = Path('/tmp/mipos/PYZ-desde-exe.pyz')
    extraido.write_bytes(datos[inicio + 0x9683:inicio + toc_off])
    parche.verificar(extraido)
    print('pyz ok', ruta.name, 'exe', exe.name)


if __name__ == '__main__':
    prueba_permisos()
    prueba_pan_y_logo()
    prueba_retiro()
    prueba_pyz()
    print('todo ok')
