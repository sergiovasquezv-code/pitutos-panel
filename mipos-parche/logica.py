"""Funciones que reemplazan a las de MiPOS 4.0.92.

Usan los mismos nombres globales que el módulo de destino (PERMISOS, db, seguridad…).
Al cargarlas dentro de MiPOS, esas variables ya existen.
"""


def permisos_de(usuario):
    p = {k: v[1] for k, v in PERMISOS.items()}
    p['stock_pan_granel'] = False
    if not usuario:
        return p
    if usuario.get('rol') == 'admin':
        return {k: (100 if k == 'descuento_max' else True) for k in list(PERMISOS) + ['stock_pan_granel']}
    try:
        guardados = json.loads(usuario.get('permisos') or '{}')
    except ValueError:
        guardados = {}
    perfil = guardados.get('perfil')
    if perfil in PERFILES:
        p = dict(PERFILES[perfil])
        p['stock_pan_granel'] = False
    for k, v in guardados.items():
        if k not in p:
            continue
        if k == 'descuento_max':
            p[k] = float(v)
        else:
            p[k] = bool(v)
    return p


def limpiar_permisos(datos):
    if not isinstance(datos, dict):
        return {}
    out = {}
    for k, v in datos.items():
        if k == 'descuento_max':
            try:
                out[k] = max(0.0, min(100.0, float(v)))
            except (TypeError, ValueError):
                pass
        elif k in PERMISOS or k == 'stock_pan_granel':
            out[k] = bool(v)
        elif k == 'perfil' and v in PERFILES:
            out[k] = v
    return out


def permisos_catalogo(req):
    lista = []
    for k, v in PERMISOS.items():
        if k == 'anular':
            continue
        lista.append({
            'clave': k,
            'nombre': v[0],
            'defecto': v[1],
            'perfiles': {n: pf[k] for n, pf in PERFILES.items()},
        })
    lista.append({
        'clave': 'stock_pan_granel',
        'nombre': 'Ingresar pan a granel',
        'defecto': False,
        'perfiles': {n: False for n in PERFILES},
    })
    return lista


def caja_movimiento(req):
    s = _sesion_abierta(req.con, req.terminal_id)
    if not s:
        raise HttpError(400, 'La caja está cerrada')
    tipo = req.texto('tipo')
    if tipo not in ('ingreso', 'retiro'):
        raise HttpError(400, "Tipo debe ser 'ingreso' o 'retiro'")
    monto = req.entero('monto', requerido=True, minimo=1)
    motivo = req.texto('motivo', maximo=200)
    if tipo == 'retiro' and not str(motivo or '').strip():
        raise HttpError(400, 'Escribe el motivo del egreso')
    autoriza = seguridad.autorizar(req, 'retiros', f'{tipo} {printing.clp(monto)}')
    if tipo == 'retiro':
        disponible = resumen_caja(req.con, s['id'])['efectivo_esperado_calc']
        if monto > disponible:
            raise HttpError(400, 'No hay suficiente efectivo en caja (hay ' + printing.clp(disponible) + ')')
    req.con.execute(
        'INSERT INTO caja_movimientos(sesion_id, usuario_id, tipo, monto, motivo, fecha) VALUES(?,?,?,?,?,?)',
        (s['id'], req.usuario['id'], tipo, monto, str(motivo or ''), db.ahora()),
    )
    seguridad.registrar(
        req.con, req, tipo, printing.clp(monto) + ' · ' + str(motivo or ''), autorizado_por=autoriza['id'],
    )
    req.con.commit()
    cfg = req.cfg()
    error = printing.solo_cajon(cfg) if cfg['impresora_modo'] != 'ninguna' else None
    estado = caja_estado(req)
    estado['impresion_error'] = error
    return estado


def crear_servidor(host, puerto):
    import app.actualizacion
    import app.api
    import app.balanza
    import app.cierres
    import app.clientes
    import app.combos
    import app.conexiones
    import app.devoluciones
    import app.dte
    import app.equipos
    import app.inventario
    import app.licencia
    import app.nube_oauth
    import app.ofertas
    import app.parche
    import app.pedidos
    import app.proveedores
    import app.reportes
    import app.respaldos_api
    import app.seguridad
    import app.sinred
    import app.soporte
    import app.telegram
    import app.terminales
    import app.ventas_iniciadas
    ruta('POST', '/stock/pan-granel', 'usuario')(app.parche.pan_granel_ingreso)
    ruta('POST', '/ticket/logo', 'admin')(app.parche.ticket_logo_guardar)
    db.init_db()
    srv = ServidorMiPOS((host, puerto), Handler)
    srv.daemon_threads = True
    return srv
