"""Aplica el parche local sobre una copia del PYZ de MiPOS 4.0.92.

No arma el instalador y no publica nada. Copia después, a mano, la carpeta static
dentro de la instalación de prueba.
"""
import marshal
import struct
import types
import zlib
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ORIGEN = Path('/tmp/mipos/PYZ.pyz')


def _codigo_de(ruta_py, nombres):
    modulo = compile(ruta_py.read_text(encoding='utf-8'), str(ruta_py), 'exec')
    encontrados = {}

    def visitar(codigo):
        if codigo.co_name in nombres and codigo.co_name not in encontrados:
            encontrados[codigo.co_name] = codigo
        for constante in codigo.co_consts:
            if isinstance(constante, types.CodeType):
                visitar(constante)

    visitar(modulo)
    faltan = [n for n in nombres if n not in encontrados]
    if faltan:
        raise SystemExit('No encontré ' + ', '.join(faltan))
    return encontrados


def _cambiar(codigo, nuevos):
    constantes = list(codigo.co_consts)
    cambio = False
    for i, constante in enumerate(constantes):
        if not isinstance(constante, types.CodeType):
            continue
        if constante.co_name in nuevos:
            constantes[i] = nuevos.pop(constante.co_name)
            cambio = True
        else:
            reemplazo, cambio_hijo = _cambiar(constante, nuevos)
            if cambio_hijo:
                constantes[i] = reemplazo
                cambio = True
    if not cambio:
        return codigo, False
    return codigo.replace(co_consts=tuple(constantes)), True


def reconstruir(origen=ORIGEN, destino=None):
    datos = Path(origen).read_bytes()
    if datos[:4] != b'PYZ\x00':
        raise SystemExit('El archivo no es un PYZ de MiPOS')
    toc_pos = struct.unpack('!i', datos[8:12])[0]
    toc = marshal.loads(datos[toc_pos:])
    piezas = {}
    for nombre, (es_paquete, offset, largo) in toc:
        crudo = b'' if largo == 0 else zlib.decompress(datos[offset:offset + largo])
        piezas[nombre] = (es_paquete, crudo)

    nuevos = {}
    nuevos.update(_codigo_de(AQUI / 'logica.py', {
        'permisos_de', 'limpiar_permisos', 'permisos_catalogo', 'caja_movimiento', 'crear_servidor',
    }))
    por_modulo = {
        'app.seguridad': {'permisos_de', 'limpiar_permisos', 'permisos_catalogo'},
        'app.api': {'caja_movimiento'},
        'app.server': {'crear_servidor'},
    }
    for modulo, nombres in por_modulo.items():
        codigo = marshal.loads(piezas[modulo][1])
        pedazo = {n: nuevos[n] for n in nombres}
        codigo, cambio = _cambiar(codigo, pedazo)
        if not cambio or pedazo:
            raise SystemExit('No pude reemplazar ' + ', '.join(pedazo or nombres) + ' en ' + modulo)
        piezas[modulo] = (piezas[modulo][0], marshal.dumps(codigo))

    parche = compile((AQUI / 'app_parche.py').read_text(encoding='utf-8'), r'app\parche.py', 'exec')
    piezas['app.parche'] = (0, marshal.dumps(parche))

    salida = bytearray(b'PYZ\x00')
    salida += datos[4:8]
    salida += b'\x00\x00\x00\x00'
    entradas = []
    nombres = [nombre for nombre, _ in toc]
    if 'app.parche' not in nombres:
        nombres.append('app.parche')
    for nombre in nombres:
        es_paquete, crudo = piezas[nombre]
        offset = len(salida)
        if crudo:
            comprimido = zlib.compress(crudo, 9)
            salida += comprimido
            largo = len(comprimido)
        else:
            largo = 0
        entradas.append((nombre, (es_paquete, offset, largo)))
    struct.pack_into('!i', salida, 8, len(salida))
    salida += marshal.dumps(entradas)
    destino = Path(destino or '/tmp/mipos/PYZ-parche.pyz')
    destino.write_bytes(salida)
    return destino


def _textos(codigo):
    hallados = list(codigo.co_names)

    def visitar(item):
        hallados.extend(item.co_names)
        for constante in item.co_consts:
            if isinstance(constante, str):
                hallados.append(constante)
            elif isinstance(constante, types.CodeType):
                visitar(constante)

    visitar(codigo)
    return hallados


def aplicar_en_exe(exe_origen, exe_destino, pyz):
    """Sustituye el PYZ dentro de una copia del MiPOS.exe. No crea el instalador."""
    datos = bytearray(Path(exe_origen).read_bytes())
    cookie = bytes(datos[-88:])
    if cookie[:8] != b'MEI\x0c\x0b\n\x0b\x0e':
        raise SystemExit('MiPOS.exe no tiene el paquete esperado')
    largo_paquete, toc_off, toc_len, pyver = struct.unpack('!IIII', cookie[8:24])
    inicio = len(datos) - largo_paquete
    tabla = bytearray(datos[inicio + toc_off:inicio + toc_off + toc_len])
    marca = bytes.fromhex('00009683004e6d1d004e6d1d007a50595a')
    lugar = tabla.find(marca)
    if lugar < 0:
        raise SystemExit('No encontré PYZ.pyz dentro del ejecutable')
    nuevo = Path(pyz).read_bytes()
    if not nuevo.startswith(b'PYZ\x00'):
        raise SystemExit('El PYZ parcheado no es válido')
    struct.pack_into('!II', tabla, lugar + 4, len(nuevo), len(nuevo))
    pyz_abs = inicio + 0x9683
    salida = bytes(datos[:pyz_abs]) + nuevo + bytes(tabla)
    delta = len(nuevo) - 5139741
    largo_paquete += delta
    toc_off += delta
    cookie = bytearray(cookie)
    struct.pack_into('!IIII', cookie, 8, largo_paquete, toc_off, toc_len, pyver)
    Path(exe_destino).write_bytes(salida + bytes(cookie))
    return Path(exe_destino)


def verificar(ruta):
    datos = Path(ruta).read_bytes()
    toc = dict(marshal.loads(datos[struct.unpack('!i', datos[8:12])[0]:]))
    pendientes = {
        'app.api': 'Escribe el motivo del egreso',
        'app.seguridad': 'stock_pan_granel',
        'app.server': '/stock/pan-granel',
        'app.parche': 'No tienes permiso para ingresar pan a granel',
    }
    for modulo, texto in pendientes.items():
        es_paquete, offset, largo = toc[modulo]
        codigo = marshal.loads(zlib.decompress(datos[offset:offset + largo]))
        if texto not in _textos(codigo):
            raise SystemExit(modulo + ' quedó sin «' + texto + '»')
        del es_paquete
    return True


if __name__ == '__main__':
    ruta = reconstruir()
    verificar(ruta)
    print('PYZ local listo:', ruta)
