import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./static/app.js', import.meta.url), 'utf8');
const inicio = src.indexOf('function campoPermiso');
const fin = src.indexOf('// ------------------------------------------------------------------ atajos de teclado');
if (inicio < 0 || fin < 0) throw new Error('no encontré el formulario de usuario');
const trozo = src.slice(inicio, fin);

const avisos = [];
const contexto = {
  S: {
    catPermisos: [
      { clave: 'retiros', nombre: 'Retiros e ingresos de efectivo', defecto: false, perfiles: { cajero: false, supervisor: true } },
      { clave: 'descuento_max', nombre: 'Descuento máximo', defecto: 10, perfiles: { cajero: 0, supervisor: 30 } },
      { clave: 'stock_pan_granel', nombre: 'Ingresar pan a granel', defecto: false, perfiles: { cajero: false, supervisor: false } },
    ],
  },
  esc: s => String(s ?? ''),
  decimal: v => parseFloat(String(v).replace(',', '.')) || 0,
  toast: (m) => avisos.push(m),
  api: async () => ({ id: 8 }),
  cargarUsuarios: () => {},
  modal(html) {
    const campos = {};
    const el = {
      querySelector(sel) {
        if (sel === 'form') return el;
        return null;
      },
      addEventListener(tipo, fn) { el['on' + tipo] = fn; },
      elements: campos,
      rol: { value: 'cajero', addEventListener() {} },
      nombre: { value: 'Ana' },
      usuario: { value: 'ana' },
      clave: { value: '1234' },
    };
    el.elements.nombre = el.nombre;
    el.elements.usuario = el.usuario;
    el.elements.clave = el.clave;
    el.elements.rol = el.rol;
    return { el, cerrar() {} };
  },
  $(sel, root) {
    if (sel === 'form') return root;
    if (sel === '#u-perm') return { classList: { toggle() {} } };
    return null;
  },
};
contexto.console = console;
vm.createContext(contexto);
vm.runInContext(trozo + '\nthis.formUsuario = formUsuario; this.campoPermiso = campoPermiso;', contexto);
if (trozo.includes('continuar')) throw new Error('el formulario de usuario todavía usa continuar');
const vista = contexto.campoPermiso(contexto.S.catPermisos[2], null);
if (!vista.includes('Ingresar pan a granel') || vista.includes('checked')) {
  throw new Error('pan a granel tiene que aparecer apagado');
}
contexto.formUsuario(null);
const envio = contexto.modal('').el;
// formUsuario ya abrió un modal real; el último listener quedó en ese form.
// Reconstruimos el alta llamando de nuevo y disparando submit.
let formulario;
contexto.modal = (html) => {
  formulario = {
    html,
    addEventListener(tipo, fn) { this['on' + tipo] = fn; },
    elements: {},
    nombre: { value: 'Ana' },
    usuario: { value: 'ana' },
    clave: { value: '1234' },
    rol: { value: 'cajero', addEventListener() {} },
    querySelector() { return this; },
  };
  formulario.elements = formulario;
  formulario['perm_retiros'] = { checked: true };
  formulario['perm_descuento_max'] = { value: '5' };
  formulario['perm_stock_pan_granel'] = { checked: false };
  return { el: formulario, cerrar() {} };
};
vm.runInContext('formUsuario(null);', contexto);
if (!formulario.html.includes('Crear usuario')) throw new Error('falta el botón Crear usuario');
if (formulario.html.includes('Guardar y agregar otro')) throw new Error('quedó el botón del formulario de productos');
await formulario.onsubmit({ preventDefault() {}, target: formulario });
console.log('formulario ok');
