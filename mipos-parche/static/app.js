'use strict';
/* MiPOS – interfaz web (Fases 1 a 3) */

const S = {
  token: null, user: null, cfg: {}, caja: null, cajaId: null,
  carrito: [], vista: 'venta', ultimoTicket: '', modales: [],
};
try { S.token = localStorage.getItem('mipos_token'); S.cajaId = localStorage.getItem('mipos_caja'); } catch (e) { /* sin almacenamiento */ }

// ------------------------------------------------------------------ apariencia (por equipo)
const ACENTOS = [['cobalto', 'Cobalto'], ['uva', 'Uva'], ['menta', 'Menta'], ['tomate', 'Tomate']];
const ESTILOS = [
  ['neutro', 'Neutro para caja', 'Limpio y claro, sin amarillo. (Recomendado)'],
  ['windows-claro', 'Windows 11 claro', 'Gris suave, azul y total azul claro.'],
  ['windows-oscuro', 'Windows 11 oscuro', 'Gris carbón y total neutro.'],
  ['clasico', 'MiPOS original', 'Conserva los colores y el total de MiPOS.'],
];
const preferenciasApariencia = {};
function leerPref(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
function prefApariencia(k, d) { return preferenciasApariencia[k] || leerPref(k, d); }
function guardarApariencia(k, v) {
  preferenciasApariencia[k] = v;
  try { localStorage.setItem(k, v); }
  catch (e) { toast('La apariencia se aplicó, pero no se pudo guardar en este navegador. Al cerrar podría perderse.', 'aviso', 6000); }
  aplicarTema();
}
function aplicarTema() {
  const anterior = leerPref('mipos_tema', '') || leerPref('mipos_acento', '');
  const elegido = prefApariencia('mipos_estilo', anterior ? 'clasico' : 'neutro');
  const estilo = ESTILOS.some(([k]) => k === elegido) ? elegido : 'neutro';
  const t = prefApariencia('mipos_tema', 'claro');
  const oscuro = estilo === 'windows-oscuro' || (estilo !== 'windows-claro' &&
    (t === 'oscuro' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)));
  document.documentElement.dataset.estilo = estilo;
  document.documentElement.dataset.tema = oscuro ? 'oscuro' : 'claro';
  document.documentElement.dataset.acento = prefApariencia('mipos_acento', 'cobalto');
}
aplicarTema();
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);

const ICONOS = {
  venta: '<path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  ventas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  caja: '<rect x="3" y="11" width="18" height="9" rx="2"/><path d="M7 11V5h10v6M10 8h4M3 15h18"/>',
  cierres: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M4 10h16M8 14h3M8 17h6"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  productos: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  inventario: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  proveedores: '<path d="M2 6h11v10H2zM13 10h4l4 4v2h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  reportes: '<path d="M4 20V11M10 20V4M16 20v-7M2 20h20"/>',
  config: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  oferta: '<path d="M20 12l-8 8-9-9V3h8z"/><path d="M8 7.5h.01M15 9l-6 6M9.5 9.5h.01M14.5 14.5h.01"/>',
  balanza: '<path d="M12 3v18M5 21h14M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  celular: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>',
  soporte: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19a4 4 0 0 1-4 3h-2"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2.2-2.5 3.7M12 17.2v.1"/>',
  paleta: '<path d="M12 2a10 10 0 0 0-10 10c0 5.5 4.5 10 10 10a2.5 2.5 0 0 0 2.5-2.5c0-.7-.3-1.3-.7-1.7-.4-.4-.7-1-.7-1.8 0-1.4 1.1-2.5 2.5-2.5h1.9c3.6 0 6.5-2.9 6.5-6.5A10 10 0 0 0 12 2z"/><circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="12" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="10.5" r="1.5" fill="currentColor"/>',
};
const icono = k => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[k] || ''}</svg>`;
const LOGO = '<svg viewBox="0 0 40 40" class="logo-svg" aria-hidden="true"><path d="M6 20 17 6h17v28H17z" fill="var(--etiqueta)"/><circle cx="16" cy="20" r="3" fill="var(--tinta)"/><text x="27" y="26" text-anchor="middle" font-size="15" font-weight="800" fill="var(--tinta)" font-family="Bricolage, sans-serif">$</text></svg>';

// ------------------------------------------------------------------ utilidades
const $ = (sel, root = document) => root.querySelector(sel);
// Boleta/factura electrónica: apagada en esta versión (cada venta imprime su ticket); el servidor lo informa
const conDte = () => !!(S.cfg && S.cfg.dte_disponible === '1');
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clp = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CL');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function formatearRut(valor) {
  const limpio = String(valor || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (limpio.length < 2) return limpio;
  return limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + limpio.slice(-1);
}
function formatearTelefonoChile(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.startsWith('00569')) digitos = digitos.slice(5);
  else if (digitos.startsWith('569')) digitos = digitos.slice(3);
  else if (digitos.startsWith('56')) { digitos = digitos.slice(2); if (digitos.startsWith('9')) digitos = digitos.slice(1); }
  else if (digitos.startsWith('9')) digitos = digitos.slice(1);
  return '+569' + digitos.slice(-8);
}
function conectarFormatoRut(input) {
  input.value = formatearRut(input.value);
  input.addEventListener('input', () => { input.value = formatearRut(input.value); });
}
function conectarFormatoTelefono(input, prefijoVacio = true) {
  if (input.value.trim()) input.value = formatearTelefonoChile(input.value);
  else if (prefijoVacio) input.value = '+569';
  input.addEventListener('input', () => {
    if (!input.value.trim() && !prefijoVacio) return;
    input.value = formatearTelefonoChile(input.value);
  });
}
const entero = v => parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10) || 0;
const decimal = v => parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
const fmtCant = (c, granel) => granel ? Number(c).toLocaleString('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg' : String(Math.round(c));
const fmtStock = (c, granel) => granel ? Number(c).toLocaleString('es-CL', { maximumFractionDigits: 3 }) + ' kg' : Number(c).toLocaleString('es-CL', { maximumFractionDigits: 3 });
const hora = iso => iso ? new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
const fechaHora = iso => iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '';
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const redondear = t => { const r = t % 10; return r <= 5 ? t - r : t + 10 - r; };
const METODOS = [['efectivo', 'Efectivo'], ['debito', 'Débito'], ['credito', 'Crédito'], ['transferencia', 'Transferencia'], ['fiado', 'Fiado']];
const metodosCobro = () => METODOS.filter(([k]) => k !== 'transferencia' || S.cfg.transferencia_pago !== '0');
const noEf = q => Object.entries(q).filter(([k]) => k !== 'efectivo').reduce((a, [, v]) => a + v, 0);
const nombreMetodo = m => (METODOS.find(x => x[0] === m) || [m, m])[1];
const esAdmin = () => S.user && S.user.rol === 'admin';
function puedePanGranel() {
  return esAdmin() || !!(S.user && S.user.permisos && S.user.permisos.stock_pan_granel);
}

// Identidad de este navegador: la licencia cuenta cuántos equipos usan MiPOS a la vez (ver equipos.js)
let _idEquipoMemoria = null;
function idEquipoNavegador() {
  let id = null;
  try { id = localStorage.getItem('mipos_equipo_id'); } catch (e) { /* sin almacenamiento */ }
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = _idEquipoMemoria || ('eq-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''));
    _idEquipoMemoria = id;
    try { localStorage.setItem('mipos_equipo_id', id); } catch (e) { /* nada */ }
  }
  return id;
}

let operacionesCliente = 0;
async function api(ruta, opciones = {}) {
  const formulario = formularioEnviando || (ultimoEnvio && Date.now() - ultimoEnvio.t < 1500 ? ultimoEnvio.form : null);
  const operacion = (opciones.method || 'GET') !== 'GET' && !ruta.startsWith('/actualizacion/');
  if (operacion) operacionesCliente++;
  try {
    const resultado = await ejecutarApi(ruta, opciones);
    if (operacion && formulario) marcarFormularioGuardado(formulario);
    return resultado;
  }
  finally { if (operacion) operacionesCliente--; }
}

const formulariosEditados = new Map();
let formularioEnviando = null;
let ultimoEnvio = null; // { form, t }: respaldo para los formularios que esperan algo antes de guardar
let avisoSalida = null;
function fotoFormulario(f) {
  return JSON.stringify($$('input, select, textarea', f).filter(x => !['submit', 'button', 'hidden', 'search'].includes(x.type) && !x.classList?.contains('scan') && !x.closest?.('#cfg-apariencia'))
    .map(x => [x.name || x.id, x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.value]));
}
function marcarFormularioGuardado(f) {
  if (f.isConnected) formulariosEditados.set(f, fotoFormulario(f));
  else formulariosEditados.delete(f);
}
function formularioProtegido(f) {
  return !!f && !f.matches('[data-sin-aviso-cambios], #f-login, #f-cobro, #f-activar');
}
function formulariosSinGuardar(root = document) {
  return [...formulariosEditados].filter(([f, foto]) => {
    if (!f.isConnected) { formulariosEditados.delete(f); return false; }
    return root.contains(f) && fotoFormulario(f) !== foto;
  }).map(([f]) => f);
}
function permitirSalidaFormulario(root = document) {
  const pendientes = formulariosSinGuardar(root);
  if (!pendientes.length) return Promise.resolve(true);
  if (!avisoSalida) avisoSalida = confirmarSalidaSinGuardar(pendientes).finally(() => { avisoSalida = null; });
  return avisoSalida.then(async eleccion => {
    if (eleccion === 'descartar') { pendientes.forEach(marcarFormularioGuardado); return true; }
    if (eleccion === 'guardar') return guardarFormulariosPendientes(pendientes);
    return false; // 'seguir': se queda en el formulario
  });
}
// Envía el formulario con el mismo botón Guardar (valida y guarda igual que si lo pulsaras tú).
// Devuelve false si el navegador frenó el envío porque falta un dato obligatorio.
function enviarFormularioYSalir(f) {
  let enviado = false;
  const marca = () => { enviado = true; };
  f.dataset.alGuardarSalir = '1'; // le avisa al formulario que no debe quedar abierto para seguir agregando
  f.addEventListener('submit', marca, { once: true });
  try { f.requestSubmit(); } catch (e) { /* sin envío */ }
  f.removeEventListener('submit', marca);
  if (!enviado) delete f.dataset.alGuardarSalir;
  return enviado;
}
const formularioLimpio = f => !f.isConnected || fotoFormulario(f) === formulariosEditados.get(f);
async function guardarFormulariosPendientes(forms) {
  for (const f of forms) {
    if (formularioLimpio(f)) continue;
    if (!enviarFormularioYSalir(f)) return false;
    const t0 = Date.now();
    let vioOperacion = false;
    while (Date.now() - t0 < 20000) {
      await new Promise(r => setTimeout(r, 80));
      if (operacionesCliente > 0) vioOperacion = true;
      if (formularioLimpio(f)) break;
      // terminó de guardar pero el formulario sigue con cambios: hubo un error (ya se mostró) o faltaba un dato
      if (operacionesCliente === 0 && (vioOperacion || Date.now() - t0 > 600)) break;
    }
    if (!formularioLimpio(f)) { delete f.dataset.alGuardarSalir; return false; }
  }
  return true;
}
document.addEventListener('focusin', e => {
  const f = e.target.closest('form') || e.target.closest('.entrada-grid');
  if (formularioProtegido(f) && !formulariosEditados.has(f)) formulariosEditados.set(f, fotoFormulario(f));
});
document.addEventListener('submit', e => {
  formularioEnviando = e.target;
  ultimoEnvio = { form: e.target, t: Date.now() };
  // Ojo: con un clic real el navegador vacía los microtasks entre un listener y el siguiente, así que
  // limpiar con queueMicrotask borraba la marca ANTES de que el formulario guardara y, al terminar,
  // MiPOS creía que seguía con cambios sin guardar. setTimeout deja pasar el handler del formulario.
  setTimeout(() => { formularioEnviando = null; }, 0);
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest('.rail nav button, .subtabs button, #btn-salir');
  if (!b || !formulariosSinGuardar().length) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (avisoSalida) return;
  permitirSalidaFormulario().then(ok => { if (ok && b.isConnected) b.click(); });
}, true);
window.addEventListener('beforeunload', e => {
  if (formulariosSinGuardar().length) { e.preventDefault(); e.returnValue = ''; }
});

async function ejecutarApi(ruta, { method = 'GET', body, timeout } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (S.cajaId) headers['X-Caja'] = S.cajaId;
  headers['X-MiPOS-Equipo'] = idEquipoNavegador();
  let r;
  try {
    const signal = timeout > 0 ? AbortSignal.timeout(timeout) : undefined;
    r = await fetch('/api' + ruta, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    // Sin conexión con el PC principal: la venta sigue con la copia guardada en esta caja (sinred.js)
    const local = typeof respuestaSinRed === 'function' ? respuestaSinRed(ruta, method, body) : undefined;
    if (local !== undefined) return local;
    throw new Error(S.token ? 'Sin conexión con el PC principal: esto no se puede hacer hasta que vuelva la red. Vender sí se puede.'
      : 'No hay conexión con el servidor de MiPOS');
  }
  if (typeof SINRED !== 'undefined' && SINRED.activo) volvioLaRed();
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && ruta !== '/login' && ruta !== '/me/clave') {
    cerrarSesionLocal();
    throw new Error(data.error || 'Sesión expirada');
  }
  if (r.status === 403 && data.licencia) {
    // la licencia dejó de ser válida (venció, cambió el equipo, etc.)
    S.modales.slice().forEach(m => m.cerrar());
    api('/licencia/estado').then(renderActivacion).catch(() => {});
    throw new Error(data.error);
  }
  if (r.status === 403 && data.equipos_completo) {
    // la licencia ya tiene todos sus equipos en uso: este no puede entrar hasta que se libere uno
    renderEquiposCompleto(data);
    throw Object.assign(new Error(''), { data, status: 403 });  // sin mensaje: la pantalla ya lo explica
  }
  if (r.status === 409 && /asignado a una caja/.test(data.error || '')) {
    // la caja de este equipo fue desactivada: volver a elegir
    guardarCaja(null);
    cerrarSesionLocal();
  }
  if (r.status === 403 && data.autorizacion && body && typeof body === 'object' && !Array.isArray(body)) {
    // el cajero no tiene permiso: un administrador autoriza con su usuario y clave, y se reintenta
    const cred = await pedirAutorizacion(data, ruta, method, body);
    if (!cred) throw Object.assign(new Error('Operación cancelada: faltó la autorización'), { data: {}, cancelada: true });
    return cred.resultado;
  }
  if (!r.ok) throw Object.assign(new Error(data.error || 'Error ' + r.status), { data, status: r.status });
  if (Array.isArray(data.imprimir_agente)) imprimirConAgente(data.imprimir_agente, data.ticket_texto);
  return data;
}

// Agente de impresión de esta caja: imprime directo en la impresora de este PC, sin diálogo, sin compartirla y sin internet
const AGENTE_URL = 'http://127.0.0.1:8009';
async function enviarAlAgente(cuerpo) {
  // text/plain evita la consulta previa (preflight) del navegador
  const r = await fetch(AGENTE_URL + '/imprimir', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'El agente de impresión respondió ' + r.status);
}
async function imprimirConAgente(tickets, textoRespaldo) {
  operacionesCliente++;
  try { for (const t of tickets) await enviarAlAgente({ datos_b64: t }); }
  catch (e) {
    if (textoRespaldo) {
      toast('No se pudo usar el agente de impresión de este PC (' + e.message + '). Se abre el diálogo de impresión.', 'aviso', 6000);
      imprimirEnNavegador(textoRespaldo, null, { sinAgente: true });
    } else toast('No se pudo imprimir: ' + e.message, 'aviso', 6000);
  } finally { operacionesCliente--; }
}

// Pide usuario y clave de un administrador y reintenta la operación con ellos
function pedirAutorizacion(info, ruta, method, body) {
  return new Promise(resolve => {
    let resuelto = false;
    const m = modal(`<form class="form" data-sin-aviso-cambios><h2>${icono('candado')} Necesita autorización</h2>
      <div class="aviso" style="display:block">${esc(info.error || 'Esta acción necesita la autorización de un administrador')}</div>
      ${info.detalle ? `<div class="det">${esc(info.detalle)}</div>` : ''}
      <div class="det">Un administrador escribe su usuario y clave. Queda anotado en la bitácora.</div>
      <div class="grid2"><label>Usuario administrador<input name="u" autocomplete="off" autofocus></label>
        <label>Clave<input name="c" type="password" autocomplete="off"></label></div>
      <div id="au-err" class="det dif-neg"></div>
      <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Autorizar</button></div></form>`,
      { alCerrar: () => { if (!resuelto) resolve(null); } });
    $('form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const btn = $('button.primario', f); btn.disabled = true;
      try {
        const resultado = await api(ruta, { method, body: { ...body, admin_usuario: f.u.value.trim(), admin_clave: f.c.value } });
        resuelto = true; m.cerrar(); resolve({ resultado });
      } catch (err) {
        btn.disabled = false;
        if (err.cancelada) return;
        if (err.status === 403 && /incorrect/.test(err.message)) { $('#au-err', m.el).textContent = err.message; f.c.value = ''; f.c.focus(); return; }
        resuelto = true; m.cerrar(); resolve({ resultado: Promise.reject(err) });
      }
    });
  });
}

function toast(msg, tipo = 'ok', ms = 2600) {
  if (!msg) return;
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function modal(html, { ancho = false, alCerrar } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${ancho ? 'ancho' : ''}">${html}</div>`;
  document.body.appendChild(ov);
  const m = {
    el: ov.firstElementChild,
    cerrar() {
      if (!ov.isConnected || m._cerrando) return;
      if (formulariosSinGuardar(m.el).length) {
        m._cerrando = true;
        permitirSalidaFormulario(m.el).then(ok => {
          m._cerrando = false;
          if (ok && ov.isConnected) m.cerrar();
        });
        return;
      }
      ov.remove();
      S.modales = S.modales.filter(x => x !== m);
      if (alCerrar) alCerrar();
      if (!S.modales.length) enfocarScan();
    },
  };
  S.modales.push(m);
  ov.addEventListener('mousedown', e => { if (e.target === ov) m.cerrar(); });
  $$('[data-cerrar]', ov).forEach(b => b.addEventListener('click', () => m.cerrar()));
  setTimeout(() => { const f = $('[autofocus]', ov) || $('input, select, textarea', ov); if (f) { f.focus(); if (f.select) f.select(); } }, 30);
  return m;
}

function pedir(titulo, { label = '', valor = '', ayuda = '', modo = 'text' } = {}) {
  return new Promise(resolve => {
    let resuelto = false;
    const m = modal(`<form class="form" data-sin-aviso-cambios><h2>${esc(titulo)}</h2>
      <label>${esc(label)}<input name="v" value="${esc(valor)}" inputmode="${modo}" autocomplete="off" autofocus></label>
      ${ayuda ? `<div class="det">${esc(ayuda)}</div>` : ''}
      <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Aceptar</button></div></form>`,
      { alCerrar: () => { if (!resuelto) resolve(null); } });
    $('form', m.el).addEventListener('submit', e => {
      e.preventDefault();
      resuelto = true;
      const v = $('[name=v]', m.el).value.trim();
      m.cerrar();
      resolve(v);
    });
  });
}

function confirmar(texto, { si = 'Sí', peligro = false } = {}) {
  return new Promise(resolve => {
    let resuelto = false;
    const m = modal(`<h2>${esc(texto)}</h2><div class="acciones">
      <button class="btn" data-cerrar>No</button><button class="btn ${peligro ? 'peligro' : 'primario'}" id="cf-si" autofocus>${esc(si)}</button></div>`,
      { alCerrar: () => { if (!resuelto) resolve(false); } });
    $('#cf-si', m.el).addEventListener('click', () => { resuelto = true; m.cerrar(); resolve(true); });
  });
}

function confirmarSalidaSinGuardar(pendientes = []) {
  return new Promise(resolve => {
    let resuelto = false;
    const formas = pendientes.filter(f => f && f.isConnected);
    const puedeGuardar = formas.length > 0 && formas.every(f => f.tagName === 'FORM');
    const f0 = formas.length === 1 ? formas[0] : null;
    const titulo = f0 ? ((f0.querySelector('h2') || (f0.closest('.modal') || document.createElement('i')).querySelector('h2') || {}).textContent || '').trim() : '';
    const nombre = f0 && f0.elements && f0.elements.nombre && f0.elements.nombre.value ? f0.elements.nombre.value.trim() : '';
    const donde = titulo ? ` en <strong>${esc(titulo)}</strong>${nombre ? ` (“${esc(nombre)}”)` : ''}` : '';
    const m = modal(`<h2>¿Guardar antes de salir?</h2>
      <div class="det">Tienes cambios sin guardar${donde}. Si los descartas, se pierde lo que escribiste.</div>
      <div class="acciones aviso-salida">
        <button type="button" class="btn descartar" id="cf-descartar">Descartar</button>
        <button type="button" class="btn neutro" id="cf-seguir" ${puedeGuardar ? '' : 'autofocus'}>Seguir editando</button>
        ${puedeGuardar ? '<button type="button" class="btn" id="cf-guardar" autofocus>Guardar y salir</button>' : ''}
      </div>`,
      { alCerrar: () => { if (!resuelto) resolve('seguir'); } });
    m.el.style.maxWidth = '580px'; // que los tres botones quepan en una sola fila
    const elegir = r => () => { resuelto = true; m.cerrar(); resolve(r); };
    $('#cf-seguir', m.el).addEventListener('click', elegir('seguir'));
    $('#cf-descartar', m.el).addEventListener('click', elegir('descartar'));
    const g = $('#cf-guardar', m.el);
    if (g) g.addEventListener('click', elegir('guardar'));
  });
}

