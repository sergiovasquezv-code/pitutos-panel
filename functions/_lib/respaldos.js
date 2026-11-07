// Respaldo remoto de MiVet y MiPOS. Un solo contrato para los dos productos.
//
// Objeto vigente: mivet/{clave_id}.zip o mipos/{clave_id}.zip
// La subida va a otro nombre (mivet/{clave_id}/nuevo-{token}.zip). Ese nombre
// queda anotado como vigente y recién entonces se borra el anterior. Si se
// puede, se copia al nombre estable y se borra el temporal.
//
// El zip no pasa por el Worker. La URL firmada dura pocos minutos y el token
// se invalida al confirmar. El bucket es privado: la URL no es pública.

const EXPIRA_SEG = 600;
const REGION = 'auto';
const enc = new TextEncoder();

const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const fallo = (status, mensaje) => Object.assign(new Error(mensaje), { status });

function tablaClaves(producto) {
  if (producto === 'mivet') return 'mivet_claves';
  if (producto === 'mipos') return 'mipos_claves';
  throw fallo(400, 'Producto de respaldo desconocido');
}

export async function asegurarTabla(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS respaldos_licencia (
    producto TEXT NOT NULL,
    clave_id INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    pedido TEXT,
    listo TEXT,
    tamano INTEGER,
    object_key TEXT,
    subida_key TEXT,
    token TEXT,
    token_expira TEXT,
    equipo TEXT,
    error TEXT,
    PRIMARY KEY (producto, clave_id)
  )`).run();
}

function tokenNuevo() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

const ahora = () => new Date().toISOString();
const isoEn = seg => new Date(Date.now() + seg * 1000).toISOString();
const vencido = iso => !iso || !(Date.parse(iso) > Date.now());

function claveEstable(producto, claveId) {
  return `${producto}/${claveId}.zip`;
}

function claveSubida(producto, claveId, token) {
  return `${producto}/${claveId}/nuevo-${token}.zip`;
}

async function fila(db, producto, claveId) {
  await asegurarTabla(db);
  return db.prepare('SELECT * FROM respaldos_licencia WHERE producto=? AND clave_id=?').bind(producto, claveId).first();
}

async function claveActiva(db, producto, claveId) {
  const clave = await db.prepare(`SELECT id, estado FROM ${tablaClaves(producto)} WHERE id=?`).bind(claveId).first();
  if (!clave) throw fallo(404, 'Clave no encontrada');
  if (clave.estado !== 'activa') throw fallo(400, 'La licencia no está activa');
  return clave;
}

async function borrarSiExiste(env, key) {
  if (!key || !env.RESPALDOS) return;
  try { await env.RESPALDOS.delete(key); } catch (e) { /* el objeto ya no estaba */ }
}

export async function mapaEstados(db, producto) {
  await asegurarTabla(db);
  const filas = (await db.prepare(
    'SELECT clave_id, estado, pedido, listo, tamano, error FROM respaldos_licencia WHERE producto=?'
  ).bind(producto).all()).results;
  const mapa = {};
  for (const f of filas) {
    mapa[f.clave_id] = {
      estado: f.estado, pedido: f.pedido || null, listo: f.listo || null,
      tamano: f.tamano || 0, error: f.error || '',
    };
  }
  return mapa;
}

export async function pedir(db, env, producto, claveId) {
  await claveActiva(db, producto, claveId);
  const row = await fila(db, producto, claveId);
  const pedido = ahora();
  if (row && row.estado === 'pendiente') return { ok: true, estado: 'pendiente', pedido: row.pedido || pedido };
  if (row?.subida_key && row.subida_key !== row.object_key) await borrarSiExiste(env, row.subida_key);
  if (row) {
    await db.prepare(`UPDATE respaldos_licencia
      SET estado='pendiente', pedido=?, error=NULL, token=NULL, token_expira=NULL, subida_key=NULL, equipo=NULL
      WHERE producto=? AND clave_id=?`).bind(pedido, producto, claveId).run();
  } else {
    await db.prepare(
      "INSERT INTO respaldos_licencia(producto, clave_id, estado, pedido) VALUES(?, ?, 'pendiente', ?)"
    ).bind(producto, claveId, pedido).run();
  }
  return { ok: true, estado: 'pendiente', pedido };
}

export async function ver(db, producto, claveId) {
  const row = await fila(db, producto, claveId);
  if (!row) return { estado: null, pedido: null, listo: null, tamano: 0, error: '' };
  return {
    estado: row.estado, pedido: row.pedido || null, listo: row.listo || null,
    tamano: row.tamano || 0, error: row.error || '',
  };
}

function credenciales(env) {
  const accountId = String(env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(env.RESPALDOS_BUCKET || 'pitutos-respaldos').trim();
  if (!env.RESPALDOS) throw fallo(500, 'Falta enlazar el depósito privado pitutos-respaldos');
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw fallo(500, 'Falta el token S3 de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) para firmar la URL');
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, bytes));
}

async function hashHex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

function encodeRFC3986(valor) {
  return encodeURIComponent(valor).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function uriDe(bucket, key) {
  return `/${[bucket, ...String(key).split('/')].map(encodeRFC3986).join('/')}`;
}

async function llaveFirma(secret, fecha) {
  let k = await hmac(enc.encode(`AWS4${secret}`), fecha);
  k = await hmac(k, REGION);
  k = await hmac(k, 's3');
  return hmac(k, 'aws4_request');
}

function fechaAmz(date = new Date()) {
  const amz = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz, dia: amz.slice(0, 8) };
}

async function urlFirmada(env, { method, key, headers = {}, queryExtra = {} }) {
  const { accountId, accessKeyId, secretAccessKey, bucket } = credenciales(env);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const { amz, dia } = fechaAmz();
  const credential = `${accessKeyId}/${dia}/${REGION}/s3/aws4_request`;
  const headerMap = { host };
  for (const [nombre, valor] of Object.entries(headers)) headerMap[nombre.toLowerCase()] = String(valor).trim();
  const nombres = Object.keys(headerMap).sort();
  const canonicalHeaders = nombres.map(n => `${n}:${headerMap[n]}\n`).join('');
  const signedHeaders = nombres.join(';');
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(EXPIRA_SEG),
    'X-Amz-SignedHeaders': signedHeaders,
    ...queryExtra,
  };
  const canonicalQuery = Object.keys(query).sort().map(k => `${encodeRFC3986(k)}=${encodeRFC3986(query[k])}`).join('&');
  const canonicalUri = uriDe(bucket, key);
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amz, `${dia}/${REGION}/s3/aws4_request`, await hashHex(canonicalRequest)].join('\n');
  const signature = hex(await hmac(await llaveFirma(secretAccessKey, dia), stringToSign));
  const enviados = {};
  for (const nombre of nombres) if (nombre !== 'host') {
    const original = Object.keys(headers).find(h => h.toLowerCase() === nombre) || nombre;
    enviados[original] = headerMap[nombre];
  }
  return {
    url: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    headers: enviados,
  };
}

async function copiarObjeto(env, origen, destino) {
  const { accountId, accessKeyId, secretAccessKey, bucket } = credenciales(env);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const { amz, dia } = fechaAmz();
  const payloadHash = await hashHex('');
  const copySource = uriDe(bucket, origen);
  const headerMap = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-copy-source': copySource,
    'x-amz-date': amz,
  };
  const nombres = Object.keys(headerMap).sort();
  const canonicalHeaders = nombres.map(n => `${n}:${headerMap[n]}\n`).join('');
  const signedHeaders = nombres.join(';');
  const canonicalUri = uriDe(bucket, destino);
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amz, `${dia}/${REGION}/s3/aws4_request`, await hashHex(canonicalRequest)].join('\n');
  const signature = hex(await hmac(await llaveFirma(secretAccessKey, dia), stringToSign));
  const r = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${dia}/${REGION}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-copy-source': copySource,
      'x-amz-date': amz,
    },
  });
  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 180);
    throw new Error(`No se pudo dejar el respaldo en su nombre estable (${r.status}): ${detalle}`);
  }
}

async function emitirSubida(env, producto, claveId, equipo) {
  const token = tokenNuevo();
  const subida = claveSubida(producto, claveId, token);
  const expira = isoEn(EXPIRA_SEG);
  const headers = {
    'Content-Type': 'application/zip',
    'x-amz-meta-equipo': equipo,
    'x-amz-meta-token': token,
  };
  const firmada = await urlFirmada(env, { method: 'PUT', key: subida, headers });
  return { token, subida, expira, firmada };
}

export async function dia(db, env, producto, claveId, equipo) {
  // El cierre del día pide el mismo cupo que «Pedir respaldo» y devuelve la URL al tiro.
  // confirmar reemplaza el archivo anterior: queda uno solo.
  await pedir(db, env, producto, claveId);
  return consultar(db, env, producto, claveId, equipo);
}

export async function consultar(db, env, producto, claveId, equipo) {
  const row = await fila(db, producto, claveId);
  if (!row || row.estado !== 'pendiente') return { pedido: false, estado: row?.estado || null };
  if (row.token && row.equipo && row.equipo !== equipo && !vencido(row.token_expira)) {
    return { pedido: true, estado: 'pendiente', subir: null };
  }
  let token = row.token;
  let subida = row.subida_key;
  let expira = row.token_expira;
  let firmada;
  if (!token || !subida || vencido(expira) || row.equipo !== equipo) {
    if (subida && subida !== row.object_key) await borrarSiExiste(env, subida);
    const nueva = await emitirSubida(env, producto, claveId, equipo);
    token = nueva.token;
    subida = nueva.subida;
    expira = nueva.expira;
    firmada = nueva.firmada;
    await db.prepare(`UPDATE respaldos_licencia
      SET token=?, token_expira=?, subida_key=?, equipo=?, error=NULL
      WHERE producto=? AND clave_id=? AND estado='pendiente'`).bind(token, expira, subida, equipo, producto, claveId).run();
  } else {
    firmada = await urlFirmada(env, {
      method: 'PUT', key: subida,
      headers: { 'Content-Type': 'application/zip', 'x-amz-meta-equipo': equipo, 'x-amz-meta-token': token },
    });
  }
  return {
    pedido: true,
    estado: 'pendiente',
    token,
    subir: {
      url: firmada.url,
      metodo: 'PUT',
      expira_en: EXPIRA_SEG,
      object_key: subida,
      headers: firmada.headers,
      token,
    },
  };
}

export async function confirmar(db, env, producto, claveId, equipo, datos) {
  const token = String(datos.token || '');
  const tamano = parseInt(datos.tamano, 10);
  if (!token || !Number.isInteger(tamano) || tamano < 1) throw fallo(400, 'Falta el tamaño o el token de la subida');
  const row = await fila(db, producto, claveId);
  if (!row) throw fallo(404, 'No hay pedido de respaldo');
  if (row.estado === 'listo' && !row.token) return { ok: true, estado: 'listo', ya: true, tamano: row.tamano || tamano };
  if (row.estado !== 'pendiente' || row.token !== token || row.equipo !== equipo || row.subida_key !== claveSubida(producto, claveId, token)) {
    throw fallo(409, 'Este pedido de subida ya no está vigente');
  }
  if (vencido(row.token_expira)) throw fallo(409, 'La URL de subida venció');
  const obj = await env.RESPALDOS.head(row.subida_key);
  if (!obj) throw fallo(409, 'El archivo todavía no está en el depósito');
  if (obj.size !== tamano) throw fallo(409, 'El tamaño no coincide con el archivo subido');
  const meta = obj.customMetadata || {};
  if (meta.token && meta.token !== token) throw fallo(409, 'El archivo no corresponde a este pedido');
  if (meta.equipo && meta.equipo !== equipo) throw fallo(409, 'El archivo no corresponde a este equipo');
  const anterior = row.object_key;
  const nuevo = row.subida_key;
  const listo = ahora();
  const upd = await db.prepare(`UPDATE respaldos_licencia
    SET estado='listo', listo=?, tamano=?, object_key=?, subida_key=NULL, token=NULL, token_expira=NULL, error=NULL
    WHERE producto=? AND clave_id=? AND estado='pendiente' AND token=?`)
    .bind(listo, tamano, nuevo, producto, claveId, token).run();
  if (!upd.meta.changes) throw fallo(409, 'Este pedido de subida ya no está vigente');
  if (anterior && anterior !== nuevo) await borrarSiExiste(env, anterior);
  const estable = claveEstable(producto, claveId);
  if (nuevo !== estable) {
    try {
      await copiarObjeto(env, nuevo, estable);
      const movido = await db.prepare(
        'UPDATE respaldos_licencia SET object_key=? WHERE producto=? AND clave_id=? AND object_key=?'
      ).bind(estable, producto, claveId, nuevo).run();
      if (movido.meta.changes) await borrarSiExiste(env, nuevo);
    } catch (e) {
      // El nuevo ya quedó anotado. El nombre largo sigue siendo el vigente.
    }
  }
  return { ok: true, estado: 'listo', tamano };
}

export async function fallar(db, env, producto, claveId, equipo, datos) {
  const token = String(datos.token || '');
  const mensaje = String(datos.mensaje || 'No se pudo armar el respaldo').slice(0, 300);
  const row = await fila(db, producto, claveId);
  if (!row || row.estado !== 'pendiente' || row.token !== token || row.equipo !== equipo) return { ok: false, estado: row?.estado || null };
  await db.prepare(`UPDATE respaldos_licencia
    SET estado='error', error=?, token=NULL, token_expira=NULL, subida_key=NULL
    WHERE producto=? AND clave_id=? AND estado='pendiente' AND token=?`)
    .bind(mensaje, producto, claveId, token).run();
  if (row.subida_key && row.subida_key !== row.object_key) await borrarSiExiste(env, row.subida_key);
  return { ok: true, estado: 'error' };
}

export function nombreDescarga(producto, cliente, listo) {
  const marca = producto === 'mivet' ? 'MiVet' : 'MiPOS';
  const limpio = String(cliente || '')
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(String(listo || '')) ? String(listo).slice(0, 10) : '';
  return `${[marca, limpio || 'local', fecha].filter(Boolean).join(' ')}.zip`;
}

function disposicion(nombre) {
  const ascii = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '') || 'MiPOS local.zip';
  const estrella = encodeURIComponent(nombre).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${estrella}`;
}

export async function descarga(db, env, producto, claveId) {
  const row = await fila(db, producto, claveId);
  if (!row || row.estado !== 'listo' || !row.object_key) throw fallo(404, 'No hay un respaldo listo para descargar');
  const clave = await db.prepare(`SELECT cliente FROM ${tablaClaves(producto)} WHERE id=?`).bind(claveId).first();
  const nombre = nombreDescarga(producto, clave && clave.cliente, row.listo);
  const firmada = await urlFirmada(env, {
    method: 'GET',
    key: row.object_key,
    queryExtra: { 'response-content-disposition': disposicion(nombre) },
  });
  return { url: firmada.url, expira_en: EXPIRA_SEG, tamano: row.tamano || 0, listo: row.listo, nombre };
}

export async function rutaAdmin(db, env, producto, method, ruta) {
  let m = ruta.match(/^claves\/(\d+)\/respaldo$/);
  if (m && method === 'POST') return json(await pedir(db, env, producto, +m[1]));
  if (m && method === 'GET') return json(await ver(db, producto, +m[1]));
  m = ruta.match(/^claves\/(\d+)\/respaldo\/descarga$/);
  if (m && method === 'POST') return json(await descarga(db, env, producto, +m[1]));
  return null;
}
