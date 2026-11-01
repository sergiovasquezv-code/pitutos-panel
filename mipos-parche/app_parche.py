"""Rutas nuevas de MiPOS. Se carga desde el paquete app cuando el parche está aplicado."""


def pan_granel_ingreso(req):
    from app.server import HttpError
    from app import seguridad, stock
    usuario = req.usuario
    if usuario.get('rol') != 'admin' and not seguridad.permisos_de(usuario).get('stock_pan_granel'):
        raise HttpError(403, 'No tienes permiso para ingresar pan a granel')
    cantidad = req.decimal('cantidad', minimo=0)
    if cantidad <= 0:
        raise HttpError(400, 'Ingresa la cantidad que llegó')
    fila = req.con.execute(
        """SELECT * FROM productos WHERE activo=1 AND lower(nombre) LIKE '%pan a granel%'
           ORDER BY CASE WHEN lower(trim(nombre))='1 pan a granel' THEN 0 ELSE 1 END, id LIMIT 1"""
    ).fetchone()
    if not fila:
        raise HttpError(404, 'No está el producto pan a granel')
    producto = dict(fila)
    if not producto['granel']:
        raise HttpError(400, 'Pan a granel tiene que estar marcado como producto a granel')
    stock.mover(
        req.con, producto['id'], cantidad, 'entrada', usuario['id'],
        'pan-granel', 'Ingreso de pan a granel', None,
    )
    req.con.commit()
    nuevo = req.con.execute('SELECT stock, nombre, granel FROM productos WHERE id=?', (producto['id'],)).fetchone()
    seguridad.registrar(req.con, req, 'ajuste', producto['nombre'] + ': +' + str(cantidad))
    req.con.commit()
    return {'id': producto['id'], 'nombre': nuevo['nombre'], 'stock': nuevo['stock'], 'granel': nuevo['granel']}


def ticket_logo_guardar(req):
    import base64
    import re
    from app.server import HttpError
    logo = req.body.get('logo') if isinstance(req.body, dict) else ''
    logo = '' if logo is None else str(logo).strip()
    if logo:
        hallado = re.fullmatch(r'data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)', logo)
        if not hallado:
            raise HttpError(400, 'El logo tiene que ser una imagen PNG, JPG o WEBP')
        try:
            blob = base64.b64decode(re.sub(r'\s+', '', hallado.group(2)), validate=True)
        except Exception as exc:
            raise HttpError(400, 'El logo no se pudo leer') from exc
        if len(blob) > 400000 or len(logo) > 600000:
            raise HttpError(400, 'El logo es muy pesado (máximo 400 KB)')
        firma = blob[:12]
        es_imagen = (
            firma.startswith(b'\x89PNG')
            or firma.startswith(b'\xff\xd8\xff')
            or (firma[:4] == b'RIFF' and blob[8:12] == b'WEBP')
        )
        if not es_imagen:
            raise HttpError(400, 'El archivo no es una imagen PNG, JPG o WEBP')
    req.con.execute(
        "INSERT INTO config(clave, valor) VALUES('ticket_logo', ?) "
        "ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
        (logo,),
    )
    req.con.commit()
    return {'ok': True, 'ticket_logo': logo}