function mostrarTicket(titulo, texto, extraHtml = '') {
  return modal(`<h2>${esc(titulo)}</h2>${extraHtml}${htmlLogoTicket()}<pre class="ticket" style="max-height:60vh">${esc(texto)}</pre>
    <div class="acciones"><button class="btn primario" data-cerrar autofocus>Cerrar</button></div>`);
}

async function imprimirDatosTransferencia(monto = 0) {
  if (S.cfg.transferencia_imprimir !== '1') return toast('La impresión de datos de transferencia está deshabilitada en Ajustes.', 'aviso');
  const hayDatosBanco = ['transferencia_titular', 'transferencia_rut', 'transferencia_banco',
    'transferencia_tipo_cuenta', 'transferencia_numero'].some(k => S.cfg[k]);
  if (!hayDatosBanco) return toast('Configura los datos bancarios en Ajustes para imprimirlos.', 'aviso', 5000);
  try {
    const r = await api('/impresora/transferencia', { method: 'POST', body: { monto } });
    if (['navegador', 'ninguna'].includes(r.modo)) imprimirEnNavegador(r.ticket_texto);
    else if (r.impresion_error) avisarImpresion(r);
    else toast('Datos de transferencia enviados a la impresora');
  } catch (err) { toast(err.message, 'error'); }
}

function guardarCaja(id) {
  S.cajaId = id ? String(id) : null;
  try { if (id) localStorage.setItem('mipos_caja', String(id)); else localStorage.removeItem('mipos_caja'); } catch (e) { /* nada */ }
}
const cajasVarias = () => S.cfg.cajas_varias === '1';
const imprimeNavegador = () => S.cfg.impresora_modo === 'navegador';

async function descargar(ruta) {
  const r = await fetch('/api' + ruta, { headers: { Authorization: 'Bearer ' + S.token,
    'X-MiPOS-Equipo': idEquipoNavegador(), ...(S.cajaId ? { 'X-Caja': S.cajaId } : {}) } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Error ' + r.status); }
  const blob = await r.blob();
  const m = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? m[1] : 'archivo';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// timbre: imagen PNG en base64 que entrega el proveedor; reemplaza el recuadro del timbre en el texto
function htmlLogoTicket() {
  const logo = S.cfg && S.cfg.ticket_logo;
  if (!logo || !/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(logo)) return '';
  return `<img class="logo-ticket" alt="" src="${esc(logo)}">`;
}
function imprimirEnNavegador(texto, timbrePng, { sinAgente = false } = {}) {
  if (!sinAgente && !timbrePng && S.cfg && S.cfg.impresora_modo === 'agente') {
    // también funciona sin red: el ticket de una venta hecha sin red sale directo, sin diálogo
    enviarAlAgente({ texto }).catch(() => imprimirEnNavegador(texto, timbrePng, { sinAgente: true }));
    return;
  }
  const anterior = document.getElementById('ticket-impresion');
  if (anterior) anterior.remove();
  let cuerpo = `${htmlLogoTicket()}<pre>${esc(texto)}</pre>`;
  if (timbrePng) {
    const lineas = texto.split('\n');
    const ini = lineas.findIndex(l => /^\s*\+-+\+$/.test(l));
    const fin = ini >= 0 ? lineas.findIndex((l, i) => i > ini && /^\s*\+-+\+$/.test(l)) : -1;
    if (ini >= 0 && fin > ini) {
      cuerpo = `<pre>${esc(lineas.slice(0, ini).join('\n'))}</pre><div style="text-align:center"><img src="data:image/png;base64,${timbrePng}" style="width:62mm;image-rendering:pixelated"></div><pre>${esc(lineas.slice(fin + 1).join('\n'))}</pre>`;
    }
  }
  const estilo = document.createElement('style');
  estilo.id = 'ticket-impresion-estilo';
  estilo.textContent = '@page{margin:4mm} @media screen{#ticket-impresion{display:none}} @media print{body>*:not(#ticket-impresion){display:none!important}#ticket-impresion{display:block!important;position:absolute;inset:0;background:white;color:black}#ticket-impresion pre{font:12px/1.3 Consolas,"Courier New",monospace;white-space:pre;margin:0}#ticket-impresion .logo-ticket{display:block;margin:0 auto 6px;max-width:48mm;max-height:22mm;object-fit:contain}}';
  const hojaVieja = document.getElementById(estilo.id);
  if (hojaVieja) hojaVieja.remove();
  document.head.appendChild(estilo);
  const zona = document.createElement('section');
  zona.id = 'ticket-impresion';
  zona.innerHTML = cuerpo;
  document.body.appendChild(zona);
  let termino = false;
  const limpiar = () => {
    if (termino) return;
    termino = true;
    zona.remove(); estilo.remove();
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar, { once: true });
  window.focus();
  window.print();
  setTimeout(limpiar, 60000);
}

// Imprime una venta: en la térmica si está configurada, si no por el navegador (cualquier impresora)
async function imprimirVenta(id) {
  try {
    if (S.cfg.impresora_modo && !['ninguna', 'navegador'].includes(S.cfg.impresora_modo)) {
      const r = await api(`/ventas/${id}/reimprimir`, { method: 'POST' });
      if (r.impresion_error) avisarImpresion(r); else toast('Ticket enviado a la impresora');
    } else {
      const v = await api('/ventas/' + id);
      imprimirTicketVenta(v);
    }
  } catch (e) { toast(e.message, 'error'); }
}

// Imprime por el navegador una venta (con el timbre de la boleta si el proveedor lo entregó como imagen)
function imprimirTicketVenta(v) {
  const docTimbre = v.estado === 'anulada'
    ? (v.documentos || []).filter(d => d.tipo === 61 && d.estado === 'emitido').pop() || v.boleta
    : v.boleta;
  const png = docTimbre && docTimbre.timbre_tipo === 'imagen' ? docTimbre.ted : null;
  if (docTimbre && docTimbre.estado === 'emitido' && ['xml', 'xml_b64'].includes(docTimbre.timbre_tipo) && !png) {
    toast('El timbre PDF417 solo sale en impresora térmica. Usa una térmica en esta caja o el PDF del proveedor.', 'aviso', 7000);
  }
  imprimirEnNavegador(v.ticket_texto, png);
}

function avisarImpresion(r) {
  if (r && r.impresion_error) toast('No se pudo imprimir: ' + r.impresion_error, 'aviso', 6000);
}

// ------------------------------------------------------------------ sesión
function cerrarSesionLocal() {
  S.token = null; S.user = null;
  S.carrito = []; S.clienteVenta = null;
  if (typeof ESPERA !== 'undefined') ESPERA.lista = null;  // las ventas en espera quedan guardadas en esta caja
  try { localStorage.removeItem('mipos_token'); } catch (e) { /* nada */ }
  S.modales.slice().forEach(m => m.cerrar());
  renderLogin();
}

async function iniciar() {
  await entrar();
}

async function entrar() {
  try {
    S.lic = await api('/licencia/estado');
    if (!S.lic.valida) return renderActivacion(S.lic);
  } catch (e) { /* sin conexión: el login mostrará el error */ }
  if (S.token) {
    try {
      S.user = await api('/me');
      await cargarBase();
      return renderApp();
    } catch (e) { /* token vencido */ }
  }
  renderLogin();
}

async function cargarBase() {
  S.cfg = await api('/config');
  await refrescarCaja();
}

function textoEstadoCaja() {
  const nombre = cajasVarias() ? (S.cfg.terminal_nombre || 'Caja') : 'Caja';
  return `${nombre} ${S.caja ? 'abierta' : 'cerrada'}`;
}

async function refrescarCaja() {
  const d = await api('/caja/estado');
  S.caja = d.abierta ? d : null;
  if (typeof guardarSesionSinRed === 'function' && !(typeof SINRED !== 'undefined' && SINRED.activo)) guardarSesionSinRed();
  const b = $('#estado-caja');
  if (b) { b.className = 'estado-caja ' + (S.caja ? 'abierta' : 'cerrada'); b.textContent = textoEstadoCaja(); }
  return d;
}

// ------------------------------------------------------------------ activación (licencia por equipo)
function enlacesContacto(lic, { texto = 'Pide tu código de activación a', mensaje } = {}) {
  const c = lic.contacto || {};
  const wa = String(c.whatsapp || '').replace(/[^\d]/g, '');
  const msg = encodeURIComponent(mensaje || `Hola, quiero activar MiPOS. Código de equipo: ${lic.id_equipo}`);
  if (!wa && !c.email && !c.sitio && !c.nombre) return '';
  return `<div class="contacto">
      <div class="det">${esc(texto)}</div>
      <strong>${esc(c.nombre || 'tu proveedor de MiPOS')}</strong>
      <div class="contacto-btns">
        ${wa ? `<a class="btn primario" href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener">WhatsApp ${esc(c.whatsapp)}</a>` : ''}
        ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('MiPOS')}&body=${msg}">${esc(c.email)}</a>` : ''}
        ${c.sitio ? `<a class="btn" href="${esc(c.sitio)}" target="_blank" rel="noopener">${esc(c.sitio.replace(/^https?:\/\//, ''))}</a>` : ''}
      </div></div>`;
}

// Clave de producto: "MIPOS-" va fijo al lado; aquí se escriben las 12 letras/números (7K3D-QX9P-4MRT).
// Las claves nunca contienen I ni O, así que si alguien escribe o pega "MIPOS…" se descarta ese prefijo.
function letrasClave(v) {
  const t = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith('MIPOS')) return t.slice(5, 17);
  return /^M(I(P(O)?)?)?$/.test(t) && t.length > 1 ? t : t.slice(0, 12);  // "MIP…" a medio escribir: se espera
}
const campoClave = (nombre, extra = '') => `<div class="clave-caja"><span>MIPOS-</span><input ${nombre} placeholder="XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" ${extra}></div>`;
function formatearClave(inp) {
  inp.addEventListener('input', () => { inp.value = (letrasClave(inp.value).match(/.{1,4}/g) || []).join('-'); });
}

function renderActivacion(lic) {
  S.lic = lic;
  const enLinea = lic.en_linea && lic.configurado !== false;
  const grave = lic.motivo && /venció|otro computador|atrasada|suspendida|desvinculado|eliminada|Terminó/.test(lic.motivo);
  const sinConexion = /sin internet|no se pudo renovar|atrasada/.test(lic.motivo || '');
  const pruebaUsada = /prueba/i.test(lic.motivo || '') || lic.revocada || !!lic.tipo;
  const bloqueManual = `<div class="id-equipo"><span>Código de este equipo</span>
        <strong id="a-id">${esc(lic.id_equipo)}</strong>
        <button type="button" class="btn chico" id="a-copiar">Copiar</button></div>
      ${enlacesContacto(lic)}
      <label>Código de activación<textarea name="codigo" rows="4" placeholder="Pega aquí el código que te enviaron (empieza con MIPOS1.)" spellcheck="false"></textarea></label>
      <button class="btn ${enLinea ? '' : 'primario grande'}" id="a-manual">Activar con este código</button>`;
  $('#app').innerHTML = `<div class="login">
    <section class="login-arte" aria-hidden="true">
      <div class="toldo"></div>
      <div class="login-marca">${LOGO}<h1>MiPOS</h1><p>La caja, el inventario y las ventas de tu almacén, en un solo lugar.</p></div>
      <div class="etiquetas-deco"><span class="tag-deco t1">$990</span><span class="tag-deco t2">$1.990</span><span class="tag-deco t3">2 x $1.500</span></div>
    </section>
    <form id="f-activar" class="activar-form">
      <h2>Activar MiPOS</h2>
      ${lic.motivo && lic.motivo !== 'Este equipo aún no está activado.' || !enLinea
        ? `<div class="aviso ${grave ? 'peligro' : ''}" style="display:block;margin:0">${esc(lic.motivo || 'Este equipo necesita activarse.')}</div>` : ''}
      ${lic.configurado === false ? '' : enLinea ? `
      ${sinConexion ? '<button type="button" class="btn primario grande" id="a-reintentar">Reintentar</button>' : ''}
      <label class="clave-producto">Clave de producto
        ${campoClave('id="a-clave"', sinConexion ? '' : 'autofocus')}</label>
      <button type="button" class="btn primario grande" id="a-activar">Activar</button>
      <div class="det">Necesita internet solo para activar. Después funciona aunque se corte la conexión.</div>
      ${lic.tienda ? `<button type="button" class="btn grande btn-comprar" id="a-comprar">Comprar licencia <small>con Mercado Pago · se activa sola</small></button>` : ''}
      ${pruebaUsada ? '' : `<div class="o-sep"><span>o</span></div>
      <button type="button" class="btn grande" id="a-prueba">Probar gratis</button>
      <div class="det" style="text-align:center">Sin compromiso. Al terminar la prueba ingresas tu clave y sigues con los mismos datos.</div>`}
      ${/prueba/i.test(lic.motivo || '')
        ? enlacesContacto(lic, { texto: '¿Te gustó MiPOS? Adquiere tu licencia con', mensaje: `Hola, terminé la prueba de MiPOS y quiero adquirir mi licencia. Código de equipo: ${lic.id_equipo}` })
        : enlacesContacto(lic, { texto: '¿No tienes clave? Pídela a', mensaje: 'Hola, quiero mi clave de producto de MiPOS.' })}
      <details class="sin-internet como-activar"><summary>¿Cómo activo MiPOS?</summary>
        <ol class="pasos-activar">
          <li><b>¿Quieres probarlo primero?</b> Presiona <b>Probar gratis</b>: tienes MiPOS completo, sin límites, por unos días. No pide datos.</li>
          <li><b>¿Ya lo compraste?</b> ${esc((lic.contacto || {}).nombre || 'Tu proveedor')} te envía una <b>clave de producto</b> por correo. Se ve así: <code>MIPOS-7K3D-QX9P-4MRT</code>.</li>
          <li>Escríbela arriba, en <b>Clave de producto</b> (el “MIPOS-” ya está puesto; mayúsculas y guiones se ponen solos) y presiona <b>Activar</b>.</li>
          <li>Listo: pasa a la pantalla de ingreso. La primera vez el usuario es <b>admin</b> y la clave <b>1234</b>; enseguida te pide crear la tuya.</li>
          <li>Necesitas internet solo para activar. Después funciona sin conexión; cuando haya internet, la licencia se renueva sola.</li>
        </ol>
        <div class="det">Si estabas probando, al activar la clave sigues con todo lo que ya cargaste. Si sale “la clave ya está activada en otro computador” (cambiaste de PC o reinstalaste Windows), pide a ${esc((lic.contacto || {}).nombre || 'tu proveedor')} que la libere.</div>
      </details>
      <details class="sin-internet"><summary>¿Este PC no tiene internet? Activar con código</summary>${bloqueManual}</details>`
      : bloqueManual}
    </form></div>`;
  const cp = $('#a-copiar');
  if (cp) cp.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(lic.id_equipo); toast('Código copiado'); }
    catch (e) { const r = document.createRange(); r.selectNode($('#a-id')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selecciónalo y copia con Ctrl+C', 'aviso'); }
  });
  const listo = l => { S.lic = l; toast(l.tipo === 'prueba' ? `Prueba gratis activada${l.dias_restantes !== null ? ': ' + (l.dias_restantes + 1) + ' días' : ''}` : `MiPOS activado para ${l.cliente}`, 'ok', 5000); renderLogin(); };
  const conBoton = (b, texto, fn) => b && b.addEventListener('click', async () => {
    const antes = b.textContent; b.disabled = true; b.textContent = texto;
    try { await fn(); } catch (err) { toast(err.message, 'error', 8000); }
    b.disabled = false; b.textContent = antes;
  });
  const clave = $('#a-clave');
  if (clave) {
    formatearClave(clave);
    clave.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#a-activar').click(); } });
  }
  conBoton($('#a-activar'), 'Activando…', async () => {
    if (letrasClave(clave.value).length !== 12) { clave.focus(); throw new Error('Escribe la clave completa: son 12 letras o números'); }
    listo(await api('/licencia/clave', { method: 'POST', body: { clave: 'MIPOS-' + letrasClave(clave.value) } }));
  });
  const ac = $('#a-comprar'); if (ac) ac.addEventListener('click', () => comprarLicencia());
  conBoton($('#a-prueba'), 'Activando prueba…', async () => listo(await api('/licencia/prueba', { method: 'POST', body: {} })));
  conBoton($('#a-reintentar'), 'Conectando…', async () => {
    const l = await api('/licencia/renovar', { method: 'POST', body: {} });
    if (l.valida) { S.lic = l; toast('Licencia renovada'); renderLogin(); } else renderActivacion(l);
  });
  const f = $('#f-activar');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!f.codigo || !f.codigo.value.trim()) return toast('Pega el código de activación', 'error');
    try {
      S.lic = await api('/licencia/activar', { method: 'POST', body: { codigo: f.codigo.value } });
      toast(`MiPOS activado para ${S.lic.cliente}`, 'ok', 5000);
      renderLogin();
    } catch (err) { toast(err.message, 'error', 7000); }
  });
}

// Ingresar la clave de producto con MiPOS ya funcionando (por ejemplo, al terminar o durante la prueba)
function pedirClaveProducto(alActivar) {
  const c = (S.lic && S.lic.contacto) || {};
  const m = modal(`<form class="form"><h2>Clave de producto</h2>
    <div class="det">Escribe la clave que te entregó ${esc(c.nombre || 'tu proveedor')}. Todo lo que ya cargaste se mantiene.</div>
    <label class="clave-producto">Clave${campoClave('name="clave"', 'autofocus')}</label>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Activar</button></div></form>`);
  const f = $('form', m.el);
  formatearClave(f.clave);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (letrasClave(f.clave.value).length !== 12) return toast('Escribe la clave completa: son 12 letras o números', 'error');
    try {
      S.lic = await api('/licencia/clave', { method: 'POST', body: { clave: 'MIPOS-' + letrasClave(f.clave.value) } });
      m.cerrar(); toast(`¡Gracias! MiPOS quedó activado para ${S.lic.cliente}`, 'ok', 6000);
      const chip = $('#demo-chip'); if (chip) chip.remove();
      pintarAvisoLicencia();
      if (alActivar) alActivar();
    } catch (err) { toast(err.message, 'error', 8000); }
  });
}

// Compra o renovación con Mercado Pago: abre la página de pago con el código de este PC y espera.
// Al confirmarse el pago, el servidor activa este PC y MiPOS lo detecta solo (no hay que escribir la clave).
function comprarLicencia() {
  if ($('#ep-estado')) return;
  const l = S.lic || {};
  if (!l.tienda) { const w = linkComprar(); if (w) window.open(w, '_blank'); return; }
  const antes = { tipo: l.tipo, contrato: l.contrato, cajas: l.cajas, valida: l.valida };
  window.open(`${l.tienda}?equipo=${encodeURIComponent(l.id_equipo)}`, '_blank');
  let activo = true, intentos = 0, timer = null;
  const m = modal(`<div class="espera-pago">
    <div class="cargando-anillo" aria-hidden="true"></div>
    <h2>Completa el pago en la página que se abrió</h2>
    <p class="det">Elige tu plan y paga con Mercado Pago. Cuando el pago se confirme, <b>MiPOS se activa solo</b> en este computador
      y te llega la clave por correo. No cierres esta ventana.</p>
    <div class="det" id="ep-estado">Esperando el pago…</div>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button>
      <button type="button" class="btn" id="ep-abrir">Abrir de nuevo la página de pago</button>
      <button type="button" class="btn primario" id="ep-ya">Ya pagué</button></div></div>`, { alCerrar: () => { activo = false; clearTimeout(timer); } });
  $('#ep-abrir', m.el).addEventListener('click', () => window.open(`${l.tienda}?equipo=${encodeURIComponent(l.id_equipo)}`, '_blank'));
  const revisar = async () => {
    if (!activo) return;
    clearTimeout(timer);
    intentos++;
    try {
      const r = await api('/licencia/buscar-compra', { method: 'POST', body: {} });
      const cambio = r.valida && r.tipo === 'clave' && (antes.tipo !== 'clave' || !antes.valida || r.contrato !== antes.contrato || r.cajas !== antes.cajas);
      if (cambio) {
        activo = false; m.cerrar(); S.lic = r;
        const chip = $('#demo-chip'); if (chip) chip.remove();
        pintarAvisoLicencia();
        await confirmar(`¡Pago recibido, gracias! MiPOS quedó activado${r.contrato ? ' hasta el ' + new Date(r.contrato + 'T12:00').toLocaleDateString('es-CL') : ''} con ${r.cajas} caja${r.cajas === 1 ? '' : 's'}.`, { si: 'Seguir' });
        if (S.user) { if (S.vista === 'config') VISTAS.config(); } else renderLogin();
        return;
      }
      const e = $('#ep-estado', m.el); if (e) e.textContent = 'Esperando la confirmación del pago… (se revisa sola cada pocos segundos)';
    } catch (err) {
      const e = $('#ep-estado', m.el); if (e) e.textContent = err.message;
    }
    if (activo && intentos < 450) timer = setTimeout(revisar, 4000);  // hasta ~30 minutos
  };
  $('#ep-ya', m.el).addEventListener('click', revisar);
  timer = setTimeout(revisar, 6000);
}

// Enlace de WhatsApp al vendedor para comprar la licencia
function linkComprar() {
  const c = (S.lic && S.lic.contacto) || {};
  const wa = String(c.whatsapp || '').replace(/[^\d]/g, '');
  if (!wa) return c.email ? `mailto:${c.email}?subject=${encodeURIComponent('Licencia de MiPOS')}` : '';
  return `https://wa.me/${wa}?text=${encodeURIComponent(`Hola, estoy probando MiPOS y me gustó. Quiero adquirir mi licencia. Código de equipo: ${S.lic.id_equipo}`)}`;
}
const diasPrueba = l => l && l.tipo === 'prueba' && l.dias_restantes !== null && l.dias_restantes !== undefined ? l.dias_restantes + 1 : null;

function chipPrueba() {
  const n = diasPrueba(S.lic);
  if (n === null) return '';
  return `<div id="demo-chip" class="demo-chip ${n <= 3 ? 'urgente' : ''}" role="status" title="Versión de prueba. Las opciones están en la franja de arriba.">Prueba<b>${n} día${n === 1 ? '' : 's'}</b></div>`;
}

const diasHasta = f => f ? Math.round((new Date(f + 'T12:00') - new Date(hoyISO() + 'T12:00')) / 86400000) : null;

// Franja fija, del mismo tipo que la de actualización: no tapa la pantalla.
function pintarAvisoLicencia() {
  const box = $('#licencia-aviso');
  if (!box) return;
  const l = S.lic;
  const dias = n => `${n} día${n === 1 ? '' : 's'}`;
  const lineas = [];
  let acciones = '';
  let urgente = false;
  if (l && l.valida && l.tipo === 'prueba') {
    const n = diasPrueba(l);
    if (n !== null) {
      urgente = n <= 3;
      const c = l.contacto || {};
      lineas.push(urgente
        ? `<strong>La prueba termina en ${dias(n)}.</strong> Activa tu licencia para seguir sin interrupciones. Lo que ya cargaste se conserva.`
        : `<strong>Prueba de MiPOS: quedan ${dias(n)}.</strong> Es el programa completo. Lo que cargues se conserva al comprar. Soporte de ${esc(c.nombre || 'tu proveedor')}.`);
      acciones = 'prueba';
    }
  } else if (l && l.valida) {
    const c = l.contacto || {};
    const quien = `${c.nombre || 'tu proveedor'}${c.whatsapp ? ' (' + esc(c.whatsapp) + ')' : ''}`;
    const contrato = diasHasta(l.contrato);
    if (contrato !== null && contrato <= 15) {
      urgente = contrato <= 7;
      lineas.push(l.tienda
        ? `<strong>Tu licencia vence en ${dias(Math.max(contrato, 0))}.</strong> Puedes renovarla desde aquí: el pago se aplica solo.`
        : `<strong>Tu licencia vence en ${dias(Math.max(contrato, 0))}.</strong> Renuévala con ${quien}.`);
      if (l.tienda) acciones = 'renovar';
    }
    if (l.requiere_conexion && l.dias_restantes !== null && l.dias_restantes <= 15) {
      urgente = urgente || l.dias_restantes <= 7;
      lineas.push(`<strong>Este PC lleva tiempo sin internet.</strong> Conéctalo para renovar la licencia (quedan ${dias(l.dias_restantes)}).`);
    }
  }
  box.classList.toggle('oculto', !lineas.length);
  box.classList.toggle('urgente', urgente && !!lineas.length);
  if (!lineas.length) { box.innerHTML = ''; return; }
  const comprar = linkComprar();
  const botones = acciones === 'prueba'
    ? `${l.tienda ? '<button type="button" class="btn chico" id="dm-comprar">Comprar licencia</button>' : comprar ? `<a class="btn chico" href="${comprar}" target="_blank" rel="noopener" id="dm-comprar">Comprar licencia</a>` : ''}
       <button type="button" class="btn chico" id="dm-clave">Ya tengo mi clave</button>`
    : acciones === 'renovar' ? '<button type="button" class="btn chico" id="dm-renovar">Renovar</button>' : '';
  box.innerHTML = `<span>${lineas.join('<br>')}</span>${botones ? `<div class="aviso-acciones">${botones}</div>` : ''}`;
  const dc = $('#dm-comprar', box);
  if (dc && l.tienda) dc.addEventListener('click', () => comprarLicencia());
  const renovar = $('#dm-renovar', box);
  if (renovar) renovar.addEventListener('click', () => comprarLicencia());
  const clave = $('#dm-clave', box);
  if (clave) clave.addEventListener('click', () => pedirClaveProducto(() => { if (S.vista === 'config') VISTAS.config(); }));
}

function renderLogin() {
  $('#app').innerHTML = `<div class="login">
    <section class="login-arte" aria-hidden="true">
      <div class="toldo"></div>
      <div class="login-marca">${LOGO}<h1>MiPOS</h1><p>La caja, el inventario y las ventas de tu almacén, en un solo lugar.</p></div>
      <div class="etiquetas-deco"><span class="tag-deco t1">$990</span><span class="tag-deco t2">$1.990</span><span class="tag-deco t3">2 x $1.500</span></div>
    </section>
    <form id="f-login">
    <h2>Ingresar</h2>
    <div id="login-info"></div>
    <label id="l-caja" class="oculto">Este equipo es<select name="caja"></select></label>
    <div id="l-usuarios" class="login-usuarios oculto"></div>
    <label>Usuario<input name="usuario" autocomplete="username" autofocus></label>
    <label>Clave<input name="clave" type="password" autocomplete="current-password"></label>
    <button class="btn primario grande">Ingresar</button>
    ${window.isSecureContext ? '' : `<div class="det acceso-caja">¿Quieres conectar otra caja? Descarga el instalador en el otro PC y elige <b>Caja cliente</b>; buscará automáticamente el MiPOS principal.
      <a class="btn chico" id="instalar-caja-cliente" href="#" target="_blank" rel="noopener">Descargar instalador de MiPOS</a></div>`}</form></div>`;
  $('[name=usuario]').focus();
  const enlaceCliente = $('#instalar-caja-cliente');
  if (enlaceCliente) api('/sinred/instalador-cliente').then(r => { enlaceCliente.href = r.url; }).catch(() => { enlaceCliente.classList.add('oculto'); });
  api('/licencia/estado').then(l => {
    S.lic = l;
    const box = $('#login-info');
    if (!box) return;
    const n = diasPrueba(l), comprar = n !== null ? linkComprar() : '';
    box.innerHTML = (n !== null ? `<div class="login-demo"><b>Versión de prueba completa</b> · te quedan ${n} día${n === 1 ? '' : 's'}.
        Todas las funciones, sin límites. ${l.tienda ? '<a href="#" id="li-comprar">Comprar licencia</a>' : comprar ? `<a href="${comprar}" target="_blank" rel="noopener">Comprar licencia</a>` : ''}</div>` : '') +
      (l.primer_uso ? `<div class="primer-uso"><div><span>Primer ingreso</span>Usuario <code>admin</code> · Clave <code>1234</code></div>
        <button type="button" class="btn chico" id="pu-usar">Usar estos datos</button>
        <small>Luego te pedirá crear tu propia clave.</small></div>` : '');
    const lc = $('#li-comprar');
    if (lc) lc.addEventListener('click', e => { e.preventDefault(); comprarLicencia(); });
    const u = $('#pu-usar');
    if (u) u.addEventListener('click', () => { const f = $('#f-login'); f.usuario.value = 'admin'; f.clave.value = '1234'; $('button.primario', f).focus(); });
  }).catch(() => {});
  api('/usuarios/publico').then(lista => {
    const box = $('#l-usuarios');
    if (!box || !lista.length) return;
    let ultimo = '';
    try { ultimo = localStorage.getItem('mipos_ultimo_usuario') || ''; } catch (e) { /* nada */ }
    box.innerHTML = `<div class="lu-lista" title="Toca tu nombre y escribe tu clave">${lista.map(u => `
      <button type="button" class="lu ${u.usuario === ultimo ? 'activo' : ''}" data-usuario="${esc(u.usuario)}" title="Usuario: ${esc(u.usuario)}">
        <span class="lu-ini">${esc((u.nombre || u.usuario).trim().charAt(0).toUpperCase())}</span>
        <span class="lu-nom">${esc(u.nombre || u.usuario)}<small>${u.rol === 'admin' ? 'Administrador' : 'Cajero'}</small></span></button>`).join('')}</div>`;
    box.classList.remove('oculto');
    const f = $('#f-login');
    const elegir = usuario => {
      f.usuario.value = usuario;
      $$('.lu', box).forEach(b => b.classList.toggle('activo', b.dataset.usuario === usuario));
      f.clave.value = ''; f.clave.focus();
    };
    $$('.lu', box).forEach(b => b.addEventListener('click', () => elegir(b.dataset.usuario)));
    if (ultimo && lista.some(u => u.usuario === ultimo) && !f.usuario.value) elegir(ultimo);
  }).catch(() => {});
  // Con varias cajas, cada equipo indica cuál es (queda recordado en este navegador)
  api('/terminales/publico').then(lista => {
    const sel = $('#f-login [name=caja]');
    if (!sel) return;
    if (!lista.some(t => String(t.id) === S.cajaId)) guardarCaja(lista.length ? lista[0].id : null);
    sel.innerHTML = lista.map(t => `<option value="${t.id}" ${String(t.id) === S.cajaId ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('');
    $('#l-caja').classList.toggle('oculto', lista.length < 2);
  }).catch(() => {});
  $('#f-login').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.caja.value) guardarCaja(f.caja.value);
    try {
      const r = await api('/login', { method: 'POST', body: { usuario: f.usuario.value, clave: f.clave.value } });
      S.token = r.token; S.user = r.usuario;
      try { localStorage.setItem('mipos_token', r.token); localStorage.setItem('mipos_ultimo_usuario', r.usuario.usuario); } catch (err) { /* nada */ }
      await cargarBase();
      S.vista = 'venta';
      renderApp();
      if (S.user.debe_cambiar_clave) cambiarMiClave(true, !!r.recuperacion);
    } catch (err) {
      if (err.data && err.data.caja_sugerida) {
        guardarCaja(err.data.caja_sugerida.id);
        const sel = f.querySelector('[name=caja]');
        if (sel) sel.value = String(err.data.caja_sugerida.id);
      }
      toast(err.message, 'error'); f.clave.value = ''; f.clave.focus();
    }
  });
}

function cambiarMiClave(obligatorio = false, recuperacion = false) {
  const aviso = recuperacion
    ? 'Clave de soporte. En clave actual escríbela otra vez y deja la clave nueva del cliente.'
    : (obligatorio ? 'Estás usando la clave inicial. Cámbiala para proteger el sistema.' : '');
  const m = modal(`<form class="form"><h2>Cambiar mi clave</h2>
    ${aviso ? `<div class="aviso">${aviso}</div>` : ''}
    <label>Clave actual<input name="actual" type="password" autofocus></label>
    <label>Clave nueva (mínimo 4 caracteres)<input name="nueva" type="password"></label>
    <label>Repite la clave nueva<input name="nueva2" type="password"></label>
    <div class="acciones"><button type="button" class="btn" data-cerrar>${obligatorio ? 'Más tarde' : 'Cancelar'}</button><button class="btn primario">Guardar</button></div></form>`);
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.nueva.value !== f.nueva2.value) return toast('Las claves nuevas no coinciden', 'error');
    try {
      await api('/me/clave', { method: 'POST', body: { actual: f.actual.value, nueva: f.nueva.value } });
      S.user.debe_cambiar_clave = false;
      m.cerrar(); toast('Clave actualizada');
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ------------------------------------------------------------------ layout
function renderApp() {
  const tabs = [['venta', 'Venta'], ['ventas', 'Recibos'], ['caja', 'Caja'], ['clientes', 'Clientes']];
  const perm = k => esAdmin() || !!(S.user && S.user.permisos && S.user.permisos[k]);
  if (perm('menu_estadisticas') || (typeof puedeVerCierres === 'function' && puedeVerCierres())) tabs.splice(3, 0, ['reportes', 'Estadísticas']);
  if (perm('menu_productos')) tabs.push(['productos', 'Productos']);
  if (perm('menu_inventario')) tabs.push(['inventario', 'Inventario']);
  if (perm('menu_proveedores')) tabs.push(['proveedores', 'Proveedores']);
  if (esAdmin()) tabs.push(['config', 'Configuración']);
  if (!tabs.some(t => t[0] === S.vista)) S.vista = 'venta';
  const cortos = { config: 'Ajustes', proveedores: 'Proveed.', inventario: 'Inventario' };
  $('#app').innerHTML = `<div class="shell">
    <aside class="rail">
      <div class="marca">${LOGO}<b>MiPOS</b><span>${esc(S.cfg.negocio_nombre || '')}</span></div>
      <nav>${tabs.map(([k, t]) => `<button data-vista="${k}" class="${S.vista === k ? 'activo' : ''}" title="${t}">${icono(k)}<span>${cortos[k] || t}</span></button>`).join('')}</nav>
      <div class="rail-pie">
        <div class="ayuda-fila"><button id="btn-ayuda" class="btn-ayuda" title="Ayuda (F1)">${icono('ayuda')}<span>Ayuda</span></button>
        <button id="btn-soporte" class="btn-ayuda btn-soporte" title="Soporte: reportar un problema o hacer una consulta">${icono('soporte')}<span>Soporte</span><b class="burbuja-sop"></b></button>
        <button id="btn-apariencia" class="btn-ayuda btn-apariencia" title="Apariencia y tema (colores)">${icono('paleta')}<span>Tema</span></button></div>
        ${chipPrueba()}
        ${conDte() ? '<button id="alerta-dte" class="alerta-dte oculto" title="Boletas electrónicas pendientes"></button>' : ''}
        <div id="estado-caja" class="estado-caja ${S.caja ? 'abierta' : 'cerrada'}">${textoEstadoCaja()}</div>
        <div class="usuario">
          <button id="btn-clave" class="avatar" title="${esc(S.user.nombre)} (${S.user.rol}) · cambiar mi clave">${esc((S.user.nombre || '?').trim().charAt(0).toUpperCase())}</button>
          <button id="btn-salir" class="salir" title="Salir">${icono('salir')}</button>
        </div>
        <a class="firma-producto" href="https://mispitutosinformaticos.cl/" target="_blank" rel="noopener noreferrer" aria-label="Diseñado por Mis Pitutos Informáticos, abre el sitio web">
          <span>Diseñado por</span><strong>Mis Pitutos Informáticos</strong>
        </a>
      </div>
    </aside>
    <div class="contenido-app">
      <div class="franjas-aviso">
        <div id="actualizacion-aviso" class="actualizacion-aviso oculto" role="status" aria-live="polite"></div>
        <div id="respaldo-dia" class="actualizacion-aviso respaldo-dia oculto" role="status" aria-live="polite"></div>
        <div id="licencia-aviso" class="actualizacion-aviso licencia-aviso oculto" role="status" aria-live="polite"></div>
      </div>
      <div class="area-trabajo">
        <div id="actualizacion-pausa" class="aviso catalogo-inicio oculto">Actualización en preparación: no inicies operaciones. Espera a que termine o se cancele.</div>
        <main id="vista"></main>
      </div>
    </div></div>`;
  $$('.rail nav button').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));
  $('#btn-salir').addEventListener('click', async () => {
    if (hayVentasEnCurso() && !(await confirmar('Hay ventas en curso. Quedan guardadas en esta caja para cuando vuelvas a entrar. ¿Salir?'))) return;
    try { await api('/logout', { method: 'POST' }); } catch (e) { /* nada */ }
    cerrarSesionLocal();
  });
  $('#btn-clave').addEventListener('click', () => cambiarMiClave());
  vigilarRespaldoDia();
  $('#btn-ayuda').addEventListener('click', () => abrirAyuda());
  $('#btn-soporte').addEventListener('click', () => abrirSoporte());
  $('#btn-apariencia').addEventListener('click', () => abrirModalApariencia());
  pintarBotonSoporte();
  iniciarAvisoActualizacion();
  informarActividadActualizacion();
  pintarAvisoSinRed();
  if (!S.sopRevisado) { S.sopRevisado = true; setTimeout(revisarSoporte, 3000); setTimeout(avisarStockNegativo, 8000); }
  // copia local para vender sin red, y subir lo que haya quedado pendiente
  actualizarPaqueteSinRed(true).then(() => sincronizarSinRed());
  const ad = $('#alerta-dte'); if (ad) ad.addEventListener('click', () => { S.subVentas = 'boletas'; irA('ventas'); });
  revisarBoletas();
  pintarAvisoLicencia();
  VISTAS[S.vista]();
}

function irA(vista) {
  const aplicar = () => {
    const saliaDeCaja = S.vista === 'caja' && vista !== 'caja';
    S.vista = vista;
    $$('.rail nav button').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
    const main = $('#vista'); if (main) { main.classList.remove('entra'); void main.offsetWidth; main.classList.add('entra'); }
    if (saliaDeCaja) ocultarRespaldoDia();
    return VISTAS[vista]();
  };
  if (!formulariosSinGuardar().length) return aplicar();
  return permitirSalidaFormulario().then(ok => { if (ok) return aplicar(); });
}

function ingresarPanGranel() {
  const m = modal(`<form class="form"><h2>Ingresar pan a granel</h2>
    <div class="det">Suma solo los kilos de pan a granel que van llegando. No cambia el precio ni ningún otro producto.</div>
    <label>Cantidad que llegó (kg)<input name="cantidad" inputmode="decimal" required autofocus placeholder="Ej: 2,5"></label>
    <div class="acciones"><button type="button" class="btn neutro" data-cerrar>Cancelar</button><button class="btn primario">Sumar al stock</button></div></form>`);
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const cantidad = decimal(e.target.cantidad.value);
    if (cantidad <= 0) return toast('Ingresa la cantidad que llegó', 'error');
    try {
      const r = await api('/stock/pan-granel', { method: 'POST', body: { cantidad } });
      m.cerrar();
      toast(`${r.nombre}: stock ahora ${fmtStock(r.stock, 1)}`, 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}

const VISTAS = {};

// ================================================================== VENTA
let sugLista = [], sugIdx = -1, sugTimer = null, ultimoIdx = -1;

function enfocarScan() {
  const s = $('#scan');
  if (s && !S.modales.length) s.focus();
}

VISTAS.venta = () => {
  const v = $('#vista');
  v.innerHTML = `
    ${S.caja ? '' : `<div class="aviso">La caja está cerrada. Ábrela para poder vender. <button class="btn chico" id="ir-caja">Abrir caja</button></div>`}
    <div class="venta ${S.caja ? '' : 'con-aviso'}">
      <section class="panel venta-izq">
        <div id="pestanas" class="pestanas"></div>
        <div class="scan-wrap">
          <input id="scan" class="scan" autocomplete="off" spellcheck="false"
            placeholder="Escanea o escribe código / nombre   (3*código = 3 unidades)">
          <div id="sug" class="sugerencias oculto"></div>
        </div>
        ${puedePanGranel() ? '<button type="button" id="btn-pan" class="btn neutro">Ingresar pan a granel</button>' : ''}
        <div class="tabla-wrap">
          <table class="tabla carrito"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Stock</th><th class="num">Total</th><th></th></tr></thead>
          <tbody id="carrito"></tbody></table>
          <div id="vacio" class="vacio">Escanea un producto para comenzar<br><span class="det">F1 ayuda · F2 buscar · F4 venta rápida · F8 atender a otro cliente · F12 cobrar · Esc cancelar</span></div>
        </div>
      </section>
      <aside class="panel venta-der">
        <div id="info-prod" class="info-prod oculto"></div>
        <div class="total-box"><div class="etq">Total a pagar</div><div id="total" class="total">$0</div><div id="det-total" class="det">&nbsp;</div></div>
        <button id="btn-cobrar" class="btn primario grande">Cobrar <kbd>F12</kbd></button>
        <button id="btn-rapida" class="btn">Venta rápida (solo monto) <kbd>F4</kbd></button>
        ${S.cfg.transferencia_imprimir === '1' ? '<button id="btn-transf" class="btn">Imprimir datos de transferencia</button>' : ''}
        <div class="fila-btns">
          <button id="btn-vaciar" class="btn peligro-suave">Cancelar <kbd>Esc</kbd></button>
        </div>
        <div class="ultimo"><div class="etq">Último ticket <button class="btn chico" id="btn-imp-ult" ${S.ultimaVentaId ? '' : 'disabled'}>Imprimir</button></div><pre class="ticket" id="ult">${esc(S.ultimoTicket || 'Aún no hay ventas en esta sesión')}</pre></div>
      </aside>
    </div>`;
  const ir = $('#ir-caja');
  if (ir) ir.addEventListener('click', () => irA('caja'));
  const scan = $('#scan');
  scan.addEventListener('input', () => {
    clearTimeout(sugTimer);
    const q = scan.value.trim().replace(/^\d+([.,]\d+)?\*/, '');
    if (q.length < 2 || /^\d+$/.test(q)) return ocultarSug();
    sugTimer = setTimeout(() => buscarSugerencias(q), 180);
  });
  scan.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && sugLista.length) { e.preventDefault(); sugIdx = (sugIdx + 1) % sugLista.length; pintarSug(); }
    else if (e.key === 'ArrowUp' && sugLista.length) { e.preventDefault(); sugIdx = (sugIdx - 1 + sugLista.length) % sugLista.length; pintarSug(); }
    else if (e.key === 'Enter') { e.preventDefault(); procesarScan(); }
  });
  const btnPan = $('#btn-pan');
  if (btnPan) btnPan.addEventListener('click', ingresarPanGranel);
  $('#btn-cobrar').addEventListener('click', cobrar);
  $('#btn-rapida').addEventListener('click', () => ventaRapida());
  const btnTransf = $('#btn-transf');
  if (btnTransf) btnTransf.addEventListener('click', () => { imprimirDatosTransferencia(totalVenta()); enfocarScan(); });
  $('#btn-vaciar').addEventListener('click', cancelarVenta);
  $('#btn-imp-ult').addEventListener('click', () => S.ultimaVentaId ? imprimirVenta(S.ultimaVentaId) : S.ultimoTicket && imprimirEnNavegador(S.ultimoTicket));
  iniciarEspera();
  pintarCarrito();
  enfocarScan();
};

async function buscarSugerencias(q) {
  try {
    sugLista = await api('/productos?limit=8&q=' + encodeURIComponent(q));
    sugIdx = sugLista.length ? 0 : -1;
    pintarSug();
  } catch (e) { toast(e.message, 'error'); }
}

function pintarSug() {
  const box = $('#sug');
  if (!box) return;
  if (!sugLista.length) { box.innerHTML = '<div class="sug"><span class="det">Sin resultados</span></div>'; box.classList.remove('oculto'); return; }
  box.innerHTML = sugLista.map((p, i) => `<div class="sug ${i === sugIdx ? 'activa' : ''}" data-i="${i}">
      <div><strong>${esc(p.nombre)}</strong><small>${esc(p.codigo || 'sin código')}${p.categoria ? ' · ' + esc(p.categoria) : ''}</small></div>
      <span class="badge ${p.bajo_stock ? 'rojo' : ''}">Stock ${fmtStock(p.stock, p.granel)}</span>
      <strong class="num">${clp(p.precio_venta)}${p.granel ? '/kg' : ''}</strong></div>`).join('');
  box.classList.remove('oculto');
  $$('.sug[data-i]', box).forEach(el => el.addEventListener('mousedown', e => {
    e.preventDefault();
    const { cant } = leerCantidad($('#scan').value);
    agregar(sugLista[+el.dataset.i], cant);
    $('#scan').value = ''; ocultarSug();
  }));
}

function ocultarSug() {
  sugLista = []; sugIdx = -1;
  const box = $('#sug');
  if (box) box.classList.add('oculto');
}

function leerCantidad(txt) {
  const m = txt.trim().match(/^(\d+(?:[.,]\d+)?)\s*\*\s*(.*)$/);
  return m ? { cant: decimal(m[1]), texto: m[2].trim() } : { cant: null, texto: txt.trim() };
}

async function procesarScan() {
  const scan = $('#scan');
  const { cant, texto } = leerCantidad(scan.value);
  if (!texto) { if (!scan.value.trim() && S.carrito.length) cobrar(); return; }
  clearTimeout(sugTimer);
  const visible = !$('#sug').classList.contains('oculto');
  if (visible && sugIdx >= 0 && sugLista[sugIdx] && !/^\d+$/.test(texto)) {
    agregar(sugLista[sugIdx], cant);
    scan.value = ''; ocultarSug();
    return;
  }
  try {
    const p = await api('/productos/codigo/' + encodeURIComponent(texto));
    agregar(p, cant);
    scan.value = ''; ocultarSug();
  } catch (e) {
    try {
      const lista = await api('/productos?limit=8&q=' + encodeURIComponent(texto));
      if (lista.length === 1) { agregar(lista[0], cant); scan.value = ''; ocultarSug(); }
      else if (lista.length > 1) { sugLista = lista; sugIdx = 0; pintarSug(); }
      else { scan.value = ''; ocultarSug(); productoNoEncontrado(texto, cant); }
    } catch (e2) { toast(e2.message, 'error'); }
  }
}

function productoNoEncontrado(texto, cant) {
  const esCodigo = /^\S+$/.test(texto) && /\d/.test(texto);
  const m = modal(`<h2>${esCodigo ? `El código ${esc(texto)} no está registrado` : `No encontré “${esc(texto)}”`}</h2>
    <p class="det">Elige qué hacer:</p>
    <div class="opciones">
      <button class="opcion" id="nf-rapida" autofocus><strong>Venta rápida</strong><span>Cobrar solo ingresando el monto y una nota. <kbd>F4</kbd></span></button>
      ${esAdmin() ? `<button class="opcion" id="nf-crear"><strong>Crear producto</strong><span>Registrarlo con precio y stock, y agregarlo a la venta.</span></button>`
        : '<div class="det">Para registrarlo como producto, pide al administrador que lo cree.</div>'}
    </div>
    <div class="acciones"><button class="btn" data-cerrar>Cancelar</button></div>`);
  const ir = fn => () => { m.cerrar(); fn(); };
  $('#nf-rapida', m.el).addEventListener('click', ir(() => ventaRapida({ codigo: esCodigo ? texto : '', nota: esCodigo ? '' : texto, cantidad: cant })));
  const c = $('#nf-crear', m.el);
  if (c) c.addEventListener('click', ir(() => formProducto(null, nuevo => { if (nuevo && S.vista === 'venta') agregar(nuevo, cant); },
    { prefill: esCodigo ? { codigo: texto } : { nombre: texto }, continuar: false })));
}

// Venta rápida: producto no registrado, solo monto + nota (no descuenta stock)
function ventaRapida({ codigo = '', nota = '', cantidad = null } = {}) {
  if (actualizacionPausada || instalacionEnCurso) return toast('MiPOS está preparando una actualización. Espera antes de iniciar una venta.', 'aviso');
  if (!S.caja) return toast('La caja está cerrada. Ábrela antes de vender.', 'error');
  const m = modal(`<form class="form" data-sin-aviso-cambios><h2>Venta rápida</h2>
    ${codigo ? `<div class="det">Código escaneado: <strong>${esc(codigo)}</strong> (queda guardado para crear el producto después)</div>` : ''}
    <div class="grid2">
      <label>Monto unitario<input name="precio" inputmode="numeric" placeholder="$0" autofocus autocomplete="off"></label>
      <label>Cantidad<input name="cantidad" inputmode="numeric" value="${cantidad && Number.isInteger(cantidad) ? cantidad : 1}"></label>
      <label class="full">Nota / descripción del producto<input name="nota" value="${esc(nota)}" placeholder="Ej: cargador USB, bebida 3 L…" maxlength="100" autocomplete="off"></label>
    </div>
    <div id="vr-total" class="det">&nbsp;</div>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Agregar a la venta</button></div></form>`);
  const f = $('form', m.el);
  const tot = () => { const t = entero(f.precio.value) * Math.max(entero(f.cantidad.value), 1); $('#vr-total', m.el).innerHTML = t ? `Total: <strong>${clp(t)}</strong>` : '&nbsp;'; };
  f.precio.addEventListener('input', tot); f.cantidad.addEventListener('input', tot);
  f.addEventListener('submit', e => {
    e.preventDefault();
    const precio = entero(f.precio.value), cant = entero(f.cantidad.value);
    if (precio <= 0) return toast('Ingresa el monto', 'error');
    if (cant <= 0) return toast('Cantidad inválida', 'error');
    S.carrito.push({ libre: true, producto_id: null, codigo, nombre: f.nota.value.trim(), precio, cantidad: cant, granel: false, descuento: 0 });
    ultimoIdx = S.carrito.length - 1;
    m.cerrar();
    pintarCarrito();
  });
}

async function agregar(p, cant) {
  if (actualizacionPausada || instalacionEnCurso) return toast('MiPOS está preparando una actualización. Espera antes de iniciar una venta.', 'aviso');
  if (p.pendiente_configuracion || p.precio_venta <= 0) {
    const configurado = await corregirPrecioProducto(p);
    if (!configurado) return;
    p = { ...p, ...configurado };
  }
  if (p.balanza) return agregarEtiquetaBalanza(p);
  if (p.granel && !cant) {
    const r = await pedirPeso(p);
    if (r === null) return;
    cant = decimal(r);
  }
  cant = cant || 1;
  if (cant <= 0) return toast('Cantidad inválida', 'error');
  if (!p.granel && !Number.isInteger(cant)) return toast(`${p.nombre} se vende por unidad`, 'error');
  let idx = p.granel ? -1 : S.carrito.findIndex(i => i.producto_id === p.id && !i.monto_etiqueta && !i.etiqueta_balanza);
  if (idx >= 0) S.carrito[idx].cantidad += cant;
  else {
    S.carrito.push({ producto_id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio_venta, cantidad: Math.round(cant * 1000) / 1000, granel: !!p.granel, stock: p.stock, stock_minimo: p.stock_minimo, descuento: 0 });
    idx = S.carrito.length - 1;
  }
  ultimoIdx = idx;
  S.carrito[idx].stock = p.stock;
  S.ultimoProducto = p;
  const enCarro = S.carrito.filter(i => i.producto_id === p.id).reduce((a, i) => a + i.cantidad, 0);
  if (enCarro > p.stock) toast(`Stock insuficiente de ${p.nombre}: quedan ${fmtStock(p.stock, p.granel)}`, 'aviso');
  pintarCarrito();
  enfocarScan();
}

async function corregirPrecioProducto(p) {
  if (typeof SINRED !== 'undefined' && SINRED.activo) {
    toast('Para configurar o corregir precios necesitas conexión con el PC principal.', 'aviso');
    return null;
  }
  const valor = await pedir(`Precio de ${p.nombre}`, {
    label: p.granel ? 'Precio por kilo' : 'Precio de venta',
    valor: p.precio_venta > 0 ? String(p.precio_venta) : '',
    ayuda: 'Opcional: cancela para no cambiarlo. Al aceptar se guardará en la ficha del producto. Sin permiso, un administrador deberá autorizar.',
    modo: 'numeric',
  });
  if (valor === null) return null;
  const precio = Number(valor);
  if (!Number.isSafeInteger(precio) || precio <= 0) {
    toast('Escribe un precio entero mayor a $0.', 'error');
    return null;
  }
  try {
    const actualizado = await api('/venta/precio/' + p.id, { method: 'POST', body: { precio_venta: precio } });
    S.carrito.filter(i => i.producto_id === p.id && !i.etiqueta_balanza && !i.monto_etiqueta).forEach(i => {
      i.precio = actualizado.precio_venta;
      delete i.calc;
    });
    toast('Precio guardado en el producto');
    return actualizado;
  } catch (e) { toast(e.message, 'error'); return null; }
}

// Stock que quedará después de esta venta (considera todas las líneas del mismo producto)
function stockRestante(i) {
  const enCarro = S.carrito.filter(x => x.producto_id === i.producto_id).reduce((a, x) => a + x.cantidad, 0);
  return Math.round((i.stock - enCarro) * 1000) / 1000;
}
function badgeStock(i) {
  if (i.libre) return '<span class="det">—</span>';
  const queda = stockRestante(i);
  const clase = queda < 0 ? 'rojo' : queda <= (i.stock_minimo || 0) ? 'amarillo' : 'verde';
  return `<span class="badge ${clase}" title="Stock actual ${fmtStock(i.stock, i.granel)}; después de esta venta ${fmtStock(queda, i.granel)}">quedan ${fmtStock(queda, i.granel)}</span>`;
}

// Total de la línea: si el servidor ya calculó ofertas para esta cantidad se usa ese; la etiqueta de balanza manda
const brutoLinea = i => Math.round(Number((i.precio * i.cantidad).toFixed(6)));
const totalLinea = i => i.monto_etiqueta ? i.monto_etiqueta
  : (i.calc && i.calc.cantidad === i.cantidad ? i.calc.total : brutoLinea(i) - (i.descuento || 0));
const subtotalVenta = () => S.carrito.reduce((a, i) => a + totalLinea(i), 0);
const totalVenta = () => subtotalVenta();

function pintarCarrito(sinCalculo = false) {
  if (!sinCalculo) programarCalculo();
  const tb = $('#carrito');
  if (!tb) return;
  tb.innerHTML = S.carrito.map((i, n) => `<tr class="${n === ultimoIdx ? 'reciente' : ''}">
      <td class="nombre">${i.libre ? `<span class="badge amarillo">Venta rápida</span> ${esc(i.nombre || 'Sin nota')}` : esc(i.nombre)}<small>${esc(i.codigo || '')}</small>${badgeLinea(i)}</td>
      <td class="num">${i.monto_etiqueta || i.etiqueta_balanza ? `<span class="cant-fija">${fmtCant(i.cantidad, i.granel)}</span>` : `<input class="cant" data-i="${n}" value="${i.granel ? String(i.cantidad).replace('.', ',') : i.cantidad}" inputmode="decimal">`}</td>
      <td class="num">${!i.libre && !i.etiqueta_balanza && !i.monto_etiqueta ? `<button class="btn chico" data-precio="${n}" title="Corregir precio del producto">${clp(i.precio)}${i.granel ? '/kg' : ''}</button>` : `${clp(i.precio)}${i.granel ? '/kg' : ''}`}</td>
      <td class="num">${badgeStock(i)}</td>
      <td class="num">${totalLinea(i) !== brutoLinea(i) && !i.monto_etiqueta ? `<s class="det">${clp(brutoLinea(i))}</s> ` : ''}<strong>${clp(totalLinea(i))}</strong></td>
      <td class="num"><button class="quitar" data-quitar="${n}" title="Quitar">×</button></td></tr>`).join('');
  $('#vacio').classList.toggle('oculto', S.carrito.length > 0);
  $$('[data-precio]', tb).forEach(b => b.addEventListener('click', async () => {
    const i = S.carrito[+b.dataset.precio];
    if (await corregirPrecioProducto({ id: i.producto_id, nombre: i.nombre, precio_venta: i.precio, granel: i.granel })) pintarCarrito();
  }));
  $$('input.cant', tb).forEach(inp => {
    inp.addEventListener('change', () => {
      const it = S.carrito[+inp.dataset.i];
      const c = decimal(inp.value);
      if (c <= 0 || (!it.granel && !Number.isInteger(c))) { toast('Cantidad inválida', 'error'); return pintarCarrito(); }
      it.cantidad = Math.round(c * 1000) / 1000;
      pintarCarrito();
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); enfocarScan(); } });
  });
  $$('[data-quitar]', tb).forEach(b => b.addEventListener('click', () => {
    if (S.carrito.length === 1) {
      observarVentaIniciada('cancelada');
      delete ESPERA.lista[ESPERA.activa].observacion;
    }
    S.carrito.splice(+b.dataset.quitar, 1);
    ultimoIdx = -1;
    pintarCarrito(); enfocarScan();
  }));
  const unidades = S.carrito.reduce((a, i) => a + (i.granel ? 1 : i.cantidad), 0);
  const tot = $('#total'), nuevoTotal = clp(totalVenta());
  if (tot.textContent !== nuevoTotal) { tot.textContent = nuevoTotal; tot.classList.remove('bump'); void tot.offsetWidth; tot.classList.add('bump'); }
  const ahorro = S.carrito.reduce((a, i) => a + (i.calc && i.calc.cantidad === i.cantidad && i.calc.promo ? brutoLinea(i) - i.calc.total : 0), 0);
  $('#det-total').innerHTML = S.carrito.length
    ? `${unidades} artículo${unidades === 1 ? '' : 's'}${ahorro ? ` · <span class="ahorro">ahorra ${clp(ahorro)} en ofertas</span>` : ''}`
    : '&nbsp;';
  pintarInfoProducto();
  const fila = tb.querySelector('tr.reciente');
  if (fila) fila.scrollIntoView({ block: 'nearest' });
  guardarEspera();
  pintarPestanas();
}

function pintarInfoProducto() {
  const box = $('#info-prod');
  if (!box) return;
  const i = S.carrito[ultimoIdx];
  if (!i) { box.classList.add('oculto'); return; }
  if (i.libre) {
    box.className = 'info-prod amarillo';
    box.innerHTML = `<div class="etq">Venta rápida</div><div class="ip-nombre">${esc(i.nombre || 'Sin nota')}</div>
      <div class="ip-fila"><span>${clp(i.precio)}</span><span>No descuenta stock</span></div>`;
    return;
  }
  const queda = stockRestante(i);
  const alerta = queda < 0 ? 'Sin stock suficiente' : queda <= (i.stock_minimo || 0) ? 'Stock bajo' : '';
  box.className = 'info-prod ' + (queda < 0 ? 'rojo' : queda <= (i.stock_minimo || 0) ? 'amarillo' : '');
  box.innerHTML = `<div class="etq">Último escaneado</div>
    <div class="ip-nombre">${esc(i.nombre)}</div>
    <div class="ip-fila"><span>${clp(i.precio)}${i.granel ? '/kg' : ''}</span><span>Stock: <strong>${fmtStock(i.stock, i.granel)}</strong> → quedan <strong>${fmtStock(queda, i.granel)}</strong></span></div>
    ${alerta ? `<div class="ip-alerta">${alerta}</div>` : ''}`;
}

async function cancelarVenta() {
  if (!S.carrito.length) return;
  if (await confirmar('¿Cancelar la venta actual?', { si: 'Sí, cancelar', peligro: true })) {
    observarVentaIniciada('cancelada');
    S.carrito = []; ultimoIdx = -1; S.clienteVenta = null;
    alTerminarVenta();
    pintarCarrito();
  }
}

async function cobrar() {
  if (S.modales.length || S.abriendoCobro) return;
  if (!S.caja) return toast('La caja está cerrada. Ábrela antes de vender.', 'error');
  if (!S.carrito.length) return toast('Agrega productos primero', 'aviso');
  S.abriendoCobro = true;
  try { await calcularAhora(); } finally { S.abriendoCobro = false; }
  if (S.modales.length) return;
  const total = totalVenta();
  if (total <= 0) return toast('El total debe ser mayor a $0', 'error');
  const redOn = S.cfg.redondeo_efectivo === '1';
  const m = modal(`<form class="form" id="f-cobro">
    <div class="cobro-total"><span>Total</span><strong id="c-total">${clp(total)}</strong></div>
    <div id="c-red" class="det"></div>
    <div id="c-doc" class="c-doc oculto"></div>
    <div id="c-cli" class="c-cli"></div>
    <div class="pagos">${metodosCobro().map(([k, t]) => `<div class="pago">
        <button type="button" class="btn" data-llenar="${k}" title="Completar con el saldo">${t}</button>
        <input data-metodo="${k}" inputmode="numeric" placeholder="$0" autocomplete="off" ${k === 'efectivo' ? 'autofocus' : ''}></div>`).join('')}</div>
    <div id="c-transferencia-info" class="det oculto"></div>
    <div class="det">Para pagar con dos formas (ej: parte en efectivo y parte con tarjeta), escribe el efectivo y luego toca el botón del otro medio para completar el resto.</div>
    <div class="rapidos">${[1000, 2000, 5000, 10000, 20000].map(v => `<button type="button" class="btn chico" data-billete="${v}">+ ${clp(v)}</button>`).join('')}
      <button type="button" class="btn chico" data-billete="exacto">Exacto</button>
      <button type="button" class="btn chico" data-billete="0">Limpiar</button></div>
    <div id="c-resto" class="resto oculto"></div>
    <div class="cobro-res"><div><span>Pagado</span><strong id="c-pagado">$0</strong></div><div id="c-box"><span id="c-etq">Falta</span><strong id="c-dif">$0</strong></div></div>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Volver</button><button id="c-ok" class="btn primario grande" disabled>Confirmar <kbd>Enter</kbd></button></div>
  </form>`);
  const inputs = $$('[data-metodo]', m.el);
  const leer = () => Object.fromEntries(inputs.map(i => [i.dataset.metodo, entero(i.value)]));
  $('#c-transferencia-info', m.el).addEventListener('click', e => {
    if (e.target.closest('#b-imprimir-transferencia')) imprimirDatosTransferencia(leer().transferencia);
  });
  const objetivo = otros => (otros === 0 && redOn) ? redondear(total) : total;
  function calc() {
    const p = leer();
    const otros = noEf(p);
    const aCobrar = objetivo(otros);
    const pagado = p.efectivo + otros;
    const dif = pagado - aCobrar;
    const transferenciaInfo = $('#c-transferencia-info', m.el);
    const hayDatosBanco = [S.cfg.transferencia_titular, S.cfg.transferencia_rut, S.cfg.transferencia_banco,
      S.cfg.transferencia_tipo_cuenta, S.cfg.transferencia_numero].some(Boolean);
    if (p.transferencia > 0 && S.cfg.transferencia_imprimir === '1') {
      transferenciaInfo.classList.remove('oculto');
      transferenciaInfo.innerHTML = hayDatosBanco
        ? `Transferencia por ${clp(p.transferencia)} · <button type="button" class="btn chico" id="b-imprimir-transferencia">Imprimir datos</button>`
        : 'Configura los datos bancarios en Ajustes para imprimirlos.';
    } else {
      transferenciaInfo.classList.add('oculto');
      transferenciaInfo.innerHTML = '';
    }
    $('#c-total', m.el).textContent = clp(aCobrar);
    $('#c-red', m.el).textContent = aCobrar !== total ? `Redondeo por pago en efectivo: ${clp(aCobrar - total)} (total exacto ${clp(total)})` : '';
    $('#c-pagado', m.el).textContent = clp(pagado);
    const box = $('#c-box', m.el);
    box.className = dif >= 0 ? 'vuelto' : 'falta';
    $('#c-etq', m.el).textContent = dif >= 0 ? 'Vuelto' : 'Falta';
    $('#c-dif', m.el).textContent = clp(Math.abs(dif));
    const faltaCliente = (p.fiado > 0 || documento === 'factura') && !S.clienteVenta;
    $('#c-cli', m.el).classList.toggle('oculto', !(p.fiado > 0 || documento === 'factura'));
    const valido = pagado > 0 && dif >= 0 && otros <= aCobrar && !faltaCliente;
    if (faltaCliente) $('#c-red', m.el).textContent = documento === 'factura' ? 'Para emitir factura elige el cliente (empresa).' : 'Para vender fiado elige el cliente.';
    // Pago con dos formas: si falta plata, ofrecer completar el resto con tarjeta o transferencia
    const resto = $('#c-resto', m.el);
    if (dif < 0 && pagado > 0) {
      const falta = total - pagado;  // con tarjeta no hay redondeo
      resto.classList.remove('oculto');
      resto.innerHTML = `<span>Falta ${clp(falta)}. Completar con:</span>` +
        metodosCobro().filter(([k]) => k !== 'efectivo' && !p[k]).map(([k, t]) => `<button type="button" class="btn chico" data-resto="${k}">${t}</button>`).join('') +
        (p.efectivo ? '' : '<button type="button" class="btn chico" data-resto="efectivo">Efectivo</button>');
      $$('[data-resto]', resto).forEach(b => b.addEventListener('click', () => llenar(b.dataset.resto)));
    } else resto.classList.add('oculto');
    $('#c-ok', m.el).disabled = !valido;
    return { p, valido, aCobrar };
  }
  inputs.forEach(i => i.addEventListener('input', () => {
    calc();
    if (i.dataset.metodo !== 'efectivo') $('.cobro-res', m.el).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
  // Completa el saldo con la forma de pago k (para fiado pide el cliente si falta)
  async function llenar(k) {
    if (k === 'fiado' && !S.clienteVenta) {
      const c = await elegirCliente();
      if (!c) return;
      S.clienteVenta = c; pintarCli();
    }
    const inp = inputs.find(i => i.dataset.metodo === k);
    const p = leer(); p[k] = 0;
    const otrosSinK = noEf(p);
    const meta = (k === 'efectivo') ? objetivo(otrosSinK) : total;
    inp.value = Math.max(meta - (p.efectivo + otrosSinK), 0) || '';
    calc(); (k === 'efectivo' ? inp : $('#c-ok', m.el)).focus();
    // Lleva a la vista el resumen Pagado/Falta junto al botón Confirmar
    $('.cobro-res', m.el).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  $$('[data-llenar]', m.el).forEach(b => b.addEventListener('click', () => llenar(b.dataset.llenar)));
  function pintarCli() {
    const c = S.clienteVenta;
    $('#c-cli', m.el).innerHTML = c
      ? `<span>Cliente: <strong>${esc(c.nombre)}</strong> · ${c.saldo > 0 ? 'debe ' + clp(c.saldo) : 'al día'}${c.limite_credito ? ' · límite ' + clp(c.limite_credito) : ''}</span>
         <button type="button" class="btn chico" id="c-cli-cambiar">Cambiar</button><button type="button" class="btn chico" id="c-cli-quitar">Quitar</button>`
      : `<span class="det">Sin cliente</span><button type="button" class="btn chico" id="c-cli-cambiar">Asignar cliente</button>`;
    $('#c-cli-cambiar', m.el).addEventListener('click', async () => { const c2 = await elegirCliente(); if (c2) { S.clienteVenta = c2; pintarCli(); calc(); } });
    const q = $('#c-cli-quitar', m.el);
    if (q) q.addEventListener('click', () => { S.clienteVenta = null; pintarCli(); calc(); });
  }
  pintarCli();
  // Boleta o factura (solo si la boleta electrónica está activa)
  let documento = 'boleta';
  const pintarDoc = () => {
    const box = $('#c-doc', m.el);
    if (S.cfg.dte_activo !== '1') return;
    box.classList.remove('oculto');
    box.innerHTML = `<span>Documento</span><div class="seg">${[['boleta', 'Boleta'], ['factura', 'Factura']].map(([k, t]) =>
      `<label><input type="radio" name="c-doc" value="${k}" ${documento === k ? 'checked' : ''}> ${t}</label>`).join('')}</div>
      ${documento === 'factura' ? '<span class="det">Necesita RUT, giro, dirección y comuna del cliente</span>' : ''}`;
    $$('[name=c-doc]', box).forEach(x => x.addEventListener('change', async () => {
      documento = x.value;
      if (documento === 'factura' && !S.clienteVenta) {
        const c = await elegirCliente();
        if (c) { S.clienteVenta = c; pintarCli(); }
      }
      pintarDoc(); calc();
    }));
  };
  pintarDoc();
  $$('[data-billete]', m.el).forEach(b => b.addEventListener('click', () => {
    const ef = inputs[0];
    const v = b.dataset.billete;
    if (v === 'exacto') { const p = leer(); const otros = noEf(p); ef.value = Math.max(objetivo(otros) - otros, 0) || ''; }
    else if (v === '0') inputs.forEach(i => { i.value = ''; });
    else ef.value = entero(ef.value) + Number(v);
    calc(); ef.focus();
  }));
  calc();
  let enviando = false;
  $('#f-cobro', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const { p, valido } = calc();
    if (!valido || enviando) return;
    await enviarVenta(p, false);
  });
  async function enviarVenta(p, forzar) {
    enviando = true;
    $('#c-ok', m.el).disabled = true;
    try {
      const r = await api('/ventas', {
        method: 'POST', body: {
          items: itemsVenta(),
          venta_iniciada_uid: identidadVentaIniciada()?.uid,
          documento,
          cliente_id: S.clienteVenta && (p.fiado > 0 || documento === 'factura') ? S.clienteVenta.id : null,
          forzar_limite: forzar,
          pagos: Object.entries(p).filter(([, v]) => v > 0).map(([metodo, monto]) => ({ metodo, monto })),
        },
      });
      S.clienteVenta = null;
      m.cerrar();
      S.carrito = []; ultimoIdx = -1;
      alTerminarVenta();
      S.ultimoTicket = r.ticket_texto;
      S.ultimaVentaId = r.id;
      const bi = $('#btn-imp-ult'); if (bi) bi.disabled = false;
      const ult = $('#ult'); if (ult) ult.textContent = r.ticket_texto;
      pintarCarrito();
      avisarImpresion(r);
      if (imprimeNavegador() && S.cfg.ticket_auto_imprimir === '1') imprimirTicketVenta(r);
      if (r.boleta) revisarBoletas();
      const nombreDoc = r.boleta && r.boleta.tipo === 33 ? 'Factura electrónica' : r.boleta && r.boleta.tipo === 34 ? 'Factura exenta' : 'Boleta electrónica';
      const infoBoleta = !r.boleta ? '' : r.boleta.estado === 'emitido'
        ? `<div class="det">${nombreDoc} N° <strong>${r.boleta.folio}</strong>${r.boleta.simulado ? ' <span class="badge amarillo">modo prueba</span>' : ''}</div>`
        : '<div class="aviso" style="display:block;margin-top:8px">Boleta en trámite: no hubo respuesta del proveedor. Se reintentará sola.</div>';
      const mv = modal(`<div class="vuelto-grande"><div class="det">Venta N° ${r.folio} · Total ${clp(r.total)}</div>${infoBoleta}
          <div class="det" style="margin-top:12px">Vuelto</div><div class="monto">${clp(r.vuelto)}</div>
          ${r.cliente_saldo !== null && r.cliente_saldo !== undefined && r.pagos.some(x => x.metodo === 'fiado') ? `<div class="aviso" style="display:block;margin-top:10px">${esc(r.cliente_nombre)} queda debiendo ${clp(r.cliente_saldo)}</div>` : ''}</div>
          <div class="acciones"><button class="btn primario grande" data-cerrar autofocus>Nueva venta <kbd>Enter</kbd></button></div>`);
      setTimeout(() => mv.cerrar(), r.vuelto ? 15000 : 2500);
    } catch (err) {
      enviando = false;
      calc();
      if (err.cancelada) return;
      if (err.data && err.data.factura_datos) {
        // faltan datos tributarios del cliente: se completan aquí mismo y se reintenta
        if (!err.data.cliente_id) {
          const c = await elegirCliente();
          if (c) { S.clienteVenta = c; pintarCli(); calc(); }
          return;
        }
        const ok = await completarDatosFactura(err.data.cliente_id, err.message);
        if (ok) return enviarVenta(p, forzar);
        return;
      }
      if (!forzar && esAdmin() && /límite de crédito/.test(err.message)) {
        if (await confirmar(err.message + '. ¿Autorizar la venta igual?', { si: 'Autorizar' })) return enviarVenta(p, true);
        return;
      }
      toast(err.message, 'error', 6000);
    }
  }
}

// ================================================================== VENTAS
VISTAS.ventas = async () => {
  const v = $('#vista');
  if (esAdmin() && conDte() && S.subVentas === 'boletas') return vistaBoletas();
  v.innerHTML = `${esAdmin() && conDte() ? subtabsVentas('ventas') : ''}<div class="panel">
    <div class="barra"><label style="display:flex;align-items:center;gap:8px">Día <input type="date" id="v-fecha" value="${hoyISO()}" style="width:auto;margin:0"></label>
      <input type="search" id="v-folio" placeholder="Buscar N° de venta" inputmode="numeric" style="max-width:190px">
      <div class="crece"></div><div id="v-res" class="det"></div></div>
    <div class="tabla-wrap"><table class="tabla"><thead><tr><th>N°</th><th>Hora</th><th>${cajasVarias() ? 'Caja · ' : ''}Cajero</th><th>Pago</th>${conDte() ? '<th>Boleta</th>' : ''}<th class="num">Artículos</th><th class="num">Total</th><th></th></tr></thead>
    <tbody id="v-lista"></tbody></table></div></div>`;
  let lista = [];
  const pintar = () => {
    const folio = $('#v-folio').value.trim();
    const filtrada = folio ? lista.filter(x => String(x.folio).includes(folio)) : lista;
    const validas = lista.filter(x => x.estado !== 'anulada');
    const anuladas = lista.length - validas.length;
    $('#v-res').innerHTML = `${validas.length} venta${validas.length === 1 ? '' : 's'} · <strong>${clp(validas.reduce((a, x) => a + x.total - (x.devuelto || 0), 0))}</strong>${validas.some(x => x.devuelto) ? ' <span class="det">(neto de devoluciones)</span>' : ''}`
      + (anuladas ? ` · <span class="badge rojo">${anuladas} anulada${anuladas === 1 ? '' : 's'}</span>` : '');
    $('#v-lista').innerHTML = filtrada.length ? filtrada.map(x => `<tr class="click ${x.estado === 'anulada' ? 'anulada' : ''}" data-id="${x.id}">
        <td><strong>${x.folio}</strong>${x.estado === 'anulada' ? ' <span class="badge rojo">ANULADA</span>' : ''}${x.devuelto ? ` <span class="badge amarillo">${x.devuelto >= x.total ? 'devuelta' : 'devolución parcial'}</span>` : ''}</td>
        <td>${hora(x.fecha)}</td><td>${cajasVarias() && x.caja ? `<span class="badge">${esc(x.caja)}</span> ` : ''}${esc(x.cajero)}${x.cliente ? `<div class="det">Cliente: ${esc(x.cliente)}</div>` : ''}</td>
        <td>${(x.metodos || '').split(',').map(m => `<span class="badge azul">${nombreMetodo(m)}</span>`).join(' ')}</td>
        ${conDte() ? `<td>${badgeBoleta(x.boleta_estado, x.boleta_folio)}</td>` : ''}
        <td class="num">${x.n_items}</td><td class="num monto"><strong>${clp(x.total)}</strong></td>
        <td class="acciones-celda"><button class="btn chico" data-imprimir="${x.id}">Imprimir</button></td></tr>`).join('')
      : `<tr><td colspan="${conDte() ? 8 : 7}" class="vacio">No hay ventas</td></tr>`;
    $$('#v-lista tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('[data-imprimir]')) return;
      verVenta(+tr.dataset.id, cargar);
    }));
    $$('[data-imprimir]').forEach(b => b.addEventListener('click', () => imprimirVenta(+b.dataset.imprimir)));
  };
  const cargar = async () => {
    try { lista = await api('/ventas?fecha=' + $('#v-fecha').value); pintar(); }
    catch (e) { toast(e.message, 'error'); }
  };
  $('#v-fecha').addEventListener('change', cargar);
  $('#v-folio').addEventListener('input', pintar);
  cargar();
};

async function verVenta(id, alCambiar) {
  let v, info;
  try { [v, info] = await Promise.all([api('/ventas/' + id), api(`/ventas/${id}/devolucion`)]); } catch (e) { return toast(e.message, 'error'); }
  const anulada = v.estado === 'anulada';
  const tieneDev = info.devoluciones.length > 0;
  const puedeAnular = false; // Oculto: se usa Devolución en su lugar (el código de anular se conserva)
  const puedeDevolver = !anulada && info.devuelto_total < v.total;
  const m = modal(`<h2>Venta N° ${v.folio} ${anulada ? '<span class="badge rojo">ANULADA</span>' : ''}</h2>
    <div class="det" style="margin-bottom:10px">${fechaHora(v.fecha)} · ${esc(v.cajero)} · Total ${clp(v.total)}</div>
    ${anulada ? `<div class="aviso peligro" style="display:block">Anulada el ${fechaHora(v.anulada_en)} por ${esc(v.anulada_por_nombre)}${v.autorizada_por_nombre && v.autorizada_por_nombre !== v.anulada_por_nombre ? ` (autorizó ${esc(v.autorizada_por_nombre)})` : ''}.<br>Motivo: ${esc(v.motivo_anulacion)}</div>` : ''}
    ${tieneDev ? `<div class="aviso" style="display:block">Devoluciones: ${info.devoluciones.map(d => `<button class="link" data-dev="${d.id}">N° ${d.id}</button> ${fechaHora(d.fecha)} · ${clp(d.total)} (${d.metodo === 'fiado' ? 'abono a cuenta' : nombreMetodo(d.metodo)})`).join('<br>')}
      <br><strong>Total devuelto ${clp(info.devuelto_total)} de ${clp(v.total)}</strong></div>` : ''}
    ${infoDocumentosVenta(v)}
    <pre class="ticket" style="max-height:45vh">${esc(v.ticket_texto)}</pre>
    <div class="acciones">
      ${puedeAnular ? '<button class="btn peligro-suave" id="vv-anular">Anular venta</button>' : ''}
      ${puedeDevolver ? '<button class="btn" id="vv-devolver">Devolución</button>' : ''}
      <button class="btn" id="vv-imprimir">Imprimir</button>
      <button class="btn primario" data-cerrar autofocus>Cerrar</button></div>`, { ancho: true });
  $('#vv-imprimir', m.el).addEventListener('click', () => imprimirVenta(id));
  $$('[data-reintentar]', m.el).forEach(b => b.addEventListener('click', async () => {
    try { const d = await api(`/dte/documentos/${b.dataset.reintentar}/reintentar`, { method: 'POST' });
      toast(d.estado === 'emitido' ? `${d.nombre_tipo} N° ${d.folio} emitida` : 'Aún no se pudo: ' + (d.ultimo_error || d.estado), d.estado === 'emitido' ? 'ok' : 'aviso', 5000);
      m.cerrar(); revisarBoletas(); verVenta(id, alCambiar); if (alCambiar) alCambiar(); }
    catch (e) { toast(e.message, 'error'); }
  }));
  const b = $('#vv-anular', m.el);
  if (b) b.addEventListener('click', () => { m.cerrar(); anularVenta(v, alCambiar); });
  const bd = $('#vv-devolver', m.el);
  if (bd) bd.addEventListener('click', () => { m.cerrar(); devolverVenta(info, alCambiar); });
  $$('[data-dev]', m.el).forEach(x => x.addEventListener('click', async () => {
    try { const d = await api('/devoluciones/' + x.dataset.dev); const md = mostrarTicket(`Devolución N° ${d.id}`, d.ticket_texto);
      const bi = document.createElement('button'); bi.className = 'btn'; bi.textContent = 'Imprimir'; bi.addEventListener('click', () => imprimirEnNavegador(d.ticket_texto)); $('.acciones', md.el).prepend(bi); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

function devolverVenta(v, alCambiar) {
  const items = v.items.filter(i => i.disponible > 0);
  const metodoOrig = (v.pagos.slice().sort((a, b) => b.monto - a.monto)[0] || {}).metodo || 'efectivo';
  const opciones = METODOS.filter(([k]) => k !== 'fiado').map(([k, t]) => [k, t + (k === 'efectivo' ? ' (sale de la caja)' : '')]);
  if (v.cliente_id) opciones.push(['fiado', `Abonar a la cuenta de ${v.cliente_nombre}`]);
  const porDefecto = metodoOrig === 'fiado' && v.cliente_id ? 'fiado' : metodoOrig;
  const m = modal(`<form class="form"><h2>Devolución · Venta N° ${v.folio}</h2>
    <div class="det">Vendida ${fechaHora(v.fecha)} · Total ${clp(v.total)}${v.devuelto_total ? ` · ya devuelto ${clp(v.devuelto_total)}` : ''}</div>
    <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Vendido</th><th class="num">Devolver</th><th>Vuelve a stock</th><th class="num">Monto</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${esc(i.nombre)}${i.devuelto ? `<div class="det">ya devuelto ${fmtStock(i.devuelto, i.granel)}</div>` : ''}</td>
      <td class="num">${fmtStock(i.cantidad, i.granel)}</td>
      <td class="num"><input class="cant" data-iid="${i.id}" inputmode="decimal" placeholder="0" autocomplete="off"><div class="det">máx ${fmtStock(i.disponible, i.granel)}</div></td>
      <td>${i.producto_id ? `<label class="check"><input type="checkbox" data-stock="${i.id}" checked> Sí</label>` : '<span class="det">venta rápida</span>'}</td>
      <td class="num" data-monto="${i.id}">$0</td></tr>`).join('')}</tbody></table></div>
    <div><button type="button" class="btn chico" id="dv-todo">Devolver todo</button></div>
    <div class="grid2"><label>Devolver el dinero en<select name="metodo">${opciones.map(([k, t]) => `<option value="${k}" ${k === porDefecto ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Motivo<input name="motivo" required placeholder="Ej: producto en mal estado"></label></div>
    ${esAdmin() ? '' : `<div class="grid2"><label>Usuario administrador<input name="admin_usuario" autocomplete="off"></label><label>Clave<input name="admin_clave" type="password"></label></div>`}
    <div class="cobro-total"><span>A devolver</span><strong id="dv-total">$0</strong></div>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Registrar devolución</button></div></form>`, { ancho: true });
  const inputs = $$('input[data-iid]', m.el);
  const calc = () => {
    let total = 0, todo = true;
    inputs.forEach(inp => {
      const i = items.find(x => x.id === +inp.dataset.iid);
      const c = Math.min(decimal(inp.value), i.disponible);
      const monto = Math.round(i.precio_efectivo * c);
      total += monto;
      if (c < i.disponible) todo = false;
      $(`[data-monto="${i.id}"]`, m.el).textContent = clp(monto);
    });
    // todo lo que queda: se devuelve exacto lo cobrado
    if (todo && v.items.every(i => i.disponible === 0 || items.includes(i))) total = v.total - v.devuelto_total;
    $('#dv-total', m.el).textContent = clp(total);
  };
  inputs.forEach(i => i.addEventListener('input', calc));
  $('#dv-todo', m.el).addEventListener('click', () => { inputs.forEach(inp => { const i = items.find(x => x.id === +inp.dataset.iid); inp.value = String(i.disponible).replace('.', ','); }); calc(); });
  setTimeout(() => inputs[0] && inputs[0].focus(), 50);
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const body = { metodo: f.metodo.value, motivo: f.motivo.value,
      items: inputs.map(inp => ({ venta_item_id: +inp.dataset.iid, cantidad: decimal(inp.value),
        reingresa_stock: (() => { const c = $(`[data-stock="${inp.dataset.iid}"]`, m.el); return c ? c.checked : false; })() })).filter(x => x.cantidad > 0) };
    if (!body.items.length) return toast('Indica la cantidad a devolver', 'error');
    if (!esAdmin()) { body.admin_usuario = f.admin_usuario.value; body.admin_clave = f.admin_clave.value; }
    try {
      const r = await api(`/ventas/${v.id}/devolver`, { method: 'POST', body });
      m.cerrar(); avisarImpresion(r); await refrescarCaja();
      if (alCambiar) alCambiar();
      if (imprimeNavegador()) imprimirEnNavegador(r.ticket_texto, r.nota_credito && r.nota_credito.timbre_tipo === 'imagen' ? r.nota_credito.ted : null);
      mostrarTicket(`Devolución N° ${r.id} registrada`, r.ticket_texto,
        `<div class="aviso" style="font-size:1.1rem">${r.metodo === 'efectivo' ? `Entrega ${clp(r.total)} en efectivo al cliente` : r.metodo === 'fiado' ? `Se descontaron ${clp(r.total)} de la cuenta del cliente` : `Reversa ${clp(r.total)} por ${nombreMetodo(r.metodo)}`}</div>`);
    } catch (err) { toast(err.message, 'error', 6000); }
  });
}

function anularVenta(v, alCambiar) {
  const efectivo = v.pagos.filter(p => p.metodo === 'efectivo').reduce((a, p) => a + p.monto, 0);
  const otros = v.pagos.filter(p => p.metodo !== 'efectivo');
  const m = modal(`<form class="form"><h2>Anular venta N° ${v.folio}</h2>
    <div class="aviso peligro" style="display:block">La venta <strong>no se borra</strong>: queda marcada como ANULADA en el historial y en el corte de caja.
      Se devuelve el stock de los productos y el monto sale del total de la caja.</div>
    <div class="lineas"><div><span>Total de la venta</span><strong>${clp(v.total)}</strong></div>
      ${efectivo ? `<div><span>Efectivo a devolver al cliente</span><strong>${clp(efectivo)}</strong></div>` : ''}
      ${otros.map(p => `<div><span>${nombreMetodo(p.metodo)} (reversar en la máquina/banco)</span><strong>${clp(p.monto)}</strong></div>`).join('')}</div>
    <label>Motivo (obligatorio)<textarea name="motivo" rows="2" required autofocus placeholder="Ej: el cliente se arrepintió"></textarea></label>
    ${esAdmin() ? '' : `<div class="det">Necesitas la autorización de un administrador:</div>
      <div class="grid2"><label>Usuario administrador<input name="admin_usuario" autocomplete="off"></label>
      <label>Clave<input name="admin_clave" type="password" autocomplete="off"></label></div>`}
    <div class="acciones"><button type="button" class="btn" data-cerrar>Volver</button><button class="btn peligro">Anular venta</button></div></form>`);
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (!f.motivo.value.trim()) return toast('Escribe el motivo de la anulación', 'error');
    const body = { motivo: f.motivo.value };
    if (!esAdmin()) { body.admin_usuario = f.admin_usuario.value; body.admin_clave = f.admin_clave.value; }
    try {
      const r = await api(`/ventas/${v.id}/anular`, { method: 'POST', body });
      m.cerrar();
      avisarImpresion(r);
      await refrescarCaja();
      if (alCambiar) alCambiar();
      if (imprimeNavegador()) imprimirTicketVenta(r);
      if ((r.documentos || []).some(d => d.tipo === 61)) revisarBoletas();
      mostrarTicket(`Venta N° ${r.folio} anulada`, r.ticket_texto,
        r.devolver_efectivo ? `<div class="aviso" style="font-size:1.15rem">Devuelve ${clp(r.devolver_efectivo)} en efectivo al cliente</div>` : '');
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ================================================================== CAJA
VISTAS.caja = async () => {
  const v = $('#vista');
  let d;
  try { d = await refrescarCaja(); } catch (e) { return toast(e.message, 'error'); }
  const panelCajas = esAdmin() && cajasVarias() ? '<div id="todas-cajas"></div>' : '';
  if (!d.abierta) {
    v.innerHTML = `${panelCajas}<div class="panel seccion" style="max-width:460px">
      <h2>Abrir ${cajasVarias() ? esc(d.terminal_nombre) : 'caja'}</h2>
      <form class="form" id="f-abrir">
        <label>Fondo inicial (efectivo con que parte la caja)<input name="monto" inputmode="numeric" placeholder="$0" autofocus></label>
        <button class="btn primario grande">Abrir caja</button>
      </form></div>
      <div class="panel seccion"><h3>Cortes anteriores</h3><div id="historial" class="det">Cargando…</div></div>`;
    $('[name=monto]').focus();
    $('#f-abrir').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('/caja/abrir', { method: 'POST', body: { monto_inicial: entero(e.target.monto.value) } });
        toast('Caja abierta');
        await refrescarCaja();
        vigilarRespaldoDia();
        irA('venta');
      } catch (err) { toast(err.message, 'error'); }
    });
    cargarHistorial();
    if (panelCajas) pintarTodasLasCajas();
    return;
  }
  v.innerHTML = `${panelCajas}
    <div class="tarjetas">
      ${d.ciego ? `<div class="panel tarjeta"><span>Fondo inicial</span><strong>${clp(d.monto_inicial)}</strong></div>
      <div class="panel tarjeta"><span>Turno</span><strong>Abierto</strong><div class="det">desde las ${hora(d.abierta_en)}</div></div>` : `
      <div class="panel tarjeta"><span>Ventas</span><strong>${d.ventas_cantidad}</strong></div>
      <div class="panel tarjeta"><span>Total vendido</span><strong>${clp(d.ventas_total)}</strong>${d.anuladas_cantidad ? `<div class="badge rojo">${d.anuladas_cantidad} anulada${d.anuladas_cantidad === 1 ? '' : 's'} (${clp(d.anuladas_total)})</div>` : ''}</div>
      <div class="panel tarjeta"><span>Fondo inicial</span><strong>${clp(d.monto_inicial)}</strong></div>
      <div class="panel tarjeta destacada"><span>Efectivo en caja</span><strong>${clp(d.efectivo_esperado_calc)}</strong></div>`}
    </div>
    <div class="caja-grid">
      <div class="panel seccion">
        <h3>Resumen del turno${cajasVarias() ? ` · ${esc(d.terminal_nombre)}` : ''}</h3>
        <div class="det" style="margin-bottom:10px">Abierta por ${esc(d.abierta_por_nombre)} · ${fechaHora(d.abierta_en)}</div>
        <div class="lineas">
          ${d.ciego ? '<div class="det"><span>Por seguridad, las ventas y el efectivo esperado los ve solo el administrador. Cuenta el dinero de la caja y presiona <strong>Cerrar caja</strong> al terminar tu turno.</span></div>' : `
          ${METODOS.map(([k, t]) => `<div><span>Ventas ${t.toLowerCase()}</span><strong>${clp(d.por_metodo[k] || 0)}</strong></div>`).join('')}
          <div><span>Ingresos de efectivo</span><strong>${clp(d.ingresos)}</strong></div>
          <div><span>Retiros de efectivo</span><strong>-${clp(d.retiros)}</strong></div>
          ${d.abonos_total ? `<div><span>Abonos de clientes (${METODOS.filter(([k]) => d.abonos[k]).map(([k, t]) => t.toLowerCase() + ' ' + clp(d.abonos[k])).join(', ')})</span><strong>${clp(d.abonos_total)}</strong></div>` : ''}
          ${d.devoluciones_total ? `<div><span>Devoluciones (${d.devoluciones_cantidad})${d.devoluciones.efectivo ? ' · efectivo ' + clp(d.devoluciones.efectivo) : ''}</span><strong>-${clp(d.devoluciones_total)}</strong></div>` : ''}
          ${d.pagos_proveedores ? `<div><span>Pagos a proveedores desde caja</span><strong>-${clp(d.pagos_proveedores)}</strong></div>` : ''}`}
        </div>
        <div class="acciones" style="justify-content:flex-start;flex-wrap:wrap">
          <button class="btn" id="b-ingreso">+ Ingreso</button>
          <button class="btn" id="b-retiro">− Retiro</button>
          <button class="btn" id="b-cajon">Abrir cajón</button>
          <div style="flex:1"></div>
          <button class="btn primario" id="b-cerrar">Cerrar caja (corte)</button>
        </div>
      </div>
      <div class="panel seccion">
        <h3>Movimientos de efectivo</h3>
        ${d.movimientos.length ? `<table class="tabla"><tbody>${d.movimientos.map(mv => `<tr>
          <td>${hora(mv.fecha)}</td><td><span class="badge ${mv.tipo === 'retiro' ? 'rojo' : 'verde'}">${mv.tipo}</span></td>
          <td>${esc(mv.motivo || '')}<div class="det">${esc(mv.usuario)}</div></td>
          <td class="num"><strong>${mv.tipo === 'retiro' ? '-' : ''}${clp(mv.monto)}</strong></td></tr>`).join('')}</tbody></table>`
        : '<div class="det">Sin movimientos. Usa “Retiro” para pagos a proveedores o sacar dinero, e “Ingreso” para agregar sencillo.</div>'}
      </div>
    </div>`;
  const mov = tipo => async () => {
    const m = modal(`<form class="form"><h2>${tipo === 'ingreso' ? 'Ingreso de efectivo' : 'Retiro de efectivo'}</h2>
      <label>Monto<input name="monto" inputmode="numeric" autofocus></label>
      <label>Motivo${tipo === 'retiro' ? ' (obligatorio)' : ''}<input name="motivo" ${tipo === 'retiro' ? 'required' : ''} placeholder="${tipo === 'ingreso' ? 'Ej: sencillo' : 'Ej: pago al proveedor de pan'}"></label>
      <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Registrar</button></div></form>`);
    $('form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      if (tipo === 'retiro' && !e.target.motivo.value.trim()) return toast('Escribe el motivo del egreso', 'error');
      try {
        const r = await api('/caja/movimiento', { method: 'POST', body: { tipo, monto: entero(e.target.monto.value), motivo: e.target.motivo.value.trim() } });
        avisarImpresion(r);
        m.cerrar(); toast('Movimiento registrado'); VISTAS.caja();
      } catch (err) { toast(err.message, 'error'); }
    });
  };
  $('#b-ingreso').addEventListener('click', mov('ingreso'));
  $('#b-retiro').addEventListener('click', mov('retiro'));
  $('#b-cajon').addEventListener('click', async () => {
    try { const r = await api('/caja/abrir-cajon', { method: 'POST' }); if (r.impresion_error) avisarImpresion(r); else toast('Cajón abierto'); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#b-cerrar').addEventListener('click', () => cerrarCaja(d));
  if (panelCajas) pintarTodasLasCajas();
};

function cerrarCaja(d) {
  if (hayVentasEnCurso()) return toast('Hay ventas en curso (o en espera). Termínalas o cancélalas antes de cerrar.', 'aviso');
  const esperado = d.efectivo_esperado_calc;
  const m = modal(`<form class="form"><h2>Cerrar caja</h2>
    ${d.ciego ? '<div class="det">Cuenta todo el efectivo que hay en la caja, incluido el fondo inicial. El resultado lo revisa el administrador.</div>'
      : `<div class="lineas"><div><span>Efectivo que debería haber</span><strong>${clp(esperado)}</strong></div></div>`}
    <label>Efectivo contado<input name="contado" inputmode="numeric" autofocus placeholder="Cuenta los billetes y monedas"></label>
    <div id="cc-dif" class="det">&nbsp;</div>
    <label>Notas (opcional)<textarea name="notas" rows="2"></textarea></label>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Cerrar caja</button></div></form>`);
  const inp = $('[name=contado]', m.el);
  inp.addEventListener('input', () => {
    if (d.ciego) return;   // cierre a ciegas: no se muestra si cuadra
    if (!inp.value.trim()) { $('#cc-dif', m.el).innerHTML = '&nbsp;'; return; }
    const dif = entero(inp.value) - esperado;
    $('#cc-dif', m.el).innerHTML = dif === 0 ? '<strong class="dif-pos">Cuadra exacto</strong>'
      : `<strong class="${dif > 0 ? 'dif-pos' : 'dif-neg'}">${dif > 0 ? 'Sobrante' : 'Faltante'} de ${clp(Math.abs(dif))}</strong>`;
  });
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    if (!inp.value.trim()) return toast('Ingresa el efectivo contado', 'error');
    try {
      const r = await api('/caja/cerrar', { method: 'POST', body: { monto_contado: entero(inp.value), notas: e.target.notas.value } });
      m.cerrar();
      avisarImpresion(r);
      await refrescarCaja();
      await VISTAS.caja();
      if (imprimeNavegador()) imprimirEnNavegador(r.ticket_texto);
      avisoRespaldoDia(r.respaldo_dia);
    } catch (err) { toast(err.message, 'error'); }
  });
}

function pintarRespaldoDia(r) {
  const el = $('#respaldo-dia');
  if (!el) return;
  if (!respaldoDiaEnCierre || S.vista !== 'caja' || !r || !r.aviso) {
    el.className = 'actualizacion-aviso respaldo-dia oculto';
    el.textContent = '';
    return;
  }
  el.className = 'actualizacion-aviso respaldo-dia ' + (r.tono || 'espera');
  el.textContent = r.aviso;
}

let respaldoDiaSeq = 0;
let respaldoDiaTimer = 0;
let respaldoDiaEnCierre = false;

function ocultarRespaldoDia() {
  respaldoDiaEnCierre = false;
  clearTimeout(respaldoDiaTimer);
  respaldoDiaSeq++;
  const el = $('#respaldo-dia');
  if (!el) return;
  el.className = 'actualizacion-aviso respaldo-dia oculto';
  el.textContent = '';
}

function programarRespaldoDia(r) {
  clearTimeout(respaldoDiaTimer);
  if (!respaldoDiaEnCierre || S.vista !== 'caja' || !r || !r.aviso || r.tono === 'listo') return;
  respaldoDiaTimer = setTimeout(vigilarRespaldoDia, r.tono === 'guardar' ? 700 : 2500);
}

async function vigilarRespaldoDia() {
  if (!S.user) return;
  if (S.vista !== 'caja') { ocultarRespaldoDia(); return; }
  if (!respaldoDiaEnCierre) return;
  const seq = ++respaldoDiaSeq;
  try {
    const r = await api('/caja/respaldo-dia');
    if (seq !== respaldoDiaSeq || !respaldoDiaEnCierre || S.vista !== 'caja') return;
    pintarRespaldoDia(r);
    programarRespaldoDia(r);
  } catch (e) { /* la caja sigue usable */ }
}

function avisoRespaldoDia(r) {
  if (!r || !r.aviso) return;
  if (S.vista !== 'caja') { ocultarRespaldoDia(); return; }
  respaldoDiaEnCierre = true;
  const seq = ++respaldoDiaSeq;
  clearTimeout(respaldoDiaTimer);
  if (r.tono !== 'guardar') {
    pintarRespaldoDia(r);
    programarRespaldoDia(r);
    return;
  }
  // Si el cierre ya dejó el respaldo listo, no pintes el aviso de espera.
  respaldoDiaTimer = setTimeout(() => {
    if (seq !== respaldoDiaSeq || !respaldoDiaEnCierre || S.vista !== 'caja') return;
    pintarRespaldoDia(r);
  }, 150);
  api('/caja/respaldo-dia').then(actual => {
    if (seq !== respaldoDiaSeq || !respaldoDiaEnCierre || S.vista !== 'caja') return;
    clearTimeout(respaldoDiaTimer);
    const usar = actual && actual.aviso ? actual : r;
    pintarRespaldoDia(usar);
    programarRespaldoDia(usar);
  }).catch(() => {
    if (seq !== respaldoDiaSeq || !respaldoDiaEnCierre || S.vista !== 'caja') return;
    clearTimeout(respaldoDiaTimer);
    pintarRespaldoDia(r);
    programarRespaldoDia(r);
  });
}

setInterval(vigilarRespaldoDia, 8000);

async function cargarHistorial() {
  try {
    const h = (await api('/caja/historial')).filter(x => x.estado === 'cerrada');
    const conCaja = cajasVarias();
    if (h.length && h[0].ciego) {
      $('#historial').innerHTML = `<table class="tabla"><thead><tr>${conCaja ? '<th>Caja</th>' : ''}<th>Apertura</th><th>Cierre</th><th class="num">Efectivo contado</th></tr></thead><tbody>
        ${h.map(x => `<tr>${conCaja ? `<td>${esc(x.terminal_nombre || '')}</td>` : ''}<td>${fechaHora(x.abierta_en)}</td><td>${fechaHora(x.cerrada_en)}</td><td class="num">${clp(x.monto_contado)}</td></tr>`).join('')}</tbody></table>`;
      return;
    }
    $('#historial').innerHTML = h.length ? `<table class="tabla"><thead><tr>${conCaja ? '<th>Caja</th>' : ''}<th>Apertura</th><th>Cierre</th><th class="num">Ventas</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead><tbody>
      ${h.map(x => { const dif = x.monto_contado - x.efectivo_esperado; return `<tr>${conCaja ? `<td>${esc(x.terminal_nombre || '')}</td>` : ''}<td>${fechaHora(x.abierta_en)}</td><td>${fechaHora(x.cerrada_en)}</td>
        <td class="num">${clp(x.ventas_total)}</td><td class="num">${clp(x.efectivo_esperado)}</td><td class="num">${clp(x.monto_contado)}</td>
        <td class="num ${dif < 0 ? 'dif-neg' : dif > 0 ? 'dif-pos' : ''}"><strong>${dif ? clp(dif) : 'OK'}</strong></td></tr>`; }).join('')}</tbody></table>`
      : 'Aún no hay cortes.';
  } catch (e) { $('#historial').textContent = e.message; }
}

// ================================================================== PRODUCTOS
VISTAS.productos = () => {
  const v = $('#vista');
  v.innerHTML = `<div id="inv-resumen" class="tarjetas"></div><div id="inv-pend"></div><div class="panel">
    <div class="barra">
      <input type="search" id="p-q" placeholder="Buscar por nombre o código" autocomplete="off">
      <label class="check"><input type="checkbox" id="p-bajo"> Solo stock bajo</label>
      <button class="btn" id="p-importar">Importar Excel</button>
      <button class="btn" id="p-exportar">Exportar Excel</button>
      <button class="btn primario" id="p-nuevo">+ Nuevo producto</button>
    </div>
    <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th>
      <th class="num">Costo</th><th class="num">Venta</th><th class="num">Margen</th><th class="num">Stock</th><th></th></tr></thead>
      <tbody id="p-lista"></tbody></table></div></div>`;
  let timer;
  const cargar = async () => {
    try {
      const q = $('#p-q').value.trim();
      const lista = await api(`/productos?limit=1000&q=${encodeURIComponent(q)}${$('#p-bajo').checked ? '&bajo_stock=1' : ''}`);
      $('#p-lista').innerHTML = lista.length ? lista.map(p => {
        const margen = p.precio_costo ? Math.round((p.precio_venta - p.precio_costo) / p.precio_costo * 100) : null;
        return `<tr class="click" data-id="${p.id}">
          <td>${esc(p.codigo || '—')}</td><td><strong>${esc(p.nombre)}</strong>${p.pendiente_configuracion ? ' <span class="badge rojo">Configurar precio antes de vender</span>' : ''}${p.es_combo ? ' <span class="badge oferta">combo</span>' : p.granel ? ' <span class="badge">granel</span>' : ''}</td>
          <td>${esc(p.categoria || '')}</td><td class="num">${clp(p.precio_costo)}</td>
          <td class="num"><strong>${clp(p.precio_venta)}</strong>${p.granel ? '/kg' : ''}</td>
          <td class="num">${margen === null ? '—' : margen + '%'}</td>
          <td class="num"><span class="badge ${p.bajo_stock ? 'rojo' : 'verde'}">${fmtStock(p.stock, p.granel)}</span></td>
          <td class="acciones-celda"><button class="btn chico peligro" data-borrar="${p.id}">Eliminar</button></td></tr>`;
      }).join('') : '<tr><td colspan="8" class="vacio">No hay productos. Crea el primero con “+ Nuevo producto”.</td></tr>';
      $$('#p-lista tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
        if (e.target.closest('[data-borrar]')) return;
        const p = lista.find(x => x.id === +tr.dataset.id);
        if (p.es_combo) return modal(`<h2>${esc(p.nombre)}</h2><div class="lineas">
          <div><span>Precio original</span><strong>${clp(p.precio_base)}</strong></div>
          <div><span>Precio del combo</span><strong>${clp(p.precio_venta)}</strong></div>
          <div><span>Combos disponibles</span><strong>${fmtStock(p.stock, false)}</strong></div></div>
          <h3>Componentes</h3><div class="lineas">${(p.componentes || []).map(x => `<div><span>${esc(x.nombre)} × ${x.cantidad}</span><strong>${clp(x.precio_venta * x.cantidad)}</strong></div>`).join('')}</div>
          <div class="acciones"><button class="btn primario" data-cerrar autofocus>Cerrar</button></div>`);
        formProducto(p, cargar);
      }));
      $$('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
        const p = lista.find(x => x.id === +b.dataset.borrar);
        if (!(await confirmar(`¿Eliminar “${p.nombre}”? Ya no aparecerá para vender (el historial se conserva).`, { si: 'Eliminar', peligro: true }))) return;
        try { await api('/productos/' + p.id, { method: 'DELETE' }); toast('Producto eliminado'); cargar(); }
        catch (e) { toast(e.message, 'error'); }
      }));
    } catch (e) { toast(e.message, 'error'); }
  };
  const cargarTodo = () => { cargar(); cargarResumenInventario(cargarTodo); };
  $('#p-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cargar, 200); });
  $('#p-bajo').addEventListener('change', cargar);
  $('#p-nuevo').addEventListener('click', () => formProducto(null, cargarTodo));
  $('#p-exportar').addEventListener('click', () => descargar('/productos/exportar').catch(e => toast(e.message, 'error')));
  $('#p-importar').addEventListener('click', () => importarProductos(cargarTodo));
  $('#p-q').focus();
  cargarTodo();
};

async function cargarResumenInventario(recargar) {
  try {
    const [r, pend] = await Promise.all([api('/inventario/resumen'), api('/ventas-rapidas')]);
    const box = $('#inv-resumen');
    if (!box) return;
    box.innerHTML = `
      <div class="panel tarjeta"><span>Productos</span><strong>${r.productos.toLocaleString('es-CL')}</strong>
        <div class="det">${r.unidades.toLocaleString('es-CL')} unidades${r.kilos ? ` · ${r.kilos.toLocaleString('es-CL')} kg` : ''}</div></div>
      ${r.por_vencer ? `<div class="panel tarjeta click" id="inv-venc"><span>Por vencer</span><strong class="dif-neg">${r.por_vencer}</strong><div class="det">ver vencimientos</div></div>` : ''}
      <div class="panel tarjeta click" id="inv-alertas"><span>Alertas de stock</span><strong>${r.sin_stock + r.stock_bajo}</strong>
        <div class="det">${r.sin_stock} sin stock · ${r.stock_bajo} bajo mínimo</div></div>`;
    const iv = $('#inv-venc');
    if (iv) iv.addEventListener('click', () => { S.subInv = 'vencimientos'; irA('inventario'); });
    $('#inv-alertas').addEventListener('click', () => { const c = $('#p-bajo'); if (c) { c.checked = true; c.dispatchEvent(new Event('change')); } });
    box.insertAdjacentHTML('beforeend', `<div class="panel tarjeta click" id="inv-cat"><span>Por categoría</span><strong>${r.por_categoria.length}</strong><div class="det">ver detalle</div></div>`);
    $('#inv-cat').addEventListener('click', () => modal(`<h2>Inventario por categoría</h2>
      <table class="tabla"><thead><tr><th>Categoría</th><th class="num">Productos</th></tr></thead><tbody>
      ${r.por_categoria.map(c => `<tr><td>${esc(c.categoria)}</td><td class="num">${c.productos}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td class="num"><strong>${r.productos}</strong></td></tr>
      </tbody></table><div class="acciones"><button class="btn primario" data-cerrar autofocus>Cerrar</button></div>`, { ancho: true }));
    const pb = $('#inv-pend');
    pb.innerHTML = pend.length ? `<div class="aviso" style="justify-content:space-between">
        <span>${pend.length} producto${pend.length === 1 ? '' : 's'} vendido${pend.length === 1 ? '' : 's'} con venta rápida sin registrar</span>
        <button class="btn chico" id="ver-pend">Ver y crear</button></div>` : '';
    if (pend.length) $('#ver-pend').addEventListener('click', () => {
      const m = modal(`<h2>Vendidos con venta rápida</h2>
        <p class="det">Productos que se cobraron sin estar registrados. Créalos para que la próxima vez se encuentren al escanear.</p>
        <div class="tabla-wrap" style="max-height:55vh"><table class="tabla"><thead><tr><th>Código</th><th>Nota</th><th class="num">Veces</th><th class="num">Último precio</th><th></th></tr></thead><tbody>
        ${pend.map((x, i) => `<tr><td>${esc(x.codigo || '—')}</td><td>${esc(x.nombre.replace(/^Venta rápida:?\s*/, '') || '—')}</td>
          <td class="num">${x.veces}</td><td class="num">${clp(x.ultimo_precio)}</td>
          <td class="acciones-celda"><button class="btn chico primario" data-crear="${i}">Crear producto</button></td></tr>`).join('')}
        </tbody></table></div><div class="acciones"><button class="btn" data-cerrar>Cerrar</button></div>`, { ancho: true });
      $$('[data-crear]', m.el).forEach(b => b.addEventListener('click', () => {
        const x = pend[+b.dataset.crear];
        m.cerrar();
        formProducto(null, recargar, { prefill: { codigo: x.codigo || '', nombre: x.nombre.replace(/^Venta rápida:?\s*/, ''), precio_venta: x.ultimo_precio }, continuar: false });
      }));
    });
  } catch (e) { toast(e.message, 'error'); }
}

function importarProductos(alTerminar) {
  const m = modal(`<form class="form"><h2>Importar productos desde Excel</h2>
    <div class="det">Acepta archivos <strong>.xlsx</strong> o <strong>.csv</strong>. La primera fila debe tener los títulos de las columnas:
      Código, Nombre, Categoría, Precio costo, Precio venta, Stock, Stock mínimo, Granel (SI/NO).
      Si el código ya existe, el producto se <strong>actualiza</strong>; si no, se crea. Las columnas que no vengan no se modifican.</div>
    <div><button type="button" class="btn chico" id="imp-plantilla">Descargar plantilla de ejemplo</button></div>
    <label>Archivo<input type="file" name="archivo" accept=".xlsx,.csv,.txt" required></label>
    <label class="check"><input type="checkbox" name="solo_actualizar"> Solo actualizar productos existentes (no crear nuevos)</label>
    <div id="imp-res"></div>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Cerrar</button><button class="btn primario" id="imp-ok">Importar</button></div></form>`, { ancho: true });
  $('#imp-plantilla', m.el).addEventListener('click', () => descargar('/productos/plantilla').catch(e => toast(e.message, 'error')));
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const archivo = e.target.archivo.files[0];
    if (!archivo) return;
    if (archivo.size > 15 * 1024 * 1024) return toast('El archivo es demasiado grande (máx. 15 MB)', 'error');
    const btn = $('#imp-ok', m.el);
    btn.disabled = true; btn.textContent = 'Importando…';
    try {
      const b64 = await new Promise((ok, mal) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(',')[1] || '');
        fr.onerror = () => mal(new Error('No se pudo leer el archivo'));
        fr.readAsDataURL(archivo);
      });
      const r = await api('/productos/importar', { method: 'POST', body: { nombre: archivo.name, contenido_b64: b64, solo_actualizar: e.target.solo_actualizar.checked } });
      $('#imp-res', m.el).innerHTML = `<div class="aviso ${r.total_errores ? '' : 'ok'}" style="display:block">
        ${r.creados} creado${r.creados === 1 ? '' : 's'} · ${r.actualizados} actualizado${r.actualizados === 1 ? '' : 's'}${r.omitidos ? ` · ${r.omitidos} omitido${r.omitidos === 1 ? '' : 's'}` : ''}
        ${r.total_errores ? ` · <strong>${r.total_errores} fila${r.total_errores === 1 ? '' : 's'} con error</strong>` : ''}</div>
        ${r.errores.length ? `<div class="tabla-wrap" style="max-height:200px"><table class="tabla"><tbody>${r.errores.map(x => `<tr><td>Fila ${x.fila}</td><td>${esc(x.error)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
      if (alTerminar) alTerminar();
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false; btn.textContent = 'Importar';
  });
}

async function formProducto(p, alGuardar, { prefill = {}, continuar = true, guardadoAntes = '' } = {}) {
  const ini = p || prefill;
  let cats = [];
  try { cats = await api('/categorias'); } catch (e) { return toast(e.message, 'error'); }
  const opciones = sel => `<option value="">Sin categoría</option>${cats.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}<option value="__nueva">+ Nueva categoría…</option>`;
  const m = modal(`<form class="form" id="f-prod"><h2>${p ? 'Editar producto' : 'Nuevo producto'}</h2>
    ${guardadoAntes ? `<div class="aviso ok" id="f-guardado-antes">✓ «${esc(guardadoAntes)}» quedó guardado. Este es un formulario nuevo: puedes agregar el siguiente producto o cerrar.</div>` : ''}
    ${p?.pendiente_configuracion ? '<div class="aviso" style="display:block">Producto del catálogo pendiente: configura precio de venta mayor a $0 para habilitarlo. Revisa costo, stock y mínimo de tu negocio.</div>' : ''}
    <div class="grid2">
      <label>Código de barras<input name="codigo" value="${esc(ini.codigo || '')}" placeholder="Escanéalo aquí" autocomplete="off" autofocus></label>
      <label>Categoría<select name="categoria_id">${opciones(p?.categoria_id)}</select></label>
      <label class="full">Nombre<input name="nombre" value="${esc(ini.nombre || '')}" required autocomplete="off"></label>
      <label>Precio de costo<input name="precio_costo" inputmode="numeric" value="${p ? p.precio_costo : ''}" placeholder="$0"></label>
      <label>Precio de venta<input name="precio_venta" inputmode="numeric" value="${ini.precio_venta ?? ''}" required placeholder="$0"></label>
      <div class="full det" id="f-margen">&nbsp;</div>
      <label>Stock actual<input name="stock" inputmode="decimal" value="${p ? String(p.stock).replace('.', ',') : ''}" placeholder="0"></label>
      <label>Stock mínimo (alerta)<input name="stock_minimo" inputmode="decimal" value="${p ? String(p.stock_minimo).replace('.', ',') : ''}" placeholder="0"></label>
      <label class="check full"><input type="checkbox" name="granel" ${p?.granel ? 'checked' : ''}> Se vende a granel (por kilo): precio y stock en kg</label>
      <label class="full" id="f-plu-box">PLU en la balanza (opcional)<input name="plu" value="${esc(ini.plu || '')}" inputmode="numeric" maxlength="6" placeholder="Ej: 123" autocomplete="off">
        <span class="det">El número con que este producto está grabado en la balanza que imprime etiquetas. Así, al escanear la etiqueta se cobra solo.</span></label>
    </div>
    <div class="acciones">${p ? '<button type="button" class="btn" id="f-kardex" style="margin-right:auto">Ver movimientos de stock</button>' : ''}
      <button type="button" class="btn neutro" data-cerrar>Cancelar</button>
      ${!p && continuar ? '<button type="button" class="btn neutro" id="f-guardar-cerrar">Guardar y cerrar</button><button class="btn primario">Guardar y agregar otro</button>' : `<button class="btn primario">${p ? 'Guardar cambios' : 'Guardar'}</button>`}</div></form>`, { ancho: true });
  const f = $('#f-prod', m.el);
  const bk = $('#f-kardex', m.el);
  if (bk) bk.addEventListener('click', () => verMovimientosProducto(p));
  const bgc = $('#f-guardar-cerrar', m.el);
  if (bgc) bgc.addEventListener('click', () => enviarFormularioYSalir(f));
  const margen = () => {
    const c = entero(f.precio_costo.value), v = entero(f.precio_venta.value);
    $('#f-margen', m.el).innerHTML = c && v ? `Ganancia por ${f.granel.checked ? 'kg' : 'unidad'}: <strong class="${v >= c ? 'dif-pos' : 'dif-neg'}">${clp(v - c)}</strong> · margen sobre costo ${Math.round((v - c) / c * 100)}%` : '&nbsp;';
  };
  f.precio_costo.addEventListener('input', margen);
  f.precio_venta.addEventListener('input', margen);
  f.granel.addEventListener('change', margen);
  const verPlu = () => $('#f-plu-box', m.el).classList.toggle('oculto', !f.granel.checked && !f.plu.value);
  f.granel.addEventListener('change', verPlu);
  verPlu();
  margen();
  if (!p && ini.codigo) setTimeout(() => f.nombre.focus(), 60);
  // El lector de código de barras envía Enter: pasar al nombre en vez de guardar
  f.codigo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.nombre.focus(); } });
  f.categoria_id.addEventListener('change', async () => {
    if (f.categoria_id.value !== '__nueva') return;
    const nombre = await pedir('Nueva categoría', { label: 'Nombre' });
    if (!nombre) { f.categoria_id.value = ''; return; }
    try {
      const c = await api('/categorias', { method: 'POST', body: { nombre } });
      if (!cats.some(x => x.id === c.id)) cats.push(c);
      f.categoria_id.innerHTML = opciones(c.id);
    } catch (e) { toast(e.message, 'error'); f.categoria_id.value = ''; }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const soloGuardar = f.dataset.alGuardarSalir === '1'; // "Guardar y cerrar" o "Guardar y salir" del aviso
    delete f.dataset.alGuardarSalir;
    const body = {
      codigo: f.codigo.value.trim(), nombre: f.nombre.value.trim(),
      categoria_id: f.categoria_id.value && f.categoria_id.value !== '__nueva' ? +f.categoria_id.value : null,
      precio_costo: entero(f.precio_costo.value), precio_venta: entero(f.precio_venta.value),
      stock: decimal(f.stock.value), stock_minimo: decimal(f.stock_minimo.value), granel: f.granel.checked, plu: f.plu.value.trim(),
    };
    if (!f.precio_venta.value.trim()) return toast('Falta el precio de venta', 'error');
    try {
      const guardado = await api(p ? '/productos/' + p.id : '/productos', { method: p ? 'PUT' : 'POST', body });
      const nombreGuardado = (guardado && guardado.nombre) || body.nombre;
      m.cerrar(); toast(`✓ «${nombreGuardado}» ${p ? 'actualizado' : 'guardado'}`, 'ok', 3500);
      if (alGuardar) alGuardar(guardado);
      // carga continua: queda listo para escanear el siguiente, avisando que el anterior ya se guardó
      if (!p && continuar && !soloGuardar) formProducto(null, alGuardar, { guardadoAntes: nombreGuardado });
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ================================================================== CONFIGURACIÓN
VISTAS.config = async () => {
  const v = $('#vista');
  let cfg;
  try { cfg = S.cfg = await api('/config'); } catch (e) { return toast(e.message, 'error'); }
  const esCajaCliente = cajasVarias() && String(cfg.terminal_id) !== '1';
  const modoImpresora = cfg.impresora_modo;
  const campo = (k, label, extra = '') => `<label>${label}<input name="${k}" value="${esc(cfg[k])}" ${extra}></label>`;
  const check = (k, label) => `<label class="check"><input type="checkbox" name="${k}" ${cfg[k] === '1' ? 'checked' : ''}> ${label}</label>`;
  v.innerHTML = `<form id="f-cfg"><div id="cfg-conexiones"></div><div class="config-grid">
    <div class="panel seccion form">
      <h3>Datos del negocio</h3>
      ${campo('negocio_nombre', 'Nombre')}${campo('negocio_rut', 'RUT', 'placeholder="76.123.456-7"')}
      ${campo('negocio_direccion', 'Dirección')}${campo('negocio_telefono', 'Teléfono')}
      ${campo('ticket_pie', 'Mensaje al final del ticket')}
      <label>Logo del negocio en el ticket<input id="ticket-logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <div id="ticket-logo-prev"></div>
      <div class="det">Se imprime arriba del ticket cuando la caja usa el diálogo del navegador. La impresora térmica por agente sigue en texto.</div>
      <div class="acciones" style="justify-content:flex-start">
        <button type="button" class="btn" id="b-logo">Guardar logo</button>
        <button type="button" class="btn neutro" id="b-logo-quitar">Quitar logo</button>
      </div>
    </div>
    <div class="panel seccion form">
      <h3>Datos para transferencias</h3>
      ${check('transferencia_pago', 'Habilitar pago por transferencia en ventas y abonos de clientes')}
      ${check('transferencia_imprimir', 'Mostrar botón Imprimir datos de transferencia')}
      <div class="det">Son opciones independientes. Desmarca ambas si el negocio no usa transferencias; no aparecerán al vender. Los datos bancarios y pagos anteriores se conservan.</div>
      <div class="grid2">${campo('transferencia_titular', 'Titular de la cuenta', 'placeholder="Ej: Juan Pérez" autocomplete="off"')}
        ${campo('transferencia_rut', 'RUT del titular', 'placeholder="12.345.678-5" autocomplete="off"')}
        ${campo('transferencia_banco', 'Banco')}${campo('transferencia_tipo_cuenta', 'Tipo de cuenta', 'placeholder="Cuenta corriente, vista…"')}
        ${campo('transferencia_numero', 'Número de cuenta')}${campo('transferencia_email', 'Correo para comprobantes', 'type="email" placeholder="pagos@ejemplo.cl" autocomplete="off"')}</div>
    </div>
    <div class="panel seccion form">
      <h3>Impresora de tickets${cajasVarias() ? ` <span class="badge azul">${esc(cfg.terminal_nombre)}</span>` : ''}</h3>
      ${cajasVarias() ? `<div class="det">Esta configuración es solo para <strong>${esc(cfg.terminal_nombre)}</strong>. En una caja cliente o en el PC principal elige <strong>Impresora de este PC (automática)</strong>: imprime directo en la impresora de ese computador, sin compartirla ni crear cuentas de Windows, y también sin red ni internet (en el PC principal, o si prefieres, «Impresora instalada en Windows»).</div>` : ''}
      <label>Conexión<select name="impresora_modo">
        ${[['ninguna', 'Sin impresora'], ['agente', 'Impresora de este PC (automática)'], ['windows', esCajaCliente ? 'Impresora compartida desde otro PC (avanzado)' : 'Impresora instalada en Windows'], ['red', 'Impresora de red (IP)'], ['navegador', 'Imprimir desde navegador'], ['archivo', 'Guardar en archivo (pruebas)']]
          .map(([k, t]) => `<option value="${k}" ${modoImpresora === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div id="imp-agente" class="det">Comprobando…</div>
      <div id="imp-navegador" class="det">Este modo abre el diálogo de impresión del navegador. El cajón no se abre solo.</div>
      <div id="imp-windows"><label>Impresora<select name="impresora_nombre"><option value="${esc(cfg.impresora_nombre)}">${esc(cfg.impresora_nombre || 'Cargando…')}</option></select></label></div>
      <div id="imp-red" class="grid2">${campo('impresora_ip', 'IP', 'placeholder="192.168.1.50"')}${campo('impresora_puerto', 'Puerto', 'inputmode="numeric"')}</div>
      <label>Ancho del papel<select name="ticket_ancho">
        <option value="80" ${cfg.ticket_ancho === '80' ? 'selected' : ''}>80 mm</option><option value="58" ${cfg.ticket_ancho === '58' ? 'selected' : ''}>58 mm</option></select></label>
      ${check('ticket_auto_imprimir', 'Imprimir ticket automáticamente en cada venta')}
      ${check('cajon_abrir_efectivo', 'Abrir el cajón al cobrar en efectivo')}
      ${check('redondeo_efectivo', 'Redondear pagos en efectivo a la decena (Ley 20.956)')}
      <div class="iva-fila">${check('iva_activo', 'Mostrar IVA incluido en tickets y corte de caja')}
        <label class="iva-tasa">Tasa %<input name="iva_tasa" value="${esc(cfg.iva_tasa)}" inputmode="decimal"></label></div>
      <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn" id="b-prueba">Imprimir prueba</button></div>
    </div>
    <div class="panel seccion form">
      <h3>Respaldos</h3>
      <div class="grid2">${campo('respaldo_intervalo_min', 'Respaldo automático cada (minutos)', 'inputmode="numeric"')}
        ${campo('respaldo_copias', 'Copias locales a mantener', 'inputmode="numeric"')}</div>
      <div class="det">También se respalda al cerrar la caja. Las copias quedan en la carpeta <code>datos\\respaldos</code>. El respaldo en la nube está deshabilitado.</div>
      <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn" id="b-respaldar">Respaldar ahora</button></div>
      <div id="lista-resp" class="det"></div>
    </div>
    <div class="panel seccion" id="cfg-licencia"></div>
    <div class="panel seccion" id="cfg-apariencia"></div>
    <div class="panel seccion" id="cfg-cajas"></div>
    <div class="panel seccion">
      <h3>Usuarios</h3>
      <div id="usuarios"></div>
      <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn" id="b-nuevo-u">+ Nuevo usuario</button></div>
    </div>
  </div>
  <div class="acciones" style="position:sticky;bottom:0;padding:12px 0;background:var(--bg)"><button class="btn primario grande">Guardar configuración</button></div></form>`;
  const f = $('#f-cfg');
  const rutNegocio = f.elements.negocio_rut;
  if (rutNegocio) conectarFormatoRut(rutNegocio);
  const telefonoNegocio = f.elements.negocio_telefono;
  if (telefonoNegocio) conectarFormatoTelefono(telefonoNegocio, false);
  if (f.elements.transferencia_rut) conectarFormatoRut(f.elements.transferencia_rut);
  const modoVisible = () => {
    $('#imp-windows').classList.toggle('oculto', f.impresora_modo.value !== 'windows');
    $('#imp-red').classList.toggle('oculto', f.impresora_modo.value !== 'red');
    $('#imp-navegador').classList.toggle('oculto', f.impresora_modo.value !== 'navegador');
    $('#imp-agente').classList.toggle('oculto', f.impresora_modo.value !== 'agente');
    if (f.impresora_modo.value === 'agente') estadoAgente();
  };
  // Estado del agente de impresión de ESTE PC y elección de su impresora (por defecto usa la predeterminada de Windows)
  const estadoAgente = async () => {
    const caja = $('#imp-agente');
    try {
      const e = await (await fetch(AGENTE_URL + '/estado')).json();
      caja.innerHTML = `<span class="badge verde">Conectado</span> Imprime en: <strong>${esc(e.impresora || 'ninguna')}</strong>
        <label>Impresora de este PC<select id="ag-impresora"><option value="">La predeterminada de Windows${e.predeterminada ? ' (' + esc(e.predeterminada) + ')' : ''}</option>
        ${e.impresoras.map(n => `<option ${n === e.elegida ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
      $('#ag-impresora').addEventListener('change', async ev => {
        try { await fetch(AGENTE_URL + '/config', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ impresora: ev.target.value }) }); toast('Impresora de este PC guardada'); estadoAgente(); }
        catch (err) { toast('No se pudo guardar: ' + err.message, 'error'); }
      });
    } catch (err) {
      caja.innerHTML = `<span class="badge rojo">Sin agente</span> No se detecta el agente de impresión en este PC. Se instala con <strong>MiPOS Caja</strong> (instalación «Caja cliente»): ábrela en este computador. Mientras tanto se usará el diálogo del navegador. Si este es el PC principal, elige «Impresora instalada en Windows».`;
    }
  };
  const cargarImpresorasWindows = () => api('/impresoras').then(lista => {
    const sel = f.impresora_nombre;
    if (!sel || sel.tagName !== 'SELECT') return;
    if (!lista.length) { sel.outerHTML = `<input name="impresora_nombre" value="${esc(cfg.impresora_nombre)}" placeholder="Nombre instalado en el PC principal (o \\\\PC\\Impresora)">`; return; }
    sel.innerHTML = `<option value="">Elige una impresora…</option>` + lista.map(n => `<option ${n === cfg.impresora_nombre ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }).catch(() => {});
  f.impresora_modo.addEventListener('change', () => {
    modoVisible();
    if (f.impresora_modo.value === 'windows') cargarImpresorasWindows();
  });
  modoVisible();
  if (modoImpresora === 'windows') cargarImpresorasWindows();
  const leerForm = () => {
    const d = {};
    Object.keys(cfg).forEach(k => {
      const el = f.elements[k];
      if (!el) return;
      d[k] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
    });
    return d;
  };
  const guardar = async (silencioso = false) => {
    S.cfg = await api('/config', { method: 'PUT', body: leerForm() });
    marcarFormularioGuardado(f);
    $('.rail .marca span').textContent = S.cfg.negocio_nombre;
    if (!silencioso) toast('Configuración guardada');
  };
  f.addEventListener('submit', async e => { e.preventDefault(); try { await guardar(); } catch (err) { toast(err.message, 'error'); } });
  $('#b-prueba').addEventListener('click', async () => {
    try {
      await guardar(true);
      const r = await api('/impresora/prueba', { method: 'POST', body: { cajon: true } });
      if (r.modo === 'navegador') imprimirEnNavegador(r.ticket_texto);
      mostrarTicket(r.impresion_error ? 'Error de impresión' : (r.modo === 'ninguna' ? 'Vista previa (sin impresora)' : 'Prueba enviada'), r.ticket_texto,
        r.impresion_error ? `<div class="aviso peligro">${esc(r.impresion_error)}</div>` : '');
    } catch (e) { toast(e.message, 'error'); }
  });
  const cargarRespaldos = async () => {
    try {
      const l = await api('/respaldos');
      $('#lista-resp').innerHTML = l.length ? `<table class="tabla"><tbody>${l.slice(0, 8).map(r => `<tr><td>${fechaHora(r.creado)}</td><td>${esc(r.motivo)}</td>
        <td class="num">${(r.tamano / 1024).toFixed(0)} KB</td><td>${r.subido ? '<span class="badge verde">en la nube</span>' : r.error ? `<span class="badge rojo" title="${esc(r.error)}">error</span>` : '<span class="badge">local</span>'}</td></tr>`).join('')}</tbody></table>` : 'Aún no hay respaldos.';
    } catch (e) { /* nada */ }
  };
  $('#b-respaldar').addEventListener('click', async e => {
    e.target.disabled = true;
    try { await guardar(true); const r = await api('/respaldos', { method: 'POST' }); toast('Respaldo creado · ' + r.nube); cargarRespaldos(); }
    catch (err) { toast(err.message, 'error'); }
    e.target.disabled = false;
  });
  const pintarLogo = () => {
    const box = $('#ticket-logo-prev');
    if (!box) return;
    box.innerHTML = S.cfg.ticket_logo
      ? `<img alt="Logo del ticket" src="${esc(S.cfg.ticket_logo)}" style="max-width:180px;max-height:80px;object-fit:contain;background:#fff;padding:6px;border-radius:8px">`
      : '<span class="det">Sin logo.</span>';
  };
  const guardarLogo = async (logo) => {
    const r = await api('/ticket/logo', { method: 'POST', body: { logo } });
    S.cfg.ticket_logo = r.ticket_logo || '';
    pintarLogo();
    toast(S.cfg.ticket_logo ? 'Logo del ticket guardado' : 'Logo del ticket quitado');
  };
  pintarLogo();
  $('#b-logo').addEventListener('click', () => {
    const file = $('#ticket-logo-file').files[0];
    if (!file) return toast('Elige una imagen PNG, JPG o WEBP', 'aviso');
    if (file.size > 400000) return toast('El logo es muy pesado (máximo 400 KB)', 'error');
    const lector = new FileReader();
    lector.onload = async () => {
      try { await guardarLogo(String(lector.result || '')); }
      catch (err) { toast(err.message, 'error'); }
    };
    lector.readAsDataURL(file);
  });
  $('#b-logo-quitar').addEventListener('click', async () => {
    try { await guardarLogo(''); }
    catch (err) { toast(err.message, 'error'); }
  });
  pintarApariencia();
  pintarLicencia();
  cargarRespaldos();
  cargarUsuarios();
  pintarConexiones();
  pintarConfigCajas();
  $('#b-nuevo-u').addEventListener('click', () => formUsuario(null));
};

async function pintarLicencia() {
  const box = $('#cfg-licencia');
  if (!box) return;
  let l;
  try { l = S.lic = await api('/licencia/estado'); } catch (e) { return; }
  const c = l.contacto || {};
  const fecha = f => new Date(f + 'T12:00').toLocaleDateString('es-CL');
  const contrato = l.tipo === 'clave' ? l.contrato : l.vence;
  const dc = diasHasta(contrato);
  const TIPOS_LIC = { prueba: 'Prueba gratis', clave: 'Clave de producto', codigo: 'Código de activación' };
  const demo = l.tipo === 'prueba';
  box.innerHTML = `<h3>Licencia</h3>
    <div class="lineas">
      <div><span>Cliente</span><strong>${esc(l.cliente || '—')}</strong></div>
      <div><span>Tipo</span><strong>${TIPOS_LIC[l.tipo] || '—'}${l.tipo === 'clave' ? '<span class="lic-nota">Se renueva sola por internet</span>' : ''}</strong></div>
      <div><span>${demo ? 'Estaciones de esta demo' : 'Equipos a la vez'}</span><strong>${demo ? l.estaciones_demo : (l.cajas || '—')}</strong></div>
      <div><span>Vence</span><strong>${contrato ? fecha(contrato) + (dc !== null && dc <= 30 ? ` (en ${dc} días)` : '') : 'Sin vencimiento'}</strong></div>
      <div><span>Código de este equipo</span><strong class="codigo-equipo">${esc(l.id_equipo)}</strong></div>
    </div>
    ${demo ? `<div style="display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:12px">
      <label>Estaciones solicitadas para esta demo<input id="demo-estaciones" type="number" min="1" max="50" step="1" value="${l.estaciones_demo}" style="max-width:150px"></label>
      <button type="button" class="btn" id="b-demo-estaciones">Guardar cantidad</button>
      <span class="det">No cambia la licencia; solo define el cupo de estaciones de prueba.</span></div>`
      : `<div class="det" style="margin-top:8px">Para más cajas o renovar: ${esc(c.nombre || '')}${c.whatsapp ? ' · ' + esc(c.whatsapp) : ''}${c.email ? ' · ' + esc(c.email) : ''}</div>`}
    <div class="acciones" style="justify-content:flex-start">
      ${l.tienda ? `<button type="button" class="btn primario" id="b-comprar-lic">${l.valida && !demo ? 'Renovar o ampliar' : 'Comprar licencia'}</button>` : ''}
      ${l.en_linea ? `<button type="button" class="btn ${l.tienda ? '' : 'primario'}" id="b-clave-lic">Ingresar clave de producto</button>` : ''}
      ${l.en_linea && l.tipo !== 'codigo' ? '<button type="button" class="btn" id="b-renovar-lic">Comprobar ahora</button>' : ''}
      <button type="button" class="btn" id="b-cambiar-lic">${l.en_linea ? 'Usar código (sin internet)' : 'Ingresar nuevo código'}</button></div>
    <div id="cfg-equipos"></div>`;
  pintarEquiposConectados();
  const bDemo = $('#b-demo-estaciones', box);
  if (bDemo) bDemo.addEventListener('click', async () => {
    bDemo.disabled = true;
    try {
      const estaciones = Number($('#demo-estaciones', box).value);
      const r = await api('/licencia/demo-estaciones', { method: 'POST', body: { estaciones } });
      S.lic.estaciones_demo = r.estaciones;
      toast(`Demo configurada para ${r.estaciones} estaciones`, 'ok');
      pintarLicencia();
    } catch (err) { toast(err.message, 'error'); bDemo.disabled = false; }
  });
  const bcm = $('#b-comprar-lic', box); if (bcm) bcm.addEventListener('click', () => comprarLicencia());
  const bcl = $('#b-clave-lic', box);
  if (bcl) bcl.addEventListener('click', () => pedirClaveProducto(pintarLicencia));
  const brn = $('#b-renovar-lic', box);
  if (brn) brn.addEventListener('click', async () => {
    brn.disabled = true;
    try {
      const r = await api('/licencia/renovar', { method: 'POST', body: {} });
      toast(r.resultado === 'renovada' ? 'Licencia al día' : r.resultado === 'revocada' ? 'La licencia fue desactivada' : 'Sin cambios', r.resultado === 'revocada' ? 'error' : 'ok');
      if (!r.valida) return renderActivacion(r);
      pintarLicencia();
    } catch (err) { toast(err.message, 'error', 7000); brn.disabled = false; }
  });
  $('#b-cambiar-lic', box).addEventListener('click', () => {
    const m = modal(`<form class="form"><h2>Nuevo código de activación</h2>
      <div class="det">Úsalo cuando te envíen una licencia renovada o con más cajas para este equipo (${esc(l.id_equipo)}).</div>
      <label>Código<textarea name="codigo" rows="4" spellcheck="false" autofocus></textarea></label>
      <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primario">Activar</button></div></form>`);
    $('form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      try { S.lic = await api('/licencia/activar', { method: 'POST', body: { codigo: e.target.codigo.value } }); m.cerrar(); toast('Licencia actualizada'); pintarLicencia(); }
      catch (err) { toast(err.message, 'error', 7000); }
    });
  });
}

function abrirModalApariencia() {
  const m = modal(`<div class="form modal-apariencia" data-sin-aviso-cambios>
    <div id="modal-apariencia-box"></div>
    <div class="acciones"><button type="button" class="btn" data-cerrar>Listo</button></div>
  </div>`, { ancho: true });
  pintarApariencia($('#modal-apariencia-box', m.el));
}

function pintarApariencia() {
  const root = arguments[0];
  const cajas = root ? [root] : [$('#cfg-apariencia'), $('#modal-apariencia-box')].filter(Boolean);
  if (!cajas.length) return;
  const tema = prefApariencia('mipos_tema', 'claro'), acento = prefApariencia('mipos_acento', 'cobalto');
  const estilo = document.documentElement.dataset.estilo || 'neutro';
  const fijo = estilo === 'windows-claro' || estilo === 'windows-oscuro';
  cajas.forEach(box => {
    const suf = box.id === 'cfg-apariencia' ? '' : '-modal';
    box.innerHTML = `<h3>Apariencia de este equipo</h3>
      <div class="det">Elige para probar al instante. Se guarda automáticamente solo en este navegador/equipo; no necesitas Guardar configuración.</div>
      <div class="ap-estilos">${ESTILOS.map(([k, nombre, detalle]) => `<button type="button" class="ap-estilo ${estilo === k ? 'activo' : ''}" data-estilo="${k}" aria-pressed="${estilo === k}">
        <span class="ap-mini ap-mini-${k}" aria-hidden="true"><span></span><b>$12.500</b><i>Cobrar</i></span>
        <strong>${nombre}</strong><small>${detalle}</small></button>`).join('')}</div>
      ${fijo ? '<div class="det">Este estilo tiene modo fijo. Para seguir el modo de Windows o elegir color de acento, selecciona Neutro para caja o MiPOS original.</div>' : ''}
      <div class="ap-fila"><span>Tema</span><div class="seg">${[['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Según Windows']].map(([k, t]) =>
        `<label><input type="radio" name="ap-tema${suf}" value="${k}" ${(!fijo && tema === k) || (fijo && k === (estilo === 'windows-oscuro' ? 'oscuro' : 'claro')) ? 'checked' : ''} ${fijo ? 'disabled' : ''}> ${t}</label>`).join('')}</div></div>
      <div class="ap-fila ${fijo ? 'oculto' : ''}"><span>Color</span><div class="muestras">${ACENTOS.map(([k, t]) =>
        `<button type="button" class="muestra m-${k} ${acento === k ? 'activa' : ''}" data-acento="${k}" title="${t}" aria-label="Color ${t}"></button>`).join('')}</div></div>`;
    $$('[data-estilo]', box).forEach(b => b.addEventListener('click', () => {
      guardarApariencia('mipos_estilo', b.dataset.estilo); pintarApariencia();
      $('[data-estilo="' + b.dataset.estilo + '"]', box)?.focus();
    }));
    $$(`[name="ap-tema${suf}"]`, box).forEach(x => x.addEventListener('change', () => {
      guardarApariencia('mipos_tema', x.value); pintarApariencia();
    }));
    $$('[data-acento]', box).forEach(b => b.addEventListener('click', () => {
      guardarApariencia('mipos_acento', b.dataset.acento); pintarApariencia();
    }));
  });
}

async function cargarUsuarios() {
  try {
    const l = await api('/usuarios');
    if (!S.catPermisos) {
      S.catPermisos = await api('/permisos/catalogo');
      if (!S.catPermisos.some(x => x.clave === 'stock_pan_granel')) {
        S.catPermisos.push({ clave: 'stock_pan_granel', nombre: 'Ingresar pan a granel', defecto: false, perfiles: { cajero: false, supervisor: false } });
      }
    }
    $('#usuarios').innerHTML = `<table class="tabla"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th></tr></thead><tbody>
      ${l.map(u => `<tr class="click" data-id="${u.id}"><td><strong>${esc(u.nombre)}</strong></td><td>${esc(u.usuario)}</td>
        <td><span class="badge ${u.rol === 'admin' ? 'azul' : u.perfil === 'supervisor' ? 'amarillo' : ''}">${u.perfil || u.rol}</span></td>
        <td>${u.activo ? '<span class="badge verde">activo</span>' : '<span class="badge rojo">inactivo</span>'}</td></tr>`).join('')}</tbody></table>`;
    $$('#usuarios tr[data-id]').forEach(tr => tr.addEventListener('click', () => formUsuario(l.find(u => u.id === +tr.dataset.id))));
  } catch (e) { toast(e.message, 'error'); }
}

function campoPermiso(x, u) {
  const valor = (u?.permisos || {})[x.clave] ?? x.defecto;
  if (x.clave === 'descuento_max') {
    return `<label>Descuento máximo sin autorización (%)<input name="perm_${x.clave}" inputmode="decimal" value="${esc(valor ?? 0)}"></label>`;
  }
  return `<label class="check"><input type="checkbox" name="perm_${x.clave}" ${valor ? 'checked' : ''}> ${esc(x.nombre)}</label>`;
}
function formUsuario(u) {
  const m = modal(`<form class="form"><h2>${u ? 'Editar usuario' : 'Nuevo usuario'}</h2>
    <label>Nombre<input name="nombre" value="${esc(u?.nombre || '')}" required autofocus></label>
    <label>Usuario (para ingresar)<input name="usuario" value="${esc(u?.usuario || '')}" ${u ? 'disabled' : 'required'} autocomplete="off"></label>
    <label>Rol<select name="rol"><option value="cajero">Cajero (solo vende)</option>
      <option value="supervisor">Supervisor (intermedio)</option>
      <option value="admin">Administrador (todo)</option></select></label>
    <label>${u ? 'Nueva clave (déjalo vacío para no cambiarla)' : 'Clave (mínimo 4 caracteres)'}<input name="clave" type="password" ${u ? '' : 'required'} autocomplete="new-password"></label>
    ${u ? `<label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo</label>` : ''}
    <fieldset class="permisos" id="u-perm"><legend>Qué puede hacer sin pedir autorización</legend>
      <div class="det">Marca solo lo que este cajero puede hacer solo. Pan a granel, retiros y el resto se eligen uno por uno.</div>
      <div class="permisos-grid">${(S.catPermisos || []).map(x => campoPermiso(x, u)).join('')}</div>
    </fieldset>
    <div class="acciones"><button type="button" class="btn neutro" data-cerrar>Cancelar</button>
      <button class="btn primario">${u ? 'Guardar cambios' : 'Crear usuario'}</button></div></form>`, { ancho: true });
  const fr = $('form', m.el);
  fr.rol.value = u ? (u.perfil || u.rol) : 'cajero';
  const verPerm = () => $('#u-perm', m.el).classList.toggle('oculto', fr.rol.value === 'admin');
  // Al elegir un rol se marcan sus permisos de partida; después se puede agregar o quitar lo que se quiera
  const aplicarPerfil = () => {
    if (fr.rol.value === 'admin') return;
    (S.catPermisos || []).forEach(x => {
      const v = x.perfiles ? x.perfiles[fr.rol.value] : x.defecto;
      const inp = fr['perm_' + x.clave];
      if (!inp) return;
      if (x.clave === 'descuento_max') inp.value = v ?? 0;
      else inp.checked = !!v;
    });
  };
  fr.rol.addEventListener('change', () => { aplicarPerfil(); verPerm(); });
  if (!u) aplicarPerfil();
  verPerm();
  $('form', m.el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const body = { nombre: f.nombre.value, rol: f.rol.value, clave: f.clave.value };
    if (f.rol.value !== 'admin') body.permisos = Object.fromEntries((S.catPermisos || []).map(x => [x.clave,
      x.clave === 'descuento_max' ? decimal(f['perm_' + x.clave].value) : f['perm_' + x.clave].checked]));
    try {
      if (u) await api('/usuarios/' + u.id, { method: 'PUT', body: { ...body, activo: f.activo.checked } });
      else {
        await api('/usuarios', { method: 'POST', body: { ...body, usuario: f.usuario.value } });
        m.cerrar();
        modal(`<div class="form"><h2>Recordatorio</h2>
          <div class="aviso" style="display:block">Revisa la clave inicial y los permisos del nuevo usuario antes de entregárselo.</div>
          <div class="det">Asegúrate de cambiar la contraseña y confirmar qué puede hacer.</div>
          <div class="acciones"><button type="button" class="btn primario" data-cerrar autofocus>Entendido</button></div></div>`);
      }
      if (u) { m.cerrar(); toast('Usuario guardado'); }
      cargarUsuarios();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ------------------------------------------------------------------ atajos de teclado
document.addEventListener('keydown', e => {
  if (!S.user) return;
  if (e.key === 'Escape' && S.modales.length) { e.preventDefault(); S.modales[S.modales.length - 1].cerrar(); return; }
  if (S.modales.length || S.vista !== 'venta') return;
  if (e.key === 'F2') { e.preventDefault(); enfocarScan(); }
  else if (e.key === 'F4') { e.preventDefault(); ventaRapida(); }
  else if (e.key === 'F12' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); cobrar(); }
  else if (e.key === 'Escape') {
    e.preventDefault();
    if (!$('#sug').classList.contains('oculto')) ocultarSug();
    else cancelarVenta();
  }
});

// Reenfocar el lector de códigos si se hace clic en un área vacía de la venta
document.addEventListener('click', e => {
  if (S.vista === 'venta' && !S.modales.length && !e.target.closest('input, button, select, textarea, a, .sug')) enfocarScan();
});

// se inicia cuando ya cargaron todos los archivos (equipos.js, sinred.js…), que se usan desde el primer momento
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
window.addEventListener('pageshow', e => { if (e.persisted) iniciar(); });
