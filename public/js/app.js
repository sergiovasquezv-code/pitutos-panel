import { apiGet, apiPost, apiPut, apiDelete, apiPostForm } from "./api.js";
// (apiPostForm ya se usaba para subir fotos de avances en trabajos; se
// reutiliza aquí para las fotos del estado de un equipo.)
import { clp, escapeHtml, telefonoWhatsapp, soloDigitosTelefono, formatearRut } from "./format.js";

const TIPOS_TRABAJO = ["Programación", "Soporte técnico", "Instalación", "Mantención", "Otro"];
const ESTADOS_TRABAJO = ["Pendiente", "En curso", "Esperando cliente", "Cliente no ubicado", "Demostración", "Terminado"];

const els = {
  content: document.getElementById("content"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  topActions: document.getElementById("top-actions"),
  flashArea: document.getElementById("flash-area"),
  sidebarNav: document.getElementById("sidebar-nav"),
  brandName: document.getElementById("brand-name"),
  usernameLabel: document.getElementById("username-label"),
};

let currentUsername = "";
let currentNombreNegocio = "Mis Pitutos Informáticos";

// Único emoji que usamos en los mensajes de WhatsApp: ✅ está dentro del
// plano básico multilingüe (no necesita par subrogado), así que se envía
// bien por cualquier vía. A propósito NO usamos emojis "astrales" como la
// mano saludando o las manos aplaudiendo: el mecanismo que usa WhatsApp
// para prellenar un mensaje desde un link a veces no los decodifica bien
// y el cliente termina viendo un "�" en vez del emoji.
const EMOJI_CHECK = String.fromCodePoint(0x2705);

// Se agrega al final de los mensajes de WhatsApp que le llegan al cliente,
// para que además del link puntual (garantía, seguimiento, comprobante)
// conozca la web principal del negocio.
const SITIO_WEB_NEGOCIO = "https://mispitutosinformaticos.cl/";
let flashTimer = null;

// Fecha larga en español (ej: "15 de septiembre de 2026"), a partir de un
// string "YYYY-MM-DD". Se arma a mano (sin pasar por Date con el string
// completo) para no correr riesgo de que la zona horaria del navegador
// corra el día para atrás o adelante.
function fechaLarga(fechaYMD) {
  if (!fechaYMD) return "";
  const [y, m, d] = String(fechaYMD).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fechaYMD;
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", { dateStyle: "long" });
}
function flash(msg, type = "success") {
  els.flashArea.innerHTML = `<div class="flash ${type}">${escapeHtml(msg)}</div>`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    els.flashArea.innerHTML = "";
  }, 4500);
}

function setPage({ title, subtitle = "", actions = "" }) {
  els.pageTitle.textContent = title;
  els.pageSubtitle.innerHTML = subtitle;
  els.topActions.innerHTML = actions;
  document.getElementById("doc-title").textContent = `${title} · Pitutos Panel`;
}

function setContent(html) {
  els.content.innerHTML = html;
}

// La navegación de los botones/filas con [data-goto] se maneja con un único
// listener delegado (ver bootstrap más abajo), así funciona sin importar si
// el elemento vive en el contenido central o en las acciones del topbar.
// Esta función se mantiene como no-op por compatibilidad con las llamadas
// existentes después de cada render.
function attachNav() {}

function setActiveNav(section) {
  els.sidebarNav.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === section);
  });
}

async function handleAuthError(err) {
  if (err && err.status === 401) {
    window.location.href = "/login.html";
    return true;
  }
  return false;
}

function badgeGarantia(equipo) {
  if (equipo.estado_garantia === "sin_garantia") {
    return `<span class="badge neutral">Sin garantía</span>`;
  }
  if (equipo.estado_garantia === "vencida") {
    const dias = -equipo.dias_restantes;
    return `<span class="badge danger">&#9888; Vencida hace ${dias}d</span>`;
  }
  if (equipo.estado_garantia === "por_vencer") {
    return `<span class="badge warn">&#9888; Por vencer (${equipo.dias_restantes}d)</span>`;
  }
  return `<span class="badge ok">&#10003; Vigente (${equipo.dias_restantes}d)</span>`;
}

// Igual que badgeGarantia pero para un grupo de equipos: muestra el peor
// caso (si alguno venció, manda esa; si no, si alguno está por vencer,
// manda esa; si no, vigente con los días del que vence antes).
function badgeGarantiaGrupo(miembros) {
  const conGarantia = miembros.filter((e) => e.estado_garantia !== "sin_garantia");
  const sufijoSinGarantia =
    conGarantia.length && conGarantia.length < miembros.length
      ? ` <span class="hint">(${miembros.length - conGarantia.length} sin garantía)</span>`
      : "";

  if (conGarantia.length === 0) {
    return `<span class="badge neutral">Sin garantía</span>`;
  }

  const vencidos = conGarantia.filter((e) => e.estado_garantia === "vencida");
  if (vencidos.length) {
    const peor = vencidos.reduce((a, b) => (b.dias_restantes < a.dias_restantes ? b : a));
    const dias = -peor.dias_restantes;
    return `<span class="badge danger">&#9888; Vencida hace ${dias}d</span>${sufijoSinGarantia}`;
  }
  const porVencer = conGarantia.filter((e) => e.estado_garantia === "por_vencer");
  if (porVencer.length) {
    const peor = porVencer.reduce((a, b) => (b.dias_restantes < a.dias_restantes ? b : a));
    return `<span class="badge warn">&#9888; Por vencer (${peor.dias_restantes}d)</span>${sufijoSinGarantia}`;
  }
  const dias = conGarantia.reduce((min, e) => Math.min(min, e.dias_restantes), Infinity);
  return `<span class="badge ok">&#10003; Vigente (${dias}d)</span>${sufijoSinGarantia}`;
}

// Campo reutilizable de "Meses de garantía" con un checkbox "Sin garantía"
// (para ítems que llevan precio pero no garantía, ej: configuraciones).
// Marcar el checkbox deja el número en 0, que es lo que interpreta el
// backend como "sin garantía" (ver equipoConGarantia en negocio.js).
function campoMesesGarantia(meses) {
  const sinGarantia = Number(meses) === 0;
  return `
    <div class="field"><label for="meses_garantia">Meses de garantía</label>
      <input type="number" id="meses_garantia" min="0" step="1" value="${sinGarantia ? 3 : meses}" ${sinGarantia ? "disabled" : ""}>
      <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin-top:6px;">
        <input type="checkbox" id="chk-sin-garantia" ${sinGarantia ? "checked" : ""}>
        Sin garantía (ej: configuraciones u otros ítems sin garantía)
      </label>
    </div>`;
}

// Conecta el checkbox de "Sin garantía" con el input numérico dentro del
// wrapper indicado (document o un contenedor específico, para no chocar
// con otros equipos abiertos a la vez en la misma hoja).
function wireSinGarantiaCheckbox(scope) {
  const chk = scope.querySelector("#chk-sin-garantia");
  const input = scope.querySelector("#meses_garantia");
  if (!chk || !input) return;
  chk.addEventListener("change", () => {
    if (chk.checked) {
      input.dataset.prev = input.value && input.value !== "0" ? input.value : input.dataset.prev || "3";
      input.value = "0";
      input.disabled = true;
    } else {
      input.disabled = false;
      input.value = input.dataset.prev || "3";
    }
  });
}

// Carga los productos del catálogo (pitutos-catalogo) en el selector de
// "Registrar equipo o producto en garantía", y autocompleta tipo/marca/precio
// cuando se elige uno (además de mostrar el campo de cantidad, para poder
// descontar el stock correcto al guardar).
async function wireCatalogoProductoPicker() {
  const select = document.getElementById("catalogo_producto_id");
  if (!select) return;
  let productos = [];
  try {
    const data = await apiGet("/api/catalogo/productos");
    productos = data.productos || [];
  } catch {
    productos = [];
  }
  if (productos.length === 0) return;

  for (const p of productos) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.nombre} — stock: ${p.stock} — ${clp(p.precio)}`;
    opt.dataset.nombre = p.nombre;
    opt.dataset.precio = p.precio;
    opt.dataset.stock = p.stock;
    select.appendChild(opt);
  }

  const cantidadRow = document.getElementById("catalogo-cantidad-row");
  const cantidadInput = document.getElementById("catalogo_cantidad");
  select.addEventListener("change", () => {
    const opt = select.selectedOptions[0];
    if (!select.value || !opt.dataset.nombre) {
      cantidadRow.style.display = "none";
      return;
    }
    document.getElementById("tipo_equipo").value = opt.dataset.nombre;
    document.getElementById("precio").value = opt.dataset.precio;
    cantidadRow.style.display = "";
    cantidadInput.max = opt.dataset.stock;
    cantidadInput.value = 1;
  });
}

function badgeTrabajo(estado) {
  let cls = "neutral";
  if (estado === "Terminado") cls = "ok";
  else if (estado === "En curso") cls = "warn";
  else if (estado === "Esperando cliente") cls = "danger";
  else if (estado === "Cliente no ubicado") cls = "danger";
  else if (estado === "Demostración") cls = "accent";
  return `<span class="badge ${cls}">${escapeHtml(estado)}</span>`;
}

async function clienteOptions(selectedId) {
  const { clientes } = await apiGet("/api/clientes");
  return clientes
    .map(
      (c) =>
        `<option value="${c.id}" ${Number(selectedId) === c.id ? "selected" : ""}>${escapeHtml(
          c.nombre
        )}</option>`
    )
    .join("");
}

/* ---------------------------------------------------------------- */
/* Dashboard                                                          */
/* ---------------------------------------------------------------- */
async function viewDashboard() {
  setPage({ title: "Inicio" });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const d = await apiGet("/api/dashboard");
  setPage({
    title: "Inicio",
    subtitle: `Resumen general de tu negocio · periodo ${d.periodo_actual}`,
  });

  const garantiaRows = [
    ...d.garantias_por_vencer.map(
      (e) => `
      <tr data-goto="#/clientes/${e.cliente_id}?equipo=${e.id}" style="cursor:pointer;">
        <td>${escapeHtml(e.cliente_nombre)}</td>
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? " · " + escapeHtml(e.marca_modelo) : ""}</td>
        <td>${e.vence}</td>
        <td>${
          e.dias_restantes === 0
            ? '<span class="badge danger">Vence hoy</span>'
            : `<span class="badge warn">Vence en ${e.dias_restantes} días</span>`
        }</td>
      </tr>`
    ),
    ...d.garantias_vencidas_30d.map(
      (e) => `
      <tr data-goto="#/clientes/${e.cliente_id}?equipo=${e.id}" style="cursor:pointer;">
        <td>${escapeHtml(e.cliente_nombre)}</td>
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? " · " + escapeHtml(e.marca_modelo) : ""}</td>
        <td>${e.vence}</td>
        <td><span class="badge danger">Vencida hace ${-e.dias_restantes} días</span></td>
      </tr>`
    ),
  ].join("");

  const trabajosRows = d.trabajos_abiertos
    .map(
      (t) => `
      <tr data-goto="#/clientes/${t.cliente_id}?trabajo=${t.id}" style="cursor:pointer;">
        <td>${escapeHtml(t.cliente_nombre)}</td>
        <td>${escapeHtml(t.tipo)}</td>
        <td>${escapeHtml(t.descripcion)}</td>
        <td>${badgeTrabajo(t.estado)}</td>
      </tr>`
    )
    .join("");

  const trabajosTerminadosRows = d.trabajos_terminados_mes
    .map(
      (t) => `
      <tr data-goto="#/clientes/${t.cliente_id}?trabajo=${t.id}" style="cursor:pointer;">
        <td>${escapeHtml(t.cliente_nombre)}</td>
        <td>${escapeHtml(t.tipo)}</td>
        <td>${escapeHtml(t.descripcion)}</td>
        <td>${fechaCortaHora(t.fecha_cierre)}</td>
      </tr>`
    )
    .join("");

  const equiposPendientesRows = d.equipos_pendientes
    .map(
      (e) => `
      <tr data-goto="#/clientes/${e.cliente_id}?equipo=${e.id}" style="cursor:pointer;">
        <td>${escapeHtml(e.cliente_nombre)}</td>
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? " · " + escapeHtml(e.marca_modelo) : ""}</td>
        <td class="num">${clp(e.precio)}</td>
        <td class="num">${clp(e.abonado)}</td>
        <td class="num"><span class="danger">${clp(e.saldo)}</span></td>
      </tr>`
    )
    .join("");

  const mensRows = d.mensualidades_pendientes
    .map(
      (m) => `
      <tr>
        <td><a data-goto="#/clientes/${m.cliente_id}">${escapeHtml(m.cliente_nombre)}</a></td>
        <td>${escapeHtml(m.descripcion)}</td>
        <td class="num">${clp(m.monto)}</td>
        <td>Día ${m.dia_cobro}</td>
        <td class="num">${clp(m.saldo)}</td>
        <td><button class="btn btn-accent btn-sm" data-pagar="${m.id}">Marcar pagado</button></td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Clientes</div><div class="value">${d.total_clientes}</div></div>
      <div class="stat-card"><div class="label">Garantías por vencer (15 días)</div>
        <div class="value ${d.garantias_por_vencer.length ? "danger" : "ok"}">${d.garantias_por_vencer.length}</div></div>
      <div class="stat-card" data-goto="#/trabajos?estado=abiertos" style="cursor:pointer;"><div class="label">Trabajos abiertos</div>
        <div class="value ${d.trabajos_abiertos.length ? "warn" : "ok"}">${d.trabajos_abiertos.length}</div></div>
      <div class="stat-card" data-goto="#/trabajos?estado=Terminado" style="cursor:pointer;"><div class="label">Trabajos cerrados este mes</div>
        <div class="value ok">${d.trabajos_terminados_mes.length}</div></div>
      <div class="stat-card"><div class="label">Mensualidades por cobrar</div>
        <div class="value ${d.mensualidades_pendientes.length ? "warn" : "ok"}">${d.mensualidades_pendientes.length} / ${d.total_mensualidades_activas}</div></div>
      <div class="stat-card"><div class="label">Ingreso cobrado este mes</div>
        <div class="value accent">${clp(d.ingreso_mes)}</div></div>
      <div class="stat-card" data-goto="#/finanzas" style="cursor:pointer;"><div class="label">Por cobrar en total</div>
        <div class="value ${d.total_por_cobrar ? "danger" : "ok"}">${clp(d.total_por_cobrar)}</div></div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Garantías por vencer o recién vencidas</h2>
        <a class="btn btn-outline btn-sm" data-goto="#/equipos">Ver todos los equipos</a></div>
      <div class="panel-body">
        ${
          garantiaRows
            ? `<table><thead><tr><th>Cliente</th><th>Equipo</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${garantiaRows}</tbody></table>`
            : `<div class="panel-empty">No hay garantías por vencer en los próximos 15 días.</div>`
        }
      </div>
    </div>

    <div class="panel" data-goto="#/trabajos?estado=abiertos" style="cursor:pointer;">
      <div class="panel-header"><h2>Trabajos abiertos</h2>
        <a class="btn btn-outline btn-sm" data-goto="#/trabajos?estado=abiertos">Ver todos</a></div>
      <div class="panel-body">
        ${
          trabajosRows
            ? `<table><thead><tr><th>Cliente</th><th>Tipo</th><th>Descripción</th><th>Estado</th></tr></thead><tbody>${trabajosRows}</tbody></table>`
            : `<div class="panel-empty">No tienes trabajos pendientes. 🎉</div>`
        }
      </div>
    </div>

    <div class="panel" data-goto="#/trabajos?estado=Terminado" style="cursor:pointer;">
      <div class="panel-header"><h2>Trabajos cerrados este mes</h2>
        <a class="btn btn-outline btn-sm" data-goto="#/trabajos?estado=Terminado">Ver todos</a></div>
      <div class="panel-body">
        ${
          trabajosTerminadosRows
            ? `<table><thead><tr><th>Cliente</th><th>Tipo</th><th>Descripción</th><th>Cerrado</th></tr></thead><tbody>${trabajosTerminadosRows}</tbody></table>`
            : `<div class="panel-empty">Todavía no cierras ningún trabajo este mes.</div>`
        }
      </div>
    </div>

    <div class="panel" data-goto="#/equipos" style="cursor:pointer;">
      <div class="panel-header"><h2>Ventas de equipo por cobrar</h2>
        <a class="btn btn-outline btn-sm" data-goto="#/equipos">Ver todos los equipos</a></div>
      <div class="panel-body">
        ${
          equiposPendientesRows
            ? `<table><thead><tr><th>Cliente</th><th>Equipo</th><th class="num">Precio</th><th class="num">Abonado</th><th class="num">Saldo</th></tr></thead><tbody>${equiposPendientesRows}</tbody></table>`
            : `<div class="panel-empty">No hay ventas de equipo con saldo pendiente. 🎉</div>`
        }
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Mensualidades pendientes de ${d.periodo_actual}</h2>
        <a class="btn btn-outline btn-sm" data-goto="#/mensualidades">Ver todas</a></div>
      <div class="panel-body">
        ${
          mensRows
            ? `<table><thead><tr><th>Cliente</th><th>Servicio</th><th class="num">Monto</th><th>Día de cobro</th><th class="num">Saldo</th><th></th></tr></thead><tbody>${mensRows}</tbody></table>`
            : `<div class="panel-empty">Todas las mensualidades activas están al día. 👍</div>`
        }
      </div>
    </div>
  `);

  attachNav();
  els.content.querySelectorAll("[data-pagar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await apiPost(`/api/mensualidades/${btn.dataset.pagar}/pagar`, {});
        flash("Pago registrado.");
        viewDashboard();
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });
}

/* ---------------------------------------------------------------- */
/* Clientes                                                            */
/* ---------------------------------------------------------------- */
async function viewClientesList(q) {
  setPage({
    title: "Clientes",
    actions: `<button class="btn btn-accent" data-goto="#/clientes/nuevo">+ Nuevo cliente</button>`,
  });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const { clientes } = await apiGet(`/api/clientes${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  const rows = clientes
    .map(
      (c) => `
      <tr data-goto="#/clientes/${c.id}" style="cursor:pointer;">
        <td><strong>${escapeHtml(c.nombre)}</strong></td>
        <td>${escapeHtml(c.telefono || "—")}</td>
        <td>${escapeHtml(c.email || "—")}</td>
        <td>${escapeHtml(c.direccion || "—")}</td>
      </tr>`
    )
    .join("");

  setContent(`
    <form class="search-box" id="search-form">
      <input type="text" id="q" value="${escapeHtml(q || "")}" placeholder="Buscar por nombre, teléfono o correo...">
      <button type="submit" class="btn btn-outline">Buscar</button>
    </form>
    <div class="panel"><div class="panel-body">
      ${
        rows
          ? `<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Dirección</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty-state"><div class="big-ic">👤</div>
             <p>${q ? `No se encontraron clientes para "${escapeHtml(q)}".` : "Todavía no tienes clientes registrados."}</p>
             <button class="btn btn-accent" data-goto="#/clientes/nuevo">Agregar tu primer cliente</button></div>`
      }
    </div></div>
  `);
  attachNav();
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("q").value.trim();
    window.location.hash = value ? `#/clientes?q=${encodeURIComponent(value)}` : "#/clientes";
  });
}

async function viewClienteForm(id) {
  let cliente = null;
  if (id) {
    const data = await apiGet(`/api/clientes/${id}`);
    cliente = data.cliente;
  }
  setPage({ title: cliente ? "Editar cliente" : "Nuevo cliente" });
  setContent(`
    <div class="form-card">
      <form id="cliente-form">
        <div class="field">
          <label for="nombre">Nombre completo *</label>
          <input type="text" id="nombre" required value="${escapeHtml(cliente?.nombre || "")}">
        </div>
        <div class="form-grid">
          <div class="field"><label for="telefono">Teléfono</label>
            <div class="input-prefix-group">
              <span class="input-prefix">+56 9</span>
              <input type="tel" id="telefono" inputmode="numeric" maxlength="8" placeholder="12345678" value="${escapeHtml(soloDigitosTelefono(cliente?.telefono))}">
            </div></div>
          <div class="field"><label for="email">Correo</label>
            <input type="email" id="email" value="${escapeHtml(cliente?.email || "")}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="rut">RUT</label>
            <input type="text" id="rut" inputmode="text" maxlength="12" placeholder="12.345.678-9" value="${escapeHtml(cliente?.rut || "")}">
            <span class="hint">Para que el cliente pueda consultar la garantía de sus equipos en la web principal con su RUT.</span></div>
          <div class="field"><label for="direccion">Dirección</label>
            <input type="text" id="direccion" value="${escapeHtml(cliente?.direccion || "")}"></div>
        </div>
        <div class="field"><label for="notas">Notas</label>
          <textarea id="notas">${escapeHtml(cliente?.notas || "")}</textarea></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-accent">Guardar</button>
          <button type="button" class="btn btn-outline" data-goto="${cliente ? `#/clientes/${cliente.id}` : "#/clientes"}">Cancelar</button>
        </div>
      </form>
    </div>
  `);
  attachNav();
  const inputTelefono = document.getElementById("telefono");
  // Solo deja escribir dígitos en el campo del teléfono (el prefijo +56 9
  // es fijo y no forma parte de lo que el usuario edita).
  inputTelefono.addEventListener("input", () => {
    inputTelefono.value = inputTelefono.value.replace(/\D/g, "").slice(0, 8);
  });
  const inputRut = document.getElementById("rut");
  // Va formateando el RUT a medida que se escribe (puntos de miles + guión
  // antes del dígito verificador), para que quede parejo en todos los
  // clientes sin que el usuario tenga que acordarse del formato.
  inputRut.addEventListener("input", () => {
    inputRut.value = formatearRut(inputRut.value);
  });
  document.getElementById("cliente-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const digitos = inputTelefono.value.replace(/\D/g, "");
    // Si no escribió ningún dígito, no tiene sentido guardar solo el prefijo.
    const telefono = digitos ? `+56 9 ${digitos}` : "";
    const payload = {
      nombre: document.getElementById("nombre").value,
      telefono,
      email: document.getElementById("email").value,
      direccion: document.getElementById("direccion").value,
      notas: document.getElementById("notas").value,
      rut: inputRut.value.trim(),
    };
    try {
      if (cliente) {
        await apiPut(`/api/clientes/${cliente.id}`, payload);
        flash("Cliente actualizado.");
        window.location.hash = `#/clientes/${cliente.id}`;
      } else {
        const res = await apiPost("/api/clientes", payload);
        flash("Cliente creado.");
        window.location.hash = `#/clientes/${res.id}`;
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });
}

async function viewClienteDetalle(id, opts = {}) {
  setPage({ title: "Cliente" });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const { cliente, equipos, trabajos, mensualidades } = await apiGet(`/api/clientes/${id}`);

  setPage({
    title: cliente.nombre,
    subtitle: `Cliente desde ${cliente.creado_en.slice(0, 10)}`,
    actions: `
      <div class="actions-row">
        <button class="btn btn-outline" data-goto="#/clientes/${cliente.id}/editar">Editar</button>
        <button class="btn btn-danger-outline" id="btn-eliminar-cliente">Eliminar</button>
      </div>`,
  });

  const saldoTotalCliente =
    equipos.reduce((s, e) => s + (e.saldo || 0), 0) +
    trabajos.reduce((s, t) => s + (t.saldo || 0), 0) +
    mensualidades.filter((m) => m.activo).reduce((s, m) => s + (m.saldo || 0), 0);

  // Los equipos que comparten grupo_id (una venta tipo "sistema" con varios
  // componentes que comparten garantía) se compactan en UNA fila/bloque en
  // vez de una por cada componente — ver cargarGrupoInline más abajo. Los
  // equipos sueltos (grupo_id null) se siguen viendo exactamente igual que
  // antes, sin ningún cambio.
  const grupos = new Map();
  const equiposSueltos = [];
  for (const e of equipos) {
    if (e.grupo_id) {
      if (!grupos.has(e.grupo_id)) grupos.set(e.grupo_id, { id: e.grupo_id, nombre: e.grupo_nombre, miembros: [] });
      grupos.get(e.grupo_id).miembros.push(e);
    } else {
      equiposSueltos.push(e);
    }
  }

  // Cada fila apunta (con scroll suave) a su propio bloque de detalle, que
  // va SIEMPRE desplegado más abajo en esta misma hoja — no hay que apretar
  // nada para verlo, la fila es solo un atajo para bajar directo a él.
  const filaEquipoSuelto = (e) => `
      <tr data-scroll-target="equipo-block-${e.id}" style="cursor:pointer;">
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? `<br><span class="muted">${escapeHtml(e.marca_modelo)}</span>` : ""}</td>
        <td>${escapeHtml(e.numero_serie || "—")}</td>
        <td class="num">${clp(e.precio)}</td>
        <td class="num">${e.saldo > 0 ? `<span class="danger">${clp(e.saldo)}</span>` : clp(0)}</td>
        <td>${e.fecha_venta}</td>
        <td>${badgeGarantia(e)}</td>
      </tr>`;

  const filaGrupo = (g) => {
    const precioTotal = g.miembros.reduce((s, e) => s + (e.precio || 0), 0);
    const saldoTotal = g.miembros.reduce((s, e) => s + (e.saldo || 0), 0);
    const ventaMasReciente = g.miembros.reduce((max, e) => (e.fecha_venta > max ? e.fecha_venta : max), g.miembros[0].fecha_venta);
    return `
      <tr data-scroll-target="grupo-block-${g.id}" style="cursor:pointer;">
        <td><strong>&#128230; ${escapeHtml(g.nombre)}</strong><br><span class="muted">${g.miembros.length} equipos agrupados</span></td>
        <td>—</td>
        <td class="num">${clp(precioTotal)}</td>
        <td class="num">${saldoTotal > 0 ? `<span class="danger">${clp(saldoTotal)}</span>` : clp(0)}</td>
        <td>${ventaMasReciente}</td>
        <td>${badgeGarantiaGrupo(g.miembros)}</td>
      </tr>`;
  };

  // Se listan en el mismo orden en que ya vienen los equipos (por fecha de
  // venta descendente), mostrando cada grupo una sola vez, la primera vez
  // que aparece alguno de sus miembros.
  const gruposMostrados = new Set();
  const equiposRows = equipos
    .map((e) => {
      if (!e.grupo_id) return filaEquipoSuelto(e);
      if (gruposMostrados.has(e.grupo_id)) return "";
      gruposMostrados.add(e.grupo_id);
      return filaGrupo(grupos.get(e.grupo_id));
    })
    .join("");

  const trabajosRows = trabajos
    .map(
      (t) => `
      <tr data-scroll-target="trabajo-block-${t.id}" style="cursor:pointer;">
        <td>${escapeHtml(t.tipo)}</td>
        <td>${escapeHtml(t.descripcion)}</td>
        <td class="num">${clp(t.monto)}</td>
        <td class="num">${t.saldo > 0 ? `<span class="danger">${clp(t.saldo)}</span>` : clp(0)}</td>
        <td>${badgeTrabajo(t.estado)}</td>
      </tr>`
    )
    .join("");

  const equiposBloques =
    Array.from(grupos.values()).map((g) => `<div id="grupo-block-${g.id}" style="margin-top:14px;"></div>`).join("") +
    equiposSueltos.map((e) => `<div id="equipo-block-${e.id}" style="margin-top:14px;"></div>`).join("");
  const trabajosBloques = trabajos.map((t) => `<div id="trabajo-block-${t.id}" style="margin-top:14px;"></div>`).join("");

  const mensRows = mensualidades
    .map(
      (m) => `
      <tr data-goto="#/mensualidades/${m.id}/editar" style="cursor:pointer;">
        <td>${escapeHtml(m.descripcion)}</td>
        <td class="num">${clp(m.monto)}</td>
        <td>Día ${m.dia_cobro}</td>
        <td>${badgeEstadoCuenta(m)}</td>
        <td><span class="badge ${m.activo ? "accent" : "neutral"}">${m.activo ? "Activa" : "Inactiva"}</span></td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="panel">
      <div class="panel-header"><h2>Estado de cuenta</h2>${
        saldoTotalCliente > 0
          ? `<span class="badge danger">Saldo pendiente: ${clp(saldoTotalCliente)}</span>`
          : `<span class="badge ok">Al día</span>`
      }</div>
      <div class="panel-body padded">
        <span class="text-muted">Suma del saldo pendiente en equipos, trabajos y mensualidades activas de este cliente.</span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Datos de contacto</h2></div>
      <div class="panel-body padded">
        <div class="form-grid">
          <div><span class="text-muted">Teléfono</span><br>${escapeHtml(cliente.telefono || "—")}</div>
          <div><span class="text-muted">Correo</span><br>${escapeHtml(cliente.email || "—")}</div>
          <div><span class="text-muted">RUT</span><br>${escapeHtml(cliente.rut || "—")}</div>
          <div><span class="text-muted">Dirección</span><br>${escapeHtml(cliente.direccion || "—")}</div>
          <div><span class="text-muted">Notas</span><br>${escapeHtml(cliente.notas || "—")}</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Equipos y garantías</h2>
        <div class="actions-row">
          ${
            equipos.length > 1
              ? `<button class="btn btn-outline btn-sm" id="btn-agrupar-equipos">&#128230; Agrupar equipos</button>`
              : ""
          }
          <button class="btn btn-accent btn-sm" data-goto="#/equipos/nuevo?cliente_id=${cliente.id}">+ Registrar venta</button>
        </div>
      </div>
      <div class="panel-body">
        ${
          equiposRows
            ? `<table><thead><tr><th>Equipo</th><th>N° serie</th><th class="num">Precio</th><th class="num">Saldo</th><th>Venta</th><th>Garantía</th></tr></thead><tbody>${equiposRows}</tbody></table>`
            : `<div class="panel-empty">Sin equipos registrados todavía.</div>`
        }
      </div>
      <div class="panel-body" id="agrupar-equipos-form" style="border-top:1px solid var(--border);" hidden>
        <p class="hint" style="display:block;margin-bottom:10px;">Marca los equipos que forman parte de una misma venta (ej: un sistema de venta con Mini PC, monitor, lector e impresora) — quedarán compactados en una sola tarjeta y vas a poder generar un solo link con los que elijas enviarle al cliente.</p>
        <form id="form-crear-grupo">
          <div class="field"><label for="grupo-nombre">Nombre del grupo</label>
            <input type="text" id="grupo-nombre" required placeholder="Ej: Sistema de venta"></div>
          <div class="field"><label>Equipos a incluir</label>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${equipos
                .map(
                  (e) => `
                <label style="display:flex;align-items:center;gap:8px;font-weight:400;">
                  <input type="checkbox" class="chk-equipo-grupo" value="${e.id}">
                  ${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? " · " + escapeHtml(e.marca_modelo) : ""}
                  ${e.grupo_id ? `<span class="hint">(ya en "${escapeHtml(e.grupo_nombre)}")</span>` : ""}
                </label>`
                )
                .join("")}
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-accent btn-sm">Crear grupo</button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-cancelar-agrupar">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

    ${equiposBloques}

    <div class="panel">
      <div class="panel-header"><h2>Trabajos y soporte</h2>
        <button class="btn btn-accent btn-sm" data-goto="#/trabajos/nuevo?cliente_id=${cliente.id}">+ Nuevo trabajo</button></div>
      <div class="panel-body">
        ${
          trabajosRows
            ? `<table><thead><tr><th>Tipo</th><th>Descripción</th><th class="num">Monto</th><th class="num">Saldo</th><th>Estado</th></tr></thead><tbody>${trabajosRows}</tbody></table>`
            : `<div class="panel-empty">Sin trabajos registrados todavía.</div>`
        }
      </div>
    </div>

    ${trabajosBloques}

    <div class="panel">
      <div class="panel-header"><h2>Mensualidades</h2>
        <button class="btn btn-accent btn-sm" data-goto="#/mensualidades/nuevo?cliente_id=${cliente.id}">+ Nueva mensualidad</button></div>
      <div class="panel-body">
        ${
          mensRows
            ? `<table><thead><tr><th>Servicio</th><th class="num">Monto</th><th>Día de cobro</th><th>Este mes</th><th>Estado</th></tr></thead><tbody>${mensRows}</tbody></table>`
            : `<div class="panel-empty">Sin mensualidades registradas todavía.</div>`
        }
      </div>
    </div>
  `);

  attachNav();
  document.getElementById("btn-eliminar-cliente").addEventListener("click", async () => {
    if (!confirm(`¿Eliminar a ${cliente.nombre} y todos sus registros asociados?`)) return;
    try {
      await apiDelete(`/api/clientes/${cliente.id}`);
      flash("Cliente eliminado.");
      window.location.hash = "#/clientes";
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  const btnAgrupar = document.getElementById("btn-agrupar-equipos");
  const panelAgrupar = document.getElementById("agrupar-equipos-form");
  if (btnAgrupar) {
    btnAgrupar.addEventListener("click", () => {
      panelAgrupar.hidden = !panelAgrupar.hidden;
    });
    document.getElementById("btn-cancelar-agrupar").addEventListener("click", () => {
      panelAgrupar.hidden = true;
    });
    document.getElementById("form-crear-grupo").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = document.getElementById("grupo-nombre").value.trim();
      const equipoIds = Array.from(document.querySelectorAll(".chk-equipo-grupo:checked")).map((c) => Number(c.value));
      if (equipoIds.length < 2) {
        flash("Elige al menos 2 equipos para agrupar.", "error");
        return;
      }
      try {
        await apiPost("/api/grupos", { cliente_id: cliente.id, nombre, equipo_ids: equipoIds });
        flash("Grupo creado.");
        viewClienteDetalle(cliente.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }

  // Todos los trabajos y equipos del cliente van SIEMPRE desplegados en esta
  // misma hoja (nada de apretar para recién ver el detalle) — las filas de
  // arriba son solo un atajo con scroll suave hasta su bloque (ver el
  // listener delegado [data-scroll-target] en el bootstrap, más abajo en
  // este archivo, que también funciona para filas dentro de un trabajo).
  await Promise.all([
    ...Array.from(grupos.values()).map((g) => cargarGrupoInline(g, `grupo-block-${g.id}`, cliente)),
    ...equiposSueltos.map((e) => cargarEquipoInline(e.id, `equipo-block-${e.id}`)),
    ...trabajos.map((t) => cargarTrabajoInline(t.id, cliente.id, `trabajo-block-${t.id}`)),
  ]);

  if (opts.openTrabajoId) {
    document.getElementById(`trabajo-block-${opts.openTrabajoId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (opts.openEquipoId) {
    const eq = equipos.find((e) => String(e.id) === String(opts.openEquipoId));
    if (eq && eq.grupo_id) {
      document.getElementById(`grupo-block-${eq.grupo_id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      const detalle = document.getElementById(`equipo-detalle-${opts.openEquipoId}`);
      if (detalle) detalle.open = true;
    } else {
      document.getElementById(`equipo-block-${opts.openEquipoId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

// Renderiza el bloque compacto de UN grupo de equipos (una venta tipo
// "sistema"): resumen agregado, generador de link combinado (eligiendo
// exactamente qué componentes mandar) y cada componente colapsado en un
// <details> que, al abrirse, tiene EXACTAMENTE el mismo contenido que un
// equipo suelto (mismo formulario, mismas fotos, mismos abonos) — no se
// pierde ningún dato ni funcionalidad, solo se compacta la vista.
async function cargarGrupoInline(grupo, containerId, cliente) {
  const wrapper = document.getElementById(containerId);
  if (!wrapper) return;
  const clienteId = cliente.id;

  const miembros = grupo.miembros;
  const precioTotal = miembros.reduce((s, e) => s + (e.precio || 0), 0);
  const abonadoTotal = miembros.reduce((s, e) => s + (e.abonado || 0), 0);
  const saldoTotal = miembros.reduce((s, e) => s + (e.saldo || 0), 0);

  wrapper.innerHTML = `
    <div class="panel" style="margin-top:22px;border-color:var(--accent-dark);">
      <div class="panel-header">
        <h2>&#128230; ${escapeHtml(grupo.nombre)} <span class="muted" style="font-weight:400;">· ${miembros.length} equipos</span></h2>
        <div class="actions-row">
          <button class="btn btn-outline btn-sm" id="btn-renombrar-grupo-${grupo.id}">Renombrar</button>
          <button class="btn btn-danger-outline btn-sm" id="btn-eliminar-grupo-${grupo.id}">Desagrupar</button>
        </div>
      </div>
      <div class="panel-body padded">
        <div class="form-grid" style="margin-bottom:6px;">
          <div><span class="text-muted">Precio total</span><br><strong>${clp(precioTotal)}</strong></div>
          <div><span class="text-muted">Abonado</span><br><strong>${clp(abonadoTotal)}</strong></div>
          <div><span class="text-muted">Saldo pendiente</span><br><strong class="${saldoTotal > 0 ? "danger" : "ok"}">${clp(saldoTotal)}</strong></div>
          <div><span class="text-muted">Garantía</span><br>${badgeGarantiaGrupo(miembros)}</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px;">
      <div class="panel-header"><h2>Link para el cliente</h2></div>
      <div class="panel-body padded">
        <span class="hint" style="display:block;margin-bottom:10px;">Elige exactamente qué componentes le vas a mostrar al cliente en el link (por defecto vienen todos marcados).</span>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
          ${miembros
            .map(
              (e) => `
            <label style="display:flex;align-items:center;gap:8px;font-weight:400;">
              <input type="checkbox" class="chk-link-combinado-${grupo.id}" value="${e.id}" checked>
              ${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? " · " + escapeHtml(e.marca_modelo) : ""}
            </label>`
            )
            .join("")}
        </div>
        <div class="field" style="margin-bottom:12px;"><label for="nota-link-${grupo.id}">Mensaje para el cliente (opcional)</label>
          <textarea id="nota-link-${grupo.id}" placeholder="Ej: Se completó el ensamblaje y configuración del sistema POS."></textarea>
          <span class="hint">Aparece destacado arriba de la lista de equipos en el link, para que el cliente vea de entrada qué incluye o qué se hizo.</span>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-bottom:12px;">
          <input type="checkbox" id="chk-mostrar-precio-${grupo.id}" checked>
          Mostrar precio, abonos y saldo al cliente
        </label>
        <span class="hint" style="display:block;margin-bottom:10px;">Desmárcalo si es una demostración u otro caso donde todavía no corresponde mostrar el precio real.</span>
        <button type="button" class="btn btn-accent btn-sm" id="btn-generar-link-combinado-${grupo.id}">Generar link</button>
        <div id="link-combinado-resultado-${grupo.id}" style="margin-top:14px;"></div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px;">
      <div class="panel-header"><h2>Componentes</h2></div>
      <div class="panel-body padded" style="display:flex;flex-direction:column;gap:10px;">
        ${miembros
          .map(
            (e) => `
          <details id="equipo-detalle-${e.id}" style="border:1px solid var(--border);border-radius:10px;padding:10px 14px;">
            <summary style="cursor:pointer;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
              <strong>${escapeHtml(e.tipo_equipo)}</strong>
              ${e.marca_modelo ? `<span class="muted">${escapeHtml(e.marca_modelo)}</span>` : ""}
              ${e.numero_serie ? `<span class="muted">N° ${escapeHtml(e.numero_serie)}</span>` : ""}
              <span class="num">${clp(e.precio)}</span>
              ${e.saldo > 0 ? `<span class="danger">Saldo ${clp(e.saldo)}</span>` : ""}
              ${badgeGarantia(e)}
            </summary>
            <div id="equipo-detalle-contenido-${e.id}" style="margin-top:12px;"></div>
          </details>`
          )
          .join("")}
      </div>
    </div>
  `;

  await Promise.all(miembros.map((e) => cargarEquipoInline(e.id, `equipo-detalle-contenido-${e.id}`)));

  wrapper.querySelector(`#btn-renombrar-grupo-${grupo.id}`).addEventListener("click", async () => {
    const nuevoNombre = prompt("Nuevo nombre del grupo:", grupo.nombre);
    if (!nuevoNombre || !nuevoNombre.trim()) return;
    try {
      await apiPut(`/api/grupos/${grupo.id}`, { nombre: nuevoNombre.trim() });
      flash("Grupo renombrado.");
      viewClienteDetalle(clienteId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  wrapper.querySelector(`#btn-eliminar-grupo-${grupo.id}`).addEventListener("click", async () => {
    if (!confirm("¿Desagrupar estos equipos? Cada uno vuelve a verse suelto (no se borra ningún dato).")) return;
    try {
      await apiDelete(`/api/grupos/${grupo.id}`);
      flash("Grupo eliminado.");
      viewClienteDetalle(clienteId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  wrapper.querySelector(`#btn-generar-link-combinado-${grupo.id}`).addEventListener("click", async () => {
    const ids = Array.from(wrapper.querySelectorAll(`.chk-link-combinado-${grupo.id}:checked`)).map((c) => Number(c.value));
    if (ids.length === 0) {
      flash("Elige al menos un equipo para el link.", "error");
      return;
    }
    const mostrarPrecio = wrapper.querySelector(`#chk-mostrar-precio-${grupo.id}`).checked;
    const nota = wrapper.querySelector(`#nota-link-${grupo.id}`).value.trim();
    try {
      const res = await apiPost("/api/equipos/link-combinado", {
        cliente_id: clienteId,
        equipo_ids: ids,
        mostrar_precio: mostrarPrecio,
        nota,
      });
      mostrarLinkCombinado(wrapper, `link-combinado-resultado-${grupo.id}`, res.token, cliente, miembros, ids);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });
}

// Muestra el link combinado recién generado, con copiar y envío directo
// por WhatsApp (mismo criterio que el link de garantía de un equipo suelto).
function mostrarLinkCombinado(wrapper, containerId, token, cliente, miembros, idsIncluidos) {
  const bloque = wrapper.querySelector(`#${containerId}`);
  if (!bloque) return;

  const linkUrl = `${window.location.origin}/grupo?t=${token}`;
  const incluidos = miembros.filter((e) => idsIncluidos.includes(e.id));
  const nombres = incluidos.map((e) => e.tipo_equipo).join(", ");
  const mensaje = `Hola ${cliente.nombre || ""}, soy de ${currentNombreNegocio}.

Te comparto el link con la garantía de tu equipo (${nombres}):
${linkUrl}

Cualquier consulta, escríbeme por acá. Y si quieres conocer nuestros servicios: ${SITIO_WEB_NEGOCIO}`;

  const numeroWhatsapp = telefonoWhatsapp(cliente.telefono);
  const hrefWhatsapp = numeroWhatsapp
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  bloque.innerHTML = `
    <div class="field">
      <label>Link generado — envíaselo al cliente</label>
      <div class="actions-row">
        <input type="text" readonly value="${escapeHtml(linkUrl)}" id="link-combinado-${token}" style="flex:1;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-copiar-link-combinado-${token}">Copiar</button>
        <a class="btn btn-accent btn-sm" href="${hrefWhatsapp}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
      </div>
      ${
        !numeroWhatsapp
          ? `<span class="hint">Este cliente no tiene teléfono registrado, así que WhatsApp te va a pedir elegir el contacto a mano. <a data-goto="#/clientes/${cliente.id}/editar">Agrégalo en su ficha</a> para que la próxima vez se abra el chat directo.</span>`
          : ""
      }
    </div>
  `;

  bloque.querySelector(`#btn-copiar-link-combinado-${token}`).addEventListener("click", async () => {
    const input = bloque.querySelector(`#link-combinado-${token}`);
    try {
      await navigator.clipboard.writeText(input.value);
      flash("Link copiado.");
    } catch {
      input.select();
      flash("Selecciona y copia el link manualmente.", "error");
    }
  });
}

// Renderiza el detalle completo de UN trabajo (datos, equipos/garantía,
// desglose, seguimiento para el cliente y pagos) dentro de la ficha del
// cliente, sin navegar a otra página — es la misma información que antes
// vivía en "Editar trabajo" como pantalla aparte.
async function cargarTrabajoInline(trabajoId, clienteId, containerId = "trabajo-detalle-inline") {
  const wrapper = document.getElementById(containerId);
  if (!wrapper) return;
  wrapper.innerHTML = `<div class="panel" style="margin-top:22px;"><div class="panel-body padded"><div class="empty-state">Cargando trabajo…</div></div></div>`;

  let trabajo, equiposVinculados;
  try {
    const data = await apiGet(`/api/trabajos/${trabajoId}`);
    trabajo = data.trabajo;
    equiposVinculados = data.equiposVinculados || [];
  } catch (err) {
    if (await handleAuthError(err)) return;
    wrapper.innerHTML = `<div class="panel" style="margin-top:22px;"><div class="panel-body padded">No se pudo cargar el trabajo.</div></div>`;
    return;
  }

  const tipoOptions = TIPOS_TRABAJO.map(
    (t) => `<option value="${t}" ${trabajo.tipo === t ? "selected" : ""}>${t}</option>`
  ).join("");
  const estadoOptions = ESTADOS_TRABAJO.map(
    (e) => `<option value="${e}" ${trabajo.estado === e ? "selected" : ""}>${e}</option>`
  ).join("");

  // Cada equipo vinculado ya tiene su propio bloque desplegado más arriba
  // (en "Equipos y garantías"), así que aquí solo se baja con scroll hasta
  // él en vez de volver a cargarlo aparte.
  const equiposVinculadosRows = equiposVinculados
    .map(
      (e) => `
      <tr data-scroll-target="${e.grupo_id ? `grupo-block-${e.grupo_id}` : `equipo-block-${e.id}`}" style="cursor:pointer;">
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? `<br><span class="muted">${escapeHtml(e.marca_modelo)}</span>` : ""}</td>
        <td>${escapeHtml(e.numero_serie || "—")}</td>
        <td class="num">${clp(e.precio)}</td>
        <td class="num">${e.saldo > 0 ? `<span class="danger">${clp(e.saldo)}</span>` : clp(0)}</td>
        <td>${e.fecha_venta}</td>
        <td>${badgeGarantia(e)}</td>
      </tr>`
    )
    .join("");

  // Trazabilidad de cuándo se activó "mostrar detalle y pago" — se conserva
  // la fecha aunque después se vuelva a ocultar.
  const detalleTag = trabajo.mostrar_detalle_cliente
    ? `<span class="badge accent">Visible para el cliente desde ${fechaCortaHora(trabajo.detalle_visible_desde)}</span>`
    : trabajo.detalle_visible_desde
    ? `<span class="badge neutral">Oculto ahora · se mostró desde ${fechaCortaHora(trabajo.detalle_visible_desde)}</span>`
    : `<span class="badge neutral">Oculto para el cliente</span>`;

  wrapper.innerHTML = `
    <div class="panel" style="margin-top:22px;border-color:var(--accent-dark);">
      <div class="panel-header"><h2>Trabajo: ${escapeHtml(trabajo.tipo)}</h2></div>
      <div class="panel-body padded">
        <form id="trabajo-form-${trabajo.id}">
          <div class="form-grid">
            <div class="field"><label for="tipo">Tipo</label><select id="tipo">${tipoOptions}</select></div>
            <div class="field"><label for="estado">Estado</label><select id="estado">${estadoOptions}</select></div>
          </div>
          <div class="field"><label for="descripcion">Descripción *</label>
            <textarea id="descripcion" required>${escapeHtml(trabajo.descripcion || "")}</textarea></div>
          <div class="field"><label for="monto">Monto (CLP)</label>
            <input type="number" id="monto" min="0" step="1" value="${trabajo.monto}"></div>
          <div class="field"><label>Detalle y pago para el cliente</label>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              ${detalleTag}
              <button type="button" class="btn ${trabajo.mostrar_detalle_cliente ? "btn-danger" : "btn-accent"} btn-sm" id="btn-toggle-detalle-cliente" data-visible-actual="${trabajo.mostrar_detalle_cliente ? "1" : "0"}">
                ${trabajo.mostrar_detalle_cliente ? "Ocultar del cliente" : "Mostrar al cliente"}
              </button>
            </div>
            <span class="hint">Mientras esté oculto, el cliente NO ve el desglose (repuestos/servicios), la garantía de los equipos de este trabajo ni el monto/saldo en su página de seguimiento — solo el avance. Actívalo cuando el monto ya esté definitivo.</span>
          </div>
          <div class="field"><label for="notas">Notas (de finalización u otras, para tu uso interno)</label><textarea id="notas">${escapeHtml(trabajo.notas || "")}</textarea></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-accent">Guardar</button>
            <button type="button" class="btn btn-danger-outline" id="btn-eliminar-trabajo" style="margin-left:auto;">Eliminar trabajo</button>
          </div>
        </form>
      </div>
    </div>

    <div class="panel" style="margin-top:14px;">
      <div class="panel-header"><h2>Equipos y garantía de este trabajo</h2>
        <button class="btn btn-accent btn-sm" data-goto="#/equipos/nuevo?cliente_id=${clienteId}&trabajo_id=${trabajo.id}">+ Agregar equipo/producto en garantía</button></div>
      <div class="panel-body">
        ${
          equiposVinculadosRows
            ? `<table><thead><tr><th>Equipo</th><th>N° serie</th><th class="num">Precio</th><th class="num">Saldo</th><th>Venta</th><th>Garantía</th></tr></thead><tbody>${equiposVinculadosRows}</tbody></table>`
            : `<div class="panel-empty">Ningún equipo/producto vinculado todavía. Usa el botón de arriba si en este trabajo cambiaste una pieza (disco, fuente, etc.) para que el cliente tenga su garantía visible.</div>`
        }
      </div>
    </div>
    <div id="items-trabajo-${trabajo.id}" style="margin-top:14px;"></div>
    <div id="seguimiento-${trabajo.id}" style="margin-top:14px;"></div>
    <div id="abonos-trabajo-${trabajo.id}" style="margin-top:14px;"></div>
  `;

  // Como ahora TODOS los trabajos del cliente están desplegados a la vez en
  // la misma hoja, los campos del formulario (tipo, estado, etc.) se buscan
  // dentro de este wrapper específico (no con document.getElementById a
  // secas), para no chocar con los mismos ids repetidos en los demás
  // trabajos/equipos ya abiertos en la página.
  renderItemsTrabajo(trabajo, `items-trabajo-${trabajo.id}`);
  renderSeguimiento(trabajo, `seguimiento-${trabajo.id}`);
  renderAbonosPanel(`abonos-trabajo-${trabajo.id}`, {
    categoria: "trabajo",
    referenciaId: trabajo.id,
    montoTotal: trabajo.monto,
    clienteNombre: trabajo.cliente_nombre,
    clienteTelefono: trabajo.cliente_telefono,
    onCambio: async () => {
      try {
        const data = await apiGet(`/api/trabajos/${trabajoId}`);
        trabajo = data.trabajo;
        renderSeguimiento(trabajo, `seguimiento-${trabajo.id}`);
      } catch {
        // igual que en equipos: si falla, el mensaje de WhatsApp de
        // seguimiento queda con el saldo anterior hasta recargar.
      }
    },
  });

  wrapper.querySelector(`#trabajo-form-${trabajo.id}`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      tipo: wrapper.querySelector("#tipo").value,
      estado: wrapper.querySelector("#estado").value,
      descripcion: wrapper.querySelector("#descripcion").value,
      monto: wrapper.querySelector("#monto").value,
      notas: wrapper.querySelector("#notas").value,
      // El "mostrar/ocultar al cliente" se guarda con su propio botón (más
      // abajo), no desde este formulario — se manda tal cual está para no
      // pisarlo al guardar el resto de los datos.
      mostrar_detalle_cliente: !!trabajo.mostrar_detalle_cliente,
    };
    try {
      await apiPut(`/api/trabajos/${trabajo.id}`, payload);
      flash("Trabajo actualizado.");
      // Se recarga toda la ficha del cliente (para que la fila de la tabla de
      // arriba también quede al día con el nuevo monto/estado) dejando este
      // mismo trabajo a la vista.
      viewClienteDetalle(clienteId, { openTrabajoId: trabajoId });
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  wrapper.querySelector("#btn-toggle-detalle-cliente").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const estabaVisible = btn.dataset.visibleActual === "1";
    try {
      await apiPut(`/api/trabajos/${trabajo.id}`, { mostrar_detalle_cliente: !estabaVisible });
      flash(
        estabaVisible
          ? "Detalle y pago ocultado del cliente."
          : "Detalle y pago marcado como visible para el cliente."
      );
      cargarTrabajoInline(trabajoId, clienteId, containerId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  wrapper.querySelector("#btn-eliminar-trabajo").addEventListener("click", async () => {
    if (!confirm("¿Eliminar este trabajo?")) return;
    try {
      await apiDelete(`/api/trabajos/${trabajo.id}`);
      flash("Trabajo eliminado.");
      viewClienteDetalle(clienteId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });
}

// Renderiza el detalle completo de UN equipo/garantía (datos, link de
// garantía para el cliente, fotos y pagos) dentro de la ficha del cliente,
// sin navegar a otra página. Se puede abrir tanto desde la tabla de
// "Equipos y garantías" como desde la de un trabajo ya abierto.
async function cargarEquipoInline(equipoId, containerId = "equipo-detalle-inline") {
  const wrapper = document.getElementById(containerId);
  if (!wrapper) return;
  wrapper.innerHTML = `<div class="panel" style="margin-top:22px;"><div class="panel-body padded"><div class="empty-state">Cargando equipo…</div></div></div>`;

  let equipo;
  try {
    const data = await apiGet(`/api/equipos/${equipoId}`);
    equipo = data.equipo;
  } catch (err) {
    if (await handleAuthError(err)) return;
    wrapper.innerHTML = `<div class="panel" style="margin-top:22px;"><div class="panel-body padded">No se pudo cargar el equipo.</div></div>`;
    return;
  }
  const clienteId = equipo.cliente_id;

  wrapper.innerHTML = `
    <div class="panel" style="margin-top:22px;border-color:var(--accent-dark);">
      <div class="panel-header"><h2>Equipo: ${escapeHtml(equipo.tipo_equipo)}</h2></div>
      <div class="panel-body padded">
        <div class="field"><label>Estado de la garantía</label><div>${badgeGarantia(equipo)}</div></div>
        <form id="equipo-form-${equipo.id}">
          <div class="form-grid">
            <div class="field"><label for="tipo_equipo">Tipo de equipo o producto *</label>
              <input type="text" id="tipo_equipo" required value="${escapeHtml(equipo.tipo_equipo || "")}"></div>
            <div class="field"><label for="marca_modelo">Marca / modelo</label>
              <input type="text" id="marca_modelo" value="${escapeHtml(equipo.marca_modelo || "")}"></div>
          </div>
          <div class="form-grid">
            <div class="field"><label for="numero_serie">N° de serie</label>
              <input type="text" id="numero_serie" value="${escapeHtml(equipo.numero_serie || "")}"></div>
            <div class="field"><label for="precio">Precio (CLP)</label>
              <input type="number" id="precio" min="0" step="1" value="${equipo.precio}"></div>
          </div>
          <div class="form-grid">
            <div class="field"><label for="fecha_venta">Fecha de venta</label>
              <input type="date" id="fecha_venta" value="${equipo.fecha_venta}"></div>
            ${campoMesesGarantia(equipo.meses_garantia)}
          </div>
          <div class="field"><label for="notas">Notas</label><textarea id="notas">${escapeHtml(equipo.notas || "")}</textarea></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-accent">Guardar</button>
            ${
              equipo.grupo_id
                ? `<button type="button" class="btn btn-outline" id="btn-quitar-del-grupo">Quitar del grupo</button>`
                : ""
            }
            <button type="button" class="btn btn-danger-outline" id="btn-eliminar-equipo" style="margin-left:auto;">Eliminar equipo</button>
          </div>
        </form>
      </div>
    </div>
    <div id="garantia-${equipo.id}" style="margin-top:14px;"></div>
    <div id="fotos-equipo-${equipo.id}" style="margin-top:14px;"></div>
    <div id="abonos-equipo-${equipo.id}" style="margin-top:14px;"></div>
  `;

  // Igual que en cargarTrabajoInline: como puede haber varios equipos
  // desplegados a la vez en la misma hoja, los campos se buscan dentro de
  // este wrapper específico, no con document.getElementById a secas.
  wireSinGarantiaCheckbox(wrapper);
  renderGarantiaPublica(equipo, `garantia-${equipo.id}`);
  renderFotosEquipoPanel(equipo, `fotos-equipo-${equipo.id}`);
  renderAbonosPanel(`abonos-equipo-${equipo.id}`, {
    categoria: "equipo",
    referenciaId: equipo.id,
    montoTotal: equipo.precio,
    clienteNombre: equipo.cliente_nombre,
    clienteTelefono: equipo.cliente_telefono,
    onCambio: async () => {
      try {
        const data = await apiGet(`/api/equipos/${equipo.id}`);
        equipo = data.equipo;
        renderGarantiaPublica(equipo, `garantia-${equipo.id}`);
      } catch {
        // si falla, el botón de WhatsApp simplemente queda con el saldo
        // anterior hasta la próxima recarga — no bloquea nada más.
      }
    },
  });

  wrapper.querySelector(`#equipo-form-${equipo.id}`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      tipo_equipo: wrapper.querySelector("#tipo_equipo").value,
      marca_modelo: wrapper.querySelector("#marca_modelo").value,
      numero_serie: wrapper.querySelector("#numero_serie").value,
      precio: wrapper.querySelector("#precio").value,
      fecha_venta: wrapper.querySelector("#fecha_venta").value,
      meses_garantia: wrapper.querySelector("#meses_garantia").value,
      notas: wrapper.querySelector("#notas").value,
    };
    try {
      await apiPut(`/api/equipos/${equipo.id}`, payload);
      flash("Equipo actualizado.");
      // Igual que con un trabajo: se recarga toda la hoja del cliente (para
      // que la tabla de arriba quede al día) dejando este mismo equipo y,
      // si estaba vinculado a un trabajo, ese trabajo también a la vista.
      viewClienteDetalle(clienteId, { openEquipoId: equipo.id, openTrabajoId: equipo.trabajo_id || undefined });
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  const btnQuitarGrupo = wrapper.querySelector("#btn-quitar-del-grupo");
  if (btnQuitarGrupo) {
    btnQuitarGrupo.addEventListener("click", async () => {
      if (!confirm("¿Quitar este equipo del grupo? Vuelve a verse suelto (no se borra ningún dato).")) return;
      try {
        await apiPut(`/api/equipos/${equipo.id}/grupo`, { grupo_id: null });
        flash("Equipo sacado del grupo.");
        viewClienteDetalle(clienteId, { openEquipoId: equipo.id });
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }

  wrapper.querySelector("#btn-eliminar-equipo").addEventListener("click", async () => {
    if (!confirm("¿Eliminar este equipo?")) return;
    try {
      await apiDelete(`/api/equipos/${equipo.id}`);
      flash("Equipo eliminado.");
      viewClienteDetalle(clienteId, { openTrabajoId: equipo.trabajo_id || undefined });
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });
}

/* ---------------------------------------------------------------- */
/* Equipos                                                             */
/* ---------------------------------------------------------------- */
async function viewEquiposList() {
  setPage({ title: "Equipos y garantías" });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const { equipos } = await apiGet("/api/equipos");

  const rows = equipos
    .map(
      (e) => `
      <tr data-goto="#/equipos/${e.id}/editar" style="cursor:pointer;">
        <td>${escapeHtml(e.cliente_nombre)}</td>
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? `<br><span class="muted">${escapeHtml(e.marca_modelo)}</span>` : ""}</td>
        <td>${escapeHtml(e.numero_serie || "—")}</td>
        <td class="num">${clp(e.precio)}</td>
        <td class="num">${e.saldo > 0 ? `<span class="danger">${clp(e.saldo)}</span>` : clp(0)}</td>
        <td>${e.fecha_venta}</td>
        <td>${e.vence}</td>
        <td>${badgeGarantia(e)}</td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="panel"><div class="panel-body">
      ${
        rows
          ? `<table><thead><tr><th>Cliente</th><th>Equipo</th><th>N° serie</th><th class="num">Precio</th><th class="num">Saldo</th><th>Venta</th><th>Vence garantía</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty-state"><div class="big-ic">💻</div>
             <p>No hay equipos registrados todavía. Registra las ventas desde la ficha de cada cliente.</p>
             <button class="btn btn-accent" data-goto="#/clientes">Ir a clientes</button></div>`
      }
    </div></div>
  `);
  attachNav();
}

async function viewEquipoForm(id, presetClienteId, presetTrabajoId) {
  let equipo = null;
  if (id) {
    const data = await apiGet(`/api/equipos/${id}`);
    equipo = data.equipo;
  }
  setPage({ title: equipo ? "Editar equipo" : "Registrar equipo o producto en garantía" });

  const hoy = new Date().toISOString().slice(0, 10);
  const clienteBlock = equipo
    ? `<div class="field"><label>Cliente</label><input type="text" value="${escapeHtml(equipo.cliente_nombre)}" disabled>
         <span class="hint">Aquí no se puede cambiar (este equipo queda siempre a nombre del mismo cliente). ¿Necesitas corregir el teléfono, correo u otro dato del cliente? <a data-goto="#/clientes/${equipo.cliente_id}/editar">Edítalos aquí</a>.</span></div>`
    : `<div class="field"><label for="cliente_id">Cliente *</label>
         <select id="cliente_id" required><option value="">Selecciona un cliente...</option>${await clienteOptions(
           presetClienteId
         )}</select></div>`;

  setContent(`
    <div class="form-card">
      ${equipo ? `<div class="field"><label>Estado de la garantía</label><div>${badgeGarantia(equipo)}</div></div>` : ""}
      ${!equipo && presetTrabajoId ? `<p class="hint" style="margin:-6px 0 14px;">Este equipo quedará vinculado al trabajo, y su garantía va a aparecer también en la página de seguimiento que ve el cliente.</p>` : ""}
      <form id="equipo-form">
        ${clienteBlock}
        ${!equipo ? `<div class="field" id="catalogo-producto-field">
          <label for="catalogo_producto_id">Producto del catálogo (opcional)</label>
          <select id="catalogo_producto_id"><option value="">-- Elegir para autocompletar y descontar stock --</option></select>
          <span class="hint">Si vendiste algo que tenías en el catálogo, elígelo aquí: se completan los datos solos y se descuenta el stock automáticamente.</span>
        </div>
        <div class="form-grid" id="catalogo-cantidad-row" style="display:none;">
          <div class="field"><label for="catalogo_cantidad">Cantidad vendida</label>
            <input type="number" id="catalogo_cantidad" min="1" step="1" value="1"></div>
        </div>` : ""}
        <div class="form-grid">
          <div class="field"><label for="tipo_equipo">Tipo de equipo o producto *</label>
            <input type="text" id="tipo_equipo" required placeholder="Notebook, PC, impresora, disco duro, fuente de poder..." value="${escapeHtml(equipo?.tipo_equipo || "")}"></div>
          <div class="field"><label for="marca_modelo">Marca / modelo</label>
            <input type="text" id="marca_modelo" value="${escapeHtml(equipo?.marca_modelo || "")}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="numero_serie">N° de serie</label>
            <input type="text" id="numero_serie" value="${escapeHtml(equipo?.numero_serie || "")}"></div>
          <div class="field"><label for="precio">Precio (CLP)</label>
            <input type="number" id="precio" min="0" step="1" value="${equipo ? equipo.precio : 0}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="fecha_venta">Fecha de venta</label>
            <input type="date" id="fecha_venta" value="${equipo ? equipo.fecha_venta : hoy}"></div>
          ${campoMesesGarantia(equipo ? equipo.meses_garantia : 3)}
        </div>
        <div class="field"><label for="notas">Notas</label><textarea id="notas">${escapeHtml(equipo?.notas || "")}</textarea></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-accent">Guardar</button>
          <button type="button" class="btn btn-outline" data-goto="${
            equipo
              ? `#/clientes/${equipo.cliente_id}`
              : presetTrabajoId
              ? `#/clientes/${presetClienteId}?trabajo=${presetTrabajoId}`
              : "#/equipos"
          }">Cancelar</button>
        </div>
      </form>
    </div>
    ${equipo ? `<div id="garantia-container" style="margin-top:22px;"></div>` : ""}
    ${equipo ? `<div id="fotos-equipo-container" style="margin-top:22px;"></div>` : ""}
    ${equipo ? `<div id="abonos-container" style="margin-top:22px;"></div>` : ""}
  `);
  attachNav();
  wireSinGarantiaCheckbox(document);
  if (!equipo) wireCatalogoProductoPicker();
  if (equipo) renderGarantiaPublica(equipo);
  if (equipo) renderFotosEquipoPanel(equipo);
  if (equipo) {
    renderAbonosPanel("abonos-container", {
      categoria: "equipo",
      referenciaId: equipo.id,
      montoTotal: equipo.precio,
      clienteNombre: equipo.cliente_nombre,
      clienteTelefono: equipo.cliente_telefono,
      onCambio: async () => {
        try {
          const data = await apiGet(`/api/equipos/${equipo.id}`);
          equipo = data.equipo;
          renderGarantiaPublica(equipo);
        } catch {
          // si falla, el botón de WhatsApp queda con el saldo anterior
          // hasta la próxima recarga — no bloquea nada más.
        }
      },
    });
  }

  document.getElementById("equipo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      tipo_equipo: document.getElementById("tipo_equipo").value,
      marca_modelo: document.getElementById("marca_modelo").value,
      numero_serie: document.getElementById("numero_serie").value,
      precio: document.getElementById("precio").value,
      fecha_venta: document.getElementById("fecha_venta").value,
      meses_garantia: document.getElementById("meses_garantia").value,
      notas: document.getElementById("notas").value,
    };
    try {
      if (equipo) {
        const res = await apiPut(`/api/equipos/${equipo.id}`, payload);
        flash("Equipo actualizado.");
        window.location.hash = `#/clientes/${res.cliente_id}`;
      } else {
        payload.cliente_id = document.getElementById("cliente_id").value;
        if (presetTrabajoId) payload.trabajo_id = presetTrabajoId;
        const catalogoProductoId = document.getElementById("catalogo_producto_id")?.value;
        if (catalogoProductoId) {
          payload.catalogo_producto_id = catalogoProductoId;
          payload.catalogo_cantidad = document.getElementById("catalogo_cantidad").value || 1;
        }
        const res = await apiPost("/api/equipos", payload);
        flash("Equipo/venta registrado.");
        window.location.hash = presetTrabajoId
          ? `#/clientes/${res.cliente_id}?trabajo=${presetTrabajoId}`
          : `#/clientes/${res.cliente_id}`;
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });
}

// Arma un mensaje de WhatsApp cordial y con la información real del
// equipo (no solo el link a secas), para que el cliente sepa de entrada
// qué es y qué va a encontrar al abrirlo.
function mensajeGarantiaWhatsapp(equipo, linkUrl) {
  const nombreEquipo = equipo.marca_modelo ? `${equipo.tipo_equipo} (${equipo.marca_modelo})` : equipo.tipo_equipo;

  let lineaPago = "";
  if (equipo.precio > 0) {
    if (equipo.pagado_completo) lineaPago = `, el pago ya quedó completo ${EMOJI_CHECK}`;
    else if (equipo.abonado > 0) lineaPago = `, llevas abonado ${clp(equipo.abonado)} de ${clp(equipo.precio)} (saldo: ${clp(equipo.saldo)})`;
    else lineaPago = `, y el saldo pendiente de ${clp(equipo.saldo)}`;
  }

  const lineaFotos = equipo.fotos && equipo.fotos.length > 0 ? ", además de fotos del estado del equipo" : "";

  return `Hola ${equipo.cliente_nombre}, soy de ${currentNombreNegocio}.

Te comparto el link de garantía de tu ${nombreEquipo}:
${linkUrl}

Ahí puedes revisar el estado de tu garantía (vigente hasta ${fechaLarga(equipo.vence)})${lineaPago}${lineaFotos}.

Cualquier consulta, escríbeme por acá. Y si quieres conocer nuestros servicios: ${SITIO_WEB_NEGOCIO}`;
}

function renderGarantiaPublica(equipo, containerId = "garantia-container") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const linkUrl = equipo.public_token
    ? `${window.location.origin}/garantia?t=${equipo.public_token}`
    : null;
  const mensajeWhatsapp = linkUrl ? mensajeGarantiaWhatsapp(equipo, linkUrl) : "";
  const numeroWhatsapp = telefonoWhatsapp(equipo.cliente_telefono);
  const hrefWhatsapp = numeroWhatsapp
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensajeWhatsapp)}`
    : `https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`;

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>Garantía para el cliente</h2></div>
      <div class="panel-body padded">
        ${
          equipo.trabajo_id
            ? `<div class="field"><span class="hint">Como este equipo está vinculado a un trabajo, su garantía se incluye automáticamente en el link de seguimiento de ese trabajo en cuanto actives ahí "Detalle y pago para el cliente" — no hace falta marcarla aparte.</span></div>`
            : ""
        }
        <div class="field">
          <label>Link para que el cliente vea su garantía</label>
          ${
            linkUrl
              ? `<div class="actions-row">
                   <input type="text" readonly value="${escapeHtml(linkUrl)}" id="link-garantia" style="flex:1;">
                   <button type="button" class="btn btn-outline btn-sm" id="btn-copiar-link-garantia">Copiar</button>
                   <a class="btn btn-accent btn-sm" id="btn-whatsapp-link-garantia" href="${hrefWhatsapp}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
                 </div>`
              : `<button type="button" class="btn btn-accent btn-sm" id="btn-generar-link-garantia">Generar link</button>`
          }
          <span class="hint">Este link no requiere que el cliente inicie sesión — siempre muestra el equipo que compró y el estado actual de su garantía (vigente, por vencer o vencida).</span>
          ${
            linkUrl && !numeroWhatsapp
              ? `<span class="hint">Este cliente no tiene teléfono registrado, así que WhatsApp te va a pedir elegir el contacto a mano. <a data-goto="#/clientes/${equipo.cliente_id}/editar">Agrégalo en su ficha</a> para que la próxima vez se abra el chat directo.</span>`
              : ""
          }
        </div>
      </div>
    </div>
  `;

  const btnGenerar = container.querySelector("#btn-generar-link-garantia");
  if (btnGenerar) {
    btnGenerar.addEventListener("click", async () => {
      try {
        const res = await apiPost(`/api/equipos/${equipo.id}/link`, {});
        equipo.public_token = res.token;
        flash("Link generado.");
        renderGarantiaPublica(equipo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }

  const btnCopiar = container.querySelector("#btn-copiar-link-garantia");
  if (btnCopiar) {
    btnCopiar.addEventListener("click", async () => {
      const input = container.querySelector("#link-garantia");
      try {
        await navigator.clipboard.writeText(input.value);
        flash("Link copiado.");
      } catch {
        input.select();
        flash("Selecciona y copia el link manualmente.", "error");
      }
    });
  }
}

/* ---------------------------------------------------------------- */
/* Fotos del estado del equipo — el cliente las ve en su link público  */
/* de garantía, junto con el estado de pago.                           */
/* ---------------------------------------------------------------- */

async function renderFotosEquipoPanel(equipo, containerId = "fotos-equipo-container") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const data = await apiGet(`/api/equipos/${equipo.id}`);
  const fotos = data.equipo.fotos || [];

  // Las fotos se ven siempre (en el link de garantía del equipo y, si
  // corresponde, en el seguimiento del trabajo) — no tienen un interruptor
  // aparte, para no repetir la misma decisión que ya tomas al activar
  // "Detalle y pago para el cliente" en el trabajo.
  const fotosHtml = fotos.length
    ? `<div class="fotos-equipo-grid">
        ${fotos
          .map(
            (f) => `
          <figure data-foto-item="${f.id}">
            <img src="/api/public/fotos/${escapeHtml(f.r2_key)}" alt="${escapeHtml(f.descripcion || "")}">
            ${f.descripcion ? `<figcaption>${escapeHtml(f.descripcion)}</figcaption>` : ""}
            <button type="button" class="btn btn-outline btn-sm" data-del-foto-equipo="${f.id}">Eliminar</button>
          </figure>`
          )
          .join("")}
      </div>`
    : `<div class="empty-state">Aún no hay fotos del estado de este equipo.</div>`;

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>Fotos del estado del equipo</h2></div>
      <div class="panel-body padded">
        <div class="field"><span class="hint">El cliente ve estas fotos en su link público de garantía y, si el equipo está vinculado a un trabajo, también en el seguimiento de ese trabajo (cuando actives ahí "Detalle y pago para el cliente"). Úsalas para dejar registro de cómo llegó el equipo o cómo quedó tras una reparación.</span></div>
        <div style="margin-top:12px;">${fotosHtml}</div>
        <form id="foto-equipo-form" style="margin-top:16px;">
          <div class="field"><label for="foto-equipo-archivo">Agregar foto</label>
            <input type="file" id="foto-equipo-archivo" accept="image/jpeg,image/png,image/webp,image/gif"></div>
          <div class="field"><label for="foto-equipo-descripcion">Descripción (opcional)</label>
            <input type="text" id="foto-equipo-descripcion" placeholder="Ej: Cómo llegó el equipo"></div>
          <button type="submit" class="btn btn-accent btn-sm">Subir foto</button>
        </form>
      </div>
    </div>
  `;

  container.querySelector("#foto-equipo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#foto-equipo-archivo");
    const descripcion = container.querySelector("#foto-equipo-descripcion").value.trim();
    if (!input.files || !input.files[0]) {
      flash("Selecciona una imagen primero.", "error");
      return;
    }
    const formData = new FormData();
    formData.append("foto", input.files[0]);
    formData.append("descripcion", descripcion);
    try {
      await apiPostForm(`/api/equipos/${equipo.id}/fotos`, formData);
      flash("Foto subida.");
      renderFotosEquipoPanel(equipo, containerId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  container.querySelectorAll("[data-del-foto-equipo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const fotoId = btn.dataset.delFotoEquipo;
      if (!confirm("¿Eliminar esta foto?")) return;
      try {
        await apiDelete(`/api/equipos/${equipo.id}/fotos/${fotoId}`);
        flash("Foto eliminada.");
        renderFotosEquipoPanel(equipo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });
}

/* ---------------------------------------------------------------- */
/* Abonos (pagos parciales) — reutilizable en trabajos, equipos y      */
/* mensualidades.                                                      */
/* ---------------------------------------------------------------- */

function badgeEstadoCuenta(item) {
  if (item.pagado_completo) return '<span class="badge ok">Pagado</span>';
  if (item.abonado > 0) return '<span class="badge warn">Abono parcial</span>';
  return '<span class="badge danger">Sin abonos</span>';
}

// Dibuja (y vuelve a dibujar tras cada cambio) el panel de "Pagos y
// abonos" de un trabajo, equipo o mensualidad: total, abonado, saldo,
// historial, y el formulario para registrar un abono nuevo que genera de
// inmediato su link de comprobante para enviar por WhatsApp.
async function renderAbonosPanel(containerId, cfg) {
  // cfg: { categoria, referenciaId, montoTotal, periodo, clienteNombre, clienteTelefono, conceptoLabel }
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="panel"><div class="panel-body"><div class="empty-state">Cargando…</div></div></div>`;

  let abonos = [];
  try {
    abonos = (
      await apiGet(`/api/abonos?categoria=${cfg.categoria}&referencia_id=${cfg.referenciaId}`)
    ).abonos;
  } catch (err) {
    if (await handleAuthError(err)) return;
    container.innerHTML = `<div class="panel"><div class="panel-body"><div class="empty-state">No se pudo cargar el historial de abonos.</div></div></div>`;
    return;
  }

  if (cfg.periodo) abonos = abonos.filter((a) => a.periodo === cfg.periodo);

  const abonado = abonos.reduce((sum, a) => sum + a.monto, 0);
  const saldo = Math.max((cfg.montoTotal || 0) - abonado, 0);
  const pagadoCompleto = cfg.montoTotal > 0 && saldo <= 0;

  const filas = abonos
    .map(
      (a) => `
      <tr>
        <td>${a.fecha_pago}</td>
        <td class="num">${clp(a.monto)}</td>
        <td>${escapeHtml(a.nota || "—")}</td>
        <td>
          ${
            a.public_token
              ? `<a class="btn btn-outline btn-sm" href="${window.location.origin}/comprobante?t=${a.public_token}" target="_blank" rel="noopener">Ver comprobante</a>`
              : `<span class="hint">Sin comprobante (migrado)</span>`
          }
          <button type="button" class="btn btn-danger-outline btn-sm" data-borrar-abono="${a.id}">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>Pagos y abonos</h2>${badgeEstadoCuenta({ pagado_completo: pagadoCompleto, abonado })}</div>
      <div class="panel-body padded">
        <div class="form-grid" style="margin-bottom:14px;">
          <div><span class="text-muted">Total${cfg.periodo ? " (este mes)" : ""}</span><br><strong>${clp(cfg.montoTotal)}</strong></div>
          <div><span class="text-muted">Abonado</span><br><strong>${clp(abonado)}</strong></div>
          <div><span class="text-muted">Saldo pendiente</span><br><strong class="${saldo > 0 ? "danger" : "ok"}">${clp(saldo)}</strong></div>
        </div>

        ${
          filas
            ? `<table><thead><tr><th>Fecha</th><th class="num">Monto</th><th>Nota</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
            : `<div class="panel-empty">Todavía no hay abonos registrados${cfg.periodo ? " este mes" : ""}.</div>`
        }

        ${
          saldo > 0
            ? `
          <form id="abono-form" style="margin-top:16px;">
            <div class="form-grid">
              <div class="field"><label for="abono-monto">Monto del abono (CLP)</label>
                <input type="number" id="abono-monto" min="1" step="1" value="${saldo}" required></div>
              <div class="field"><label for="abono-nota">Nota (opcional)</label>
                <input type="text" id="abono-nota" placeholder="Ej: primer pie, transferencia..."></div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-accent btn-sm">Registrar abono</button>
            </div>
          </form>`
            : `<div class="hint" style="display:block;margin-top:12px;">Esta cuenta ya está pagada por completo${cfg.periodo ? " para este mes" : ""}.</div>`
        }

        <div id="abono-link-resultado" style="margin-top:14px;"></div>
      </div>
    </div>
  `;

  const form = container.querySelector("#abono-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const monto = container.querySelector("#abono-monto").value;
      const nota = container.querySelector("#abono-nota").value;
      try {
        const res = await apiPost("/api/abonos", {
          categoria: cfg.categoria,
          referencia_id: cfg.referenciaId,
          monto,
          nota,
          periodo: cfg.periodo || undefined,
        });
        flash("Abono registrado.");
        mostrarLinkAbono(container, res, cfg, Number(monto));
        renderAbonosPanel(containerId, cfg);
        // El link/mensaje de WhatsApp de garantía o seguimiento se arma con
        // el saldo que tenía el equipo/trabajo al momento de cargarse la
        // página, así que sin este aviso quedaría con el saldo viejo (ej:
        // diciendo "saldo pendiente" después de marcarlo pagado). cfg.onCambio
        // lo vuelve a cargar con los datos frescos.
        if (cfg.onCambio) cfg.onCambio();
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }

  container.querySelectorAll("[data-borrar-abono]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este abono? Solo hazlo si se ingresó por error.")) return;
      try {
        await apiDelete(`/api/abonos/${btn.dataset.borrarAbono}`);
        flash("Abono eliminado.");
        renderAbonosPanel(containerId, cfg);
        if (cfg.onCambio) cfg.onCambio();
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });
}

// Muestra, después de registrar un abono, el link del comprobante listo
// para copiar y un botón que abre WhatsApp con un mensaje amistoso ya
// redactado (agradeciendo el pago y avisando el saldo restante si queda).
function mostrarLinkAbono(container, res, cfg, montoAbonado) {
  const bloque = container.querySelector("#abono-link-resultado");
  if (!bloque) return;

  const linkUrl = `${window.location.origin}/comprobante?t=${res.token}`;
  const nombre = res.cliente_nombre || cfg.clienteNombre || "";
  const saludo = nombre ? `Hola ${nombre}` : "Hola";
  const mensaje =
    res.saldo > 0
      ? `${saludo}, muchas gracias por tu abono de ${clp(montoAbonado)}. Aquí tienes tu comprobante: ${linkUrl}\nTe queda un saldo pendiente de ${clp(res.saldo)}. ¡Cualquier duda me avisas! Y si quieres conocer nuestros servicios: ${SITIO_WEB_NEGOCIO}`
      : `${saludo}, muchas gracias por tu pago. Quedaste al día con tu cuenta ${EMOJI_CHECK} Aquí tienes tu comprobante: ${linkUrl}\n¿Sabías que también puedes ver nuestros servicios acá? ${SITIO_WEB_NEGOCIO}`;

  const numeroWhatsapp = telefonoWhatsapp(res.cliente_telefono || cfg.clienteTelefono);
  const hrefWhatsapp = numeroWhatsapp
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  bloque.innerHTML = `
    <div class="field">
      <label>Comprobante generado — envíaselo al cliente</label>
      <div class="actions-row">
        <input type="text" readonly value="${escapeHtml(linkUrl)}" id="link-abono" style="flex:1;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-copiar-link-abono">Copiar</button>
        <a class="btn btn-accent btn-sm" href="${hrefWhatsapp}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
      </div>
      ${
        !numeroWhatsapp
          ? `<span class="hint">Este cliente no tiene teléfono registrado, así que WhatsApp te va a pedir elegir el contacto a mano.</span>`
          : ""
      }
    </div>
  `;

  const btnCopiar = bloque.querySelector("#btn-copiar-link-abono");
  btnCopiar.addEventListener("click", async () => {
    const input = bloque.querySelector("#link-abono");
    try {
      await navigator.clipboard.writeText(input.value);
      flash("Link copiado.");
    } catch {
      input.select();
      flash("Selecciona y copia el link manualmente.", "error");
    }
  });
}


/* ---------------------------------------------------------------- */
/* Trabajos                                                             */
/* ---------------------------------------------------------------- */
async function viewTrabajosList(estado) {
  setPage({ title: "Trabajos y soporte" });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const { trabajos } = await apiGet(`/api/trabajos${estado ? `?estado=${encodeURIComponent(estado)}` : ""}`);

  const filterBtns = [
    `<button class="btn btn-sm ${!estado ? "btn-primary" : "btn-outline"}" data-goto="#/trabajos">Todos</button>`,
    `<button class="btn btn-sm ${estado === "abiertos" ? "btn-primary" : "btn-outline"}" data-goto="#/trabajos?estado=abiertos">Abiertos</button>`,
    ...ESTADOS_TRABAJO.map(
      (e) =>
        `<button class="btn btn-sm ${estado === e ? "btn-primary" : "btn-outline"}" data-goto="#/trabajos?estado=${encodeURIComponent(e)}">${e}</button>`
    ),
  ].join("");

  const rows = trabajos
    .map(
      (t) => `
      <tr data-goto="#/clientes/${t.cliente_id}?trabajo=${t.id}" style="cursor:pointer;">
        <td>${escapeHtml(t.cliente_nombre)}</td>
        <td>${escapeHtml(t.tipo)}</td>
        <td>${escapeHtml(t.descripcion)}</td>
        <td class="num">${clp(t.monto)}</td>
        <td class="num">${t.saldo > 0 ? `<span class="danger">${clp(t.saldo)}</span>` : clp(0)}</td>
        <td>${t.fecha_creacion}</td>
        <td>${badgeTrabajo(t.estado)}</td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="search-box">${filterBtns}</div>
    <div class="panel"><div class="panel-body">
      ${
        rows
          ? `<table><thead><tr><th>Cliente</th><th>Tipo</th><th>Descripción</th><th class="num">Monto</th><th class="num">Saldo</th><th>Creado</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty-state"><div class="big-ic">🔧</div>
             <p>${
               estado === "abiertos"
                 ? "No tienes trabajos abiertos. 🎉"
                 : `No hay trabajos ${estado ? "con este estado" : "registrados"} todavía.`
             }</p>
             <button class="btn btn-accent" data-goto="#/clientes">Ir a clientes</button></div>`
      }
    </div></div>
  `);
  attachNav();
}

function badgeAvanceTipo(tipo) {
  if (tipo === "foto") return '<span class="badge accent">Foto</span>';
  if (tipo === "url") return '<span class="badge accent">Enlace</span>';
  if (tipo === "estado") return '<span class="badge ok">Estado</span>';
  return '<span class="badge neutral">Nota</span>';
}

function fechaCortaHora(iso) {
  if (!iso) return "";
  // Trabajos cerrados antes de este cambio guardaron fecha_cierre solo como
  // "YYYY-MM-DD" (sin hora). Si a eso le aplicamos toLocaleString con hora,
  // JS lo interpreta como medianoche UTC y en horario de Chile se corre al
  // día anterior en la noche — mejor mostrar solo la fecha en ese caso.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CL", { dateStyle: "medium" });
  }
  try {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function ultimaActividad(trabajo, avances) {
  let ultima = trabajo.fecha_creacion || null;
  for (const a of avances) {
    const fecha = a.editado_en || a.creado_en;
    if (fecha && (!ultima || fecha > ultima)) ultima = fecha;
  }
  return ultima;
}

// Describe en una línea de texto plano (para el WhatsApp) qué es el
// avance más reciente, según su tipo. Así, aunque el cliente no abra el
// link de seguimiento, el mensaje de WhatsApp ya le cuenta la novedad.
function contenidoAvanceWhatsapp(avance) {
  if (!avance) return "";
  const texto = (avance.texto || "").trim();
  switch (avance.tipo) {
    case "nota":
      return texto;
    case "url":
      return texto ? `${texto}: ${avance.valor}` : avance.valor;
    case "foto":
      return texto ? `Se subió una foto: ${texto}` : "Se subió una foto del trabajo.";
    case "estado":
      // El hito de estado ya trae la frase completa (ej: 'Estado
      // actualizado a "Terminado"'), no hay que envolverla de nuevo.
      return texto;
    default:
      return texto;
  }
}

function mensajeSeguimientoWhatsapp(trabajo, linkUrl, ultima, ultimoAvance) {
  const estadoTexto = trabajo.estado ? trabajo.estado.toLowerCase() : "";
  const lineaEstado = estadoTexto ? `, actualmente en estado "${trabajo.estado}"` : "";
  const contenidoAvance = contenidoAvanceWhatsapp(ultimoAvance);
  // Si ya hay avances, la novedad más reciente es más útil que la
  // descripción fija del trabajo (que ya le mandamos la primera vez).
  const lineaNovedad = contenidoAvance
    ? `\n\nÚltima novedad: ${contenidoAvance}`
    : trabajo.descripcion && trabajo.descripcion.trim()
    ? `\n\nDetalle: ${trabajo.descripcion.trim()}`
    : "";
  const lineaUltima = ultima ? `\n\nÚltima actualización: ${fechaCortaHora(ultima)}` : "";

  // El estado del pago solo se avisa en el mensaje final (trabajo
  // Terminado) — mientras el trabajo sigue abierto no aporta y puede
  // confundir (ej: todavía no se le ha cobrado nada).
  let lineaPago = "";
  if (trabajo.estado === "Terminado" && trabajo.monto > 0) {
    if (trabajo.pagado_completo) lineaPago = `\n\nEl pago de este trabajo ya quedó completo ${EMOJI_CHECK}`;
    else if (trabajo.abonado > 0)
      lineaPago = `\n\nLlevas abonado ${clp(trabajo.abonado)} de ${clp(trabajo.monto)} (saldo: ${clp(trabajo.saldo)}).`;
    else lineaPago = `\n\nEl total de este trabajo es ${clp(trabajo.monto)}, todavía pendiente de pago.`;
  }

  return `Hola ${trabajo.cliente_nombre}, soy de ${currentNombreNegocio}.

Te comparto el link de seguimiento de tu trabajo (${trabajo.tipo})${lineaEstado}:
${linkUrl}${lineaNovedad}${lineaUltima}${lineaPago}

Ahí vas a poder ver cada avance a medida que lo vamos subiendo. Cualquier consulta, escríbeme por acá. Y si quieres conocer nuestros servicios: ${SITIO_WEB_NEGOCIO}`;
}

function badgeItemTipo(tipo) {
  if (tipo === "repuesto") return '<span class="badge accent">Repuesto</span>';
  if (tipo === "servicio") return '<span class="badge warn">Servicio</span>';
  return '<span class="badge neutral">Otro</span>';
}

// Desglose del trabajo (repuestos y/o servicios, cada uno con su valor).
// Es informativo — el monto que realmente se cobra sigue siendo el campo
// "Monto (CLP)" del trabajo — pero le permite a Sergio explicarle al
// cliente en qué se compone ese total (ej: disco $20.000 + formateo
// $15.000 = $35.000), tanto acá en el panel como en la página pública de
// seguimiento y en el mensaje de WhatsApp.
async function renderItemsTrabajo(trabajo, containerId = "items-trabajo-container") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="panel"><div class="panel-body padded"><div class="empty-state">Cargando…</div></div></div>`;

  let items = [];
  try {
    const data = await apiGet(`/api/trabajos/${trabajo.id}/items`);
    items = data.items;
  } catch (err) {
    if (await handleAuthError(err)) return;
    container.innerHTML = `<div class="panel"><div class="panel-body padded">No se pudo cargar el desglose.</div></div>`;
    return;
  }

  const total = items.reduce((s, i) => s + i.valor, 0);
  const rows = items
    .map(
      (i) => `
      <tr>
        <td>${badgeItemTipo(i.tipo)}</td>
        <td>${escapeHtml(i.descripcion)}</td>
        <td class="num">${clp(i.valor)}</td>
        <td><button type="button" class="btn btn-outline btn-sm" data-del-item="${i.id}">Eliminar</button></td>
      </tr>`
    )
    .join("");

  const diferencia = trabajo.monto - total;
  const lineaComparacion =
    items.length && diferencia !== 0
      ? `<span class="hint" style="color:var(--warn,#b45309);">El desglose suma ${clp(total)}, pero el "Monto (CLP)" del trabajo es ${clp(
          trabajo.monto
        )} (diferencia de ${clp(Math.abs(diferencia))}). Puede que quieras ajustar uno de los dos.</span>`
      : "";

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>Desglose del trabajo (repuestos / servicios)</h2></div>
      <div class="panel-body padded">
        ${
          rows
            ? `<table><thead><tr><th>Tipo</th><th>Descripción</th><th class="num">Valor</th><th></th></tr></thead><tbody>${rows}</tbody>
               <tfoot><tr><td colspan="2"><strong>Total del desglose</strong></td><td class="num"><strong>${clp(
                 total
               )}</strong></td><td></td></tr></tfoot></table>`
            : `<div class="panel-empty">Todavía no agregas repuestos ni servicios a este trabajo.</div>`
        }
        ${lineaComparacion}
        <form id="item-trabajo-form" class="form-grid" style="margin-top:14px;">
          <div class="field"><label for="item-tipo">Tipo</label>
            <select id="item-tipo">
              <option value="repuesto">Repuesto</option>
              <option value="servicio">Servicio</option>
              <option value="otro">Otro</option>
            </select></div>
          <div class="field"><label for="item-descripcion">Descripción</label>
            <input type="text" id="item-descripcion" placeholder="Ej: Disco duro, Formateo e instalación de sistema..."></div>
          <div class="field"><label for="item-valor">Valor (CLP)</label>
            <input type="number" id="item-valor" min="0" step="1" value="0"></div>
          <div class="field" style="align-self:flex-end;"><button type="submit" class="btn btn-outline btn-sm">Agregar ítem</button></div>
        </form>
        <span class="hint">Este desglose es solo para que quede claro en qué se compone el cobro — el monto que realmente se le cobra al cliente sigue siendo el campo "Monto (CLP)" de arriba.</span>
      </div>
    </div>
  `;

  container.querySelector("#item-trabajo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const descripcion = container.querySelector("#item-descripcion").value.trim();
    if (!descripcion) {
      flash("Describe el repuesto o servicio.", "error");
      return;
    }
    try {
      await apiPost(`/api/trabajos/${trabajo.id}/items`, {
        tipo: container.querySelector("#item-tipo").value,
        descripcion,
        valor: container.querySelector("#item-valor").value,
      });
      flash("Ítem agregado.");
      renderItemsTrabajo(trabajo, containerId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  container.querySelectorAll("[data-del-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este ítem del desglose?")) return;
      try {
        await apiDelete(`/api/trabajos/${trabajo.id}/items/${btn.dataset.delItem}`);
        renderItemsTrabajo(trabajo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });
}

async function renderSeguimiento(trabajo, containerId = "seguimiento-container") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="panel"><div class="panel-body padded"><div class="empty-state">Cargando seguimiento…</div></div></div>`;

  let avances = [];
  let envios = [];
  try {
    const data = await apiGet(`/api/trabajos/${trabajo.id}/avances`);
    avances = data.avances;
    const dataEnvios = await apiGet(`/api/trabajos/${trabajo.id}/envios`);
    envios = dataEnvios.envios;
  } catch (err) {
    if (await handleAuthError(err)) return;
    container.innerHTML = `<div class="panel"><div class="panel-body padded">No se pudo cargar el seguimiento.</div></div>`;
    return;
  }
  const linkUrl = trabajo.public_token
    ? `${window.location.origin}/seguimiento?t=${trabajo.public_token}`
    : null;
  // Para "última actividad enviada" y la novedad del WhatsApp solo cuentan
  // los avances que YA marcaste visibles para el cliente — si todavía está
  // oculto (en borrador), no corresponde adelantárselo por WhatsApp.
  const avancesVisibles = avances.filter((a) => a.visible_cliente);
  const ultimaParaMensaje = ultimaActividad(trabajo, avancesVisibles);
  // El endpoint trae los avances del más nuevo al más antiguo, así que el
  // primero de la lista es el más reciente (la "novedad" a contarle al
  // cliente por WhatsApp).
  const ultimoAvance = avancesVisibles.length ? avancesVisibles[0] : null;
  const mensajeWhatsapp = linkUrl
    ? mensajeSeguimientoWhatsapp(trabajo, linkUrl, ultimaParaMensaje, ultimoAvance)
    : "";
  const numeroWhatsapp = telefonoWhatsapp(trabajo.cliente_telefono);
  const hrefWhatsapp = numeroWhatsapp
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensajeWhatsapp)}`
    : `https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`;

  const ultima = ultimaParaMensaje;

  // Un hito por avance, con su punto sobre la línea vertical — el mismo
  // formato de timeline que usan las páginas de seguimiento de pedidos de
  // las grandes tiendas/couriers (línea de tiempo con hitos fechados, el
  // más reciente arriba y remarcado).
  function renderAvancePanelItem(a, esReciente) {
    const fecha = fechaCortaHora(a.creado_en);
    const editadoTag = a.editado_en
      ? `<span class="text-muted"> · editado ${fechaCortaHora(a.editado_en)}</span>`
      : "";
    const claseHito = `avance-hito${esReciente ? " reciente" : ""}`;

    if (a.tipo === "estado") {
      return `
        <div class="${claseHito}" data-avance-item="${a.id}">
          <div class="fecha">${fecha} · ${badgeAvanceTipo(a.tipo)} · <span class="badge ok">Siempre visible para el cliente</span></div>
          <p style="font-weight:650;">${escapeHtml(a.texto || "")}</p>
        </div>`;
    }

    let body = "";
    if (a.tipo === "nota") {
      body = `<p>${escapeHtml(a.texto || "")}</p>`;
    } else if (a.tipo === "url") {
      body = `<p><a href="${escapeHtml(a.valor)}" target="_blank" rel="noopener">${escapeHtml(
        a.texto || a.valor
      )}</a></p>`;
    } else if (a.tipo === "foto") {
      body = `<img src="/api/public/fotos/${escapeHtml(a.valor)}" alt="${escapeHtml(a.texto || "Foto del trabajo")}">
        ${a.texto ? `<p class="muted">${escapeHtml(a.texto)}</p>` : ""}`;
    }
    // Trazabilidad de cuándo se le mostró al cliente — se conserva la fecha
    // aunque después se vuelva a ocultar, para que quede el historial.
    const visibleTag = a.visible_cliente
      ? `<span class="badge accent">Visible para el cliente desde ${fechaCortaHora(a.visible_desde)}</span>`
      : a.visible_desde
      ? `<span class="badge neutral">Oculto ahora · se mostró desde ${fechaCortaHora(a.visible_desde)}</span>`
      : `<span class="badge neutral">Oculto para el cliente</span>`;
    const revisadoTag = a.revisado_en
      ? `<div class="text-muted" style="font-size:12px;margin-top:6px;">&#10003; El cliente lo marcó como revisado el ${fechaCortaHora(
          a.revisado_en
        )}</div>`
      : a.visible_cliente
      ? `<div class="text-muted" style="font-size:12px;margin-top:6px;">Todavía no lo revisa el cliente.</div>`
      : "";
    return `
      <div class="${claseHito}" data-avance-item="${a.id}">
        <div class="fecha">${fecha} · ${badgeAvanceTipo(a.tipo)}${editadoTag}</div>
        <div data-avance-view>
          ${body}
          <div style="margin-top:6px;">${visibleTag}</div>
          ${revisadoTag}
          <div class="actions-row" style="margin-top:8px;">
            <button type="button" class="btn ${a.visible_cliente ? "btn-danger" : "btn-accent"} btn-sm" data-toggle-visible="${a.id}" data-visible-actual="${a.visible_cliente ? "1" : "0"}">
              ${a.visible_cliente ? "Ocultar del cliente" : "Mostrar al cliente"}
            </button>
            <button type="button" class="btn btn-outline btn-sm" data-edit-avance="${a.id}">Editar</button>
            <button type="button" class="btn btn-outline btn-sm" data-del-avance="${a.id}">Eliminar</button>
          </div>
        </div>
      </div>`;
  }

  // Para que revisar la trazabilidad no sea engorroso cuando un trabajo
  // lleva muchos avances: timeline vertical con el más nuevo arriba
  // (remarcado) y el historial completo debajo, siempre en la misma línea
  // continua — solo se pliegan los más antiguos detrás de un "Ver más"
  // discreto (como Gmail/GitHub), nunca se esconde información.
  const CANTIDAD_RECIENTES = 4;
  const avancesRecientes = avances.slice(0, CANTIDAD_RECIENTES);
  const avancesAntiguos = avances.slice(CANTIDAD_RECIENTES);

  const itemsHtml = avances.length
    ? `<div class="avances-timeline">` +
      avancesRecientes.map((a, i) => renderAvancePanelItem(a, i === 0)).join("") +
      (avancesAntiguos.length
        ? `<button type="button" class="btn-ver-mas-avances" id="btn-ver-avances-antiguos">Ver ${avancesAntiguos.length} avance${avancesAntiguos.length === 1 ? "" : "s"} anterior${avancesAntiguos.length === 1 ? "" : "es"} &#8595;</button>
           <div id="avances-antiguos" style="display:none;">${avancesAntiguos.map((a) => renderAvancePanelItem(a, false)).join("")}</div>`
        : "") +
      `</div>`
    : `<div class="panel-empty">Todavía no has agregado avances.</div>`;

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header"><h2>Seguimiento para el cliente</h2></div>
      <div class="panel-body padded">
        <div class="field">
          <label>Link para compartir con el cliente</label>
          ${
            linkUrl
              ? `<div class="actions-row">
                   <input type="text" readonly value="${escapeHtml(linkUrl)}" id="link-seguimiento" style="flex:1;">
                   <button type="button" class="btn btn-outline btn-sm" id="btn-copiar-link">Copiar</button>
                   <a class="btn btn-accent btn-sm" id="btn-whatsapp-link" href="${hrefWhatsapp}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
                 </div>`
              : `<button type="button" class="btn btn-accent btn-sm" id="btn-generar-link">Generar link</button>`
          }
          <span class="hint">Este link no requiere que el cliente inicie sesión — cualquiera que lo tenga puede ver el avance de este trabajo.</span>
          ${
            linkUrl && !numeroWhatsapp
              ? `<span class="hint">Este cliente no tiene teléfono registrado, así que WhatsApp te va a pedir elegir el contacto a mano. <a data-goto="#/clientes/${trabajo.cliente_id}/editar">Agrégalo en su ficha</a> para que la próxima vez se abra el chat directo.</span>`
              : ""
          }
          ${
            linkUrl
              ? `<span class="hint">Última actividad enviada al cliente: ${ultima ? fechaCortaHora(ultima) : "todavía ninguna"}.</span>`
              : ""
          }
          ${
            linkUrl && envios.length
              ? `<details style="margin-top:6px;">
                   <summary class="hint" style="cursor:pointer;">Historial de envíos por WhatsApp (${envios.length}) — para revisar qué le mandaste si te pregunta</summary>
                   <div style="margin-top:8px;">
                     ${envios
                       .map(
                         (e) => `
                       <div style="padding:8px 0;border-bottom:1px solid var(--border);">
                         <div class="text-muted" style="font-size:12px;">${fechaCortaHora(e.creado_en)}</div>
                         <p style="margin:2px 0 0;white-space:pre-wrap;font-size:13px;">${escapeHtml(e.mensaje)}</p>
                       </div>`
                       )
                       .join("")}
                   </div>
                 </details>`
              : ""
          }
        </div>

        <span class="hint" style="display:block;margin-top:14px;">Los avances que agregues nacen <strong>ocultos para el cliente</strong>: los vas armando con calma y cuando decidas que ya están listos, marcas "Mostrar al cliente" en cada uno (los cambios de estado sí se muestran solos, siempre).</span>
        <div class="form-grid" style="margin-top:10px;">
          <form id="avance-nota-form">
            <div class="field"><label for="nota-texto">Agregar nota de avance</label>
              <textarea id="nota-texto" placeholder="Ej: Se revisó la fuente de poder, falta repuesto"></textarea></div>
            <button type="submit" class="btn btn-outline btn-sm">Agregar nota</button>
          </form>
          <form id="avance-url-form">
            <div class="field"><label for="url-valor">Agregar enlace</label>
              <input type="text" id="url-valor" placeholder="https://..."></div>
            <div class="field"><label for="url-texto">Descripción (opcional)</label>
              <input type="text" id="url-texto" placeholder="Ej: Demo del sistema"></div>
            <button type="submit" class="btn btn-outline btn-sm">Agregar enlace</button>
          </form>
        </div>

        <form id="avance-foto-form" style="margin-top:14px;">
          <div class="field"><label for="foto-archivo">Subir foto</label>
            <input type="file" id="foto-archivo" accept="image/png,image/jpeg,image/webp,image/gif"></div>
          <div class="field"><label for="foto-texto">Descripción (opcional)</label>
            <input type="text" id="foto-texto" placeholder="Ej: Equipo antes de la reparación"></div>
          <button type="submit" class="btn btn-outline btn-sm">Subir foto</button>
        </form>
      </div>
      <div class="panel-body" style="padding:0 20px;">
        ${
          avances.some((a) => !a.visible_cliente)
            ? `<div style="padding-top:16px;"><button type="button" class="btn btn-accent btn-sm" id="btn-mostrar-todo-cliente">Mostrar todo el historial al cliente</button>
                 <span class="hint">Para cuando el cliente pide ver todo (útil antes de mandarle el link) — marca visibles de una vez todos los avances que todavía estaban ocultos. Si también pide ver cuánto pagó/debe, marca además "Mostrar al cliente" en el bloque "Detalle y pago para el cliente", arriba, en los datos del trabajo.</span></div>`
            : ""
        }
        ${itemsHtml}
      </div>
    </div>
  `;

  const btnMostrarTodo = container.querySelector("#btn-mostrar-todo-cliente");
  if (btnMostrarTodo) {
    btnMostrarTodo.addEventListener("click", async () => {
      const ocultos = avances.filter((a) => !a.visible_cliente);
      try {
        await Promise.all(
          ocultos.map((a) =>
            apiPut(`/api/trabajos/${trabajo.id}/avances/${a.id}`, { visible_cliente: true })
          )
        );
        flash(`${ocultos.length} avance${ocultos.length === 1 ? "" : "s"} marcado${ocultos.length === 1 ? "" : "s"} visible para el cliente.`);
        renderSeguimiento(trabajo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }

  const btnVerAntiguos = container.querySelector("#btn-ver-avances-antiguos");
  if (btnVerAntiguos) {
    btnVerAntiguos.addEventListener("click", () => {
      container.querySelector("#avances-antiguos").style.display = "block";
      btnVerAntiguos.remove();
    });
  }

  const btnGenerar = container.querySelector("#btn-generar-link");
  if (btnGenerar) {
    btnGenerar.addEventListener("click", async () => {
      try {
        const res = await apiPost(`/api/trabajos/${trabajo.id}/link`, {});
        trabajo.public_token = res.token;
        flash("Link generado.");
        renderSeguimiento(trabajo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }

  const btnCopiar = container.querySelector("#btn-copiar-link");
  if (btnCopiar) {
    btnCopiar.addEventListener("click", async () => {
      const input = container.querySelector("#link-seguimiento");
      try {
        await navigator.clipboard.writeText(input.value);
        flash("Link copiado.");
      } catch {
        input.select();
        flash("Selecciona y copia el link manualmente.", "error");
      }
    });
  }

  // Queda registro de qué se mandó por WhatsApp y cuándo, para que si el
  // cliente pregunta algo más adelante, puedas volver atrás a revisarlo. No
  // podemos saber si realmente lo envió (WhatsApp se abre en otra pestaña),
  // así que se guarda al momento de apretar el botón.
  const btnWhatsapp = container.querySelector("#btn-whatsapp-link");
  if (btnWhatsapp && mensajeWhatsapp) {
    btnWhatsapp.addEventListener("click", () => {
      apiPost(`/api/trabajos/${trabajo.id}/envios`, { mensaje: mensajeWhatsapp }).catch(() => {
        /* si falla el registro, igual dejamos que el link a WhatsApp funcione */
      });
    });
  }

  container.querySelector("#avance-nota-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = container.querySelector("#nota-texto").value.trim();
    if (!texto) return;
    try {
      await apiPost(`/api/trabajos/${trabajo.id}/avances`, { tipo: "nota", texto });
      flash("Nota agregada.");
      renderSeguimiento(trabajo, containerId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  container.querySelector("#avance-url-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const valor = container.querySelector("#url-valor").value.trim();
    const texto = container.querySelector("#url-texto").value.trim();
    if (!valor) return;
    try {
      await apiPost(`/api/trabajos/${trabajo.id}/avances`, { tipo: "url", valor, texto });
      flash("Enlace agregado.");
      renderSeguimiento(trabajo, containerId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  container.querySelector("#avance-foto-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#foto-archivo");
    const texto = container.querySelector("#foto-texto").value.trim();
    if (!input.files || !input.files[0]) {
      flash("Selecciona una imagen primero.", "error");
      return;
    }
    const formData = new FormData();
    formData.append("foto", input.files[0]);
    formData.append("texto", texto);
    try {
      await apiPostForm(`/api/trabajos/${trabajo.id}/fotos`, formData);
      flash("Foto subida.");
      renderSeguimiento(trabajo, containerId);
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  container.querySelectorAll("[data-edit-avance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const avanceId = btn.dataset.editAvance;
      const a = avances.find((x) => String(x.id) === String(avanceId));
      if (!a) return;
      const itemEl = container.querySelector(`[data-avance-item="${avanceId}"]`);
      const viewEl = itemEl.querySelector("[data-avance-view]");

      let formHtml = "";
      if (a.tipo === "nota") {
        formHtml = `
          <div class="field"><textarea data-edit-texto>${escapeHtml(a.texto || "")}</textarea></div>`;
      } else if (a.tipo === "url") {
        formHtml = `
          <div class="field"><label>Enlace</label><input type="text" data-edit-valor value="${escapeHtml(a.valor || "")}"></div>
          <div class="field"><label>Descripción</label><input type="text" data-edit-texto value="${escapeHtml(a.texto || "")}"></div>`;
      } else if (a.tipo === "foto") {
        formHtml = `
          <img src="/api/public/fotos/${escapeHtml(a.valor)}" alt="" style="max-width:180px;border-radius:8px;display:block;margin-bottom:8px;">
          <div class="field"><label>Descripción</label><input type="text" data-edit-texto value="${escapeHtml(a.texto || "")}"></div>`;
      }

      viewEl.innerHTML = `
        <div data-avance-edit-form>
          ${formHtml}
          <div class="actions-row" style="margin-top:6px;">
            <button type="button" class="btn btn-accent btn-sm" data-save-avance="${a.id}">Guardar</button>
            <button type="button" class="btn btn-outline btn-sm" data-cancel-avance>Cancelar</button>
          </div>
        </div>`;

      viewEl.querySelector("[data-cancel-avance]").addEventListener("click", () => renderSeguimiento(trabajo, containerId));
      viewEl.querySelector("[data-save-avance]").addEventListener("click", async () => {
        const textoEl = viewEl.querySelector("[data-edit-texto]");
        const valorEl = viewEl.querySelector("[data-edit-valor]");
        const payload = { texto: textoEl ? textoEl.value.trim() : "" };
        if (valorEl) payload.valor = valorEl.value.trim();
        try {
          await apiPut(`/api/trabajos/${trabajo.id}/avances/${a.id}`, payload);
          flash("Avance actualizado.");
          renderSeguimiento(trabajo, containerId);
        } catch (err) {
          if (await handleAuthError(err)) return;
          flash(err.message, "error");
        }
      });
    });
  });

  container.querySelectorAll("[data-del-avance]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const avanceId = btn.dataset.delAvance;
      if (!confirm("¿Eliminar este avance?")) return;
      try {
        await apiDelete(`/api/trabajos/${trabajo.id}/avances/${avanceId}`);
        flash("Avance eliminado.");
        renderSeguimiento(trabajo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });

  container.querySelectorAll("[data-toggle-visible]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const avanceId = btn.dataset.toggleVisible;
      const estabaVisible = btn.dataset.visibleActual === "1";
      try {
        await apiPut(`/api/trabajos/${trabajo.id}/avances/${avanceId}`, {
          visible_cliente: !estabaVisible,
        });
        flash(estabaVisible ? "Avance ocultado del cliente." : "Avance marcado como visible para el cliente.");
        renderSeguimiento(trabajo, containerId);
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });
}

async function viewTrabajoForm(id, presetClienteId) {
  let trabajo = null;
  let equiposVinculados = [];
  if (id) {
    const data = await apiGet(`/api/trabajos/${id}`);
    trabajo = data.trabajo;
    equiposVinculados = data.equiposVinculados || [];
  }
  setPage({ title: trabajo ? "Editar trabajo" : "Nuevo trabajo" });

  const clienteBlock = trabajo
    ? `<div class="field"><label>Cliente</label><input type="text" value="${escapeHtml(trabajo.cliente_nombre)}" disabled>
         <span class="hint">Aquí no se puede cambiar (este trabajo queda siempre a nombre del mismo cliente). ¿Necesitas corregir el teléfono, correo u otro dato del cliente? <a data-goto="#/clientes/${trabajo.cliente_id}/editar">Edítalos aquí</a>.</span></div>`
    : `<div class="field"><label for="cliente_id">Cliente *</label>
         <select id="cliente_id" required><option value="">Selecciona un cliente...</option>${await clienteOptions(
           presetClienteId
         )}</select></div>`;

  const tipoOptions = TIPOS_TRABAJO.map(
    (t) => `<option value="${t}" ${trabajo && trabajo.tipo === t ? "selected" : ""}>${t}</option>`
  ).join("");
  const estadoOptions = ESTADOS_TRABAJO.map(
    (e) => `<option value="${e}" ${trabajo && trabajo.estado === e ? "selected" : ""}>${e}</option>`
  ).join("");

  // Tabla de equipos/garantías vinculados a este trabajo — mismo formato que
  // la tabla de "Equipos y garantías" de la ficha del cliente, para que se
  // reconozca de inmediato.
  const equiposVinculadosRows = equiposVinculados
    .map(
      (e) => `
      <tr data-equipo-detalle="${e.id}" style="cursor:pointer;">
        <td>${escapeHtml(e.tipo_equipo)}${e.marca_modelo ? `<br><span class="muted">${escapeHtml(e.marca_modelo)}</span>` : ""}</td>
        <td>${escapeHtml(e.numero_serie || "—")}</td>
        <td class="num">${clp(e.precio)}</td>
        <td class="num">${e.saldo > 0 ? `<span class="danger">${clp(e.saldo)}</span>` : clp(0)}</td>
        <td>${e.fecha_venta}</td>
        <td>${badgeGarantia(e)}</td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="panel">
      <div class="panel-header"><h2>Datos del trabajo</h2></div>
      <div class="panel-body padded">
        <form id="trabajo-form">
          ${clienteBlock}
          <div class="form-grid">
            <div class="field"><label for="tipo">Tipo</label><select id="tipo">${tipoOptions}</select></div>
            <div class="field"><label for="estado">Estado</label><select id="estado">${estadoOptions}</select></div>
          </div>
          <div class="field"><label for="descripcion">Descripción *</label>
            <textarea id="descripcion" required>${escapeHtml(trabajo?.descripcion || "")}</textarea></div>
          <div class="field"><label for="monto">Monto (CLP)</label>
            <input type="number" id="monto" min="0" step="1" value="${trabajo ? trabajo.monto : 0}"></div>
          ${
            trabajo
              ? `<div class="field">
                   <label style="display:flex;align-items:center;gap:8px;font-weight:400;">
                     <input type="checkbox" id="mostrar_detalle_cliente" ${trabajo.mostrar_detalle_cliente ? "checked" : ""} style="width:auto;">
                     Mostrar el detalle y pago al cliente en su página de seguimiento
                   </label>
                   <span class="hint">Mientras esté sin marcar, el cliente NO ve el desglose (repuestos/servicios), la garantía ni el monto/saldo — solo el avance del trabajo. Actívalo cuando el monto ya esté definitivo.</span>
                 </div>`
              : ""
          }
          <div class="field"><label for="notas">Notas</label><textarea id="notas">${escapeHtml(trabajo?.notas || "")}</textarea></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-accent">Guardar</button>
            <button type="button" class="btn btn-outline" data-goto="${
              trabajo ? `#/clientes/${trabajo.cliente_id}` : "#/trabajos"
            }">Cancelar</button>
            ${trabajo ? `<button type="button" class="btn btn-danger-outline" id="btn-eliminar-trabajo" style="margin-left:auto;">Eliminar trabajo</button>` : ""}
          </div>
        </form>
      </div>
    </div>

    ${
      trabajo
        ? `<div class="panel" style="margin-top:22px;">
             <div class="panel-header"><h2>Equipos y garantía de este trabajo</h2>
               <button class="btn btn-accent btn-sm" data-goto="#/equipos/nuevo?cliente_id=${trabajo.cliente_id}&trabajo_id=${trabajo.id}">+ Agregar equipo/producto en garantía</button></div>
             <div class="panel-body">
               ${
                 equiposVinculadosRows
                   ? `<table><thead><tr><th>Equipo</th><th>N° serie</th><th class="num">Precio</th><th class="num">Saldo</th><th>Venta</th><th>Garantía</th></tr></thead><tbody>${equiposVinculadosRows}</tbody></table>`
                   : `<div class="panel-empty">Ningún equipo/producto vinculado todavía. Usa el botón de arriba si en este trabajo cambiaste una pieza (disco, fuente, etc.) para que el cliente tenga su garantía visible.</div>`
               }
             </div>
           </div>`
        : ""
    }
    ${trabajo ? `<div id="items-trabajo-container" style="margin-top:22px;"></div>` : ""}
    ${trabajo ? `<div id="seguimiento-container" style="margin-top:22px;"></div>` : ""}
    ${trabajo ? `<div id="abonos-container" style="margin-top:22px;"></div>` : ""}
  `);
  attachNav();
  if (trabajo) renderItemsTrabajo(trabajo);
  if (trabajo) renderSeguimiento(trabajo);
  if (trabajo) {
    renderAbonosPanel("abonos-container", {
      categoria: "trabajo",
      referenciaId: trabajo.id,
      montoTotal: trabajo.monto,
      clienteNombre: trabajo.cliente_nombre,
      clienteTelefono: trabajo.cliente_telefono,
    });
  }

  document.getElementById("trabajo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      tipo: document.getElementById("tipo").value,
      estado: document.getElementById("estado").value,
      descripcion: document.getElementById("descripcion").value,
      monto: document.getElementById("monto").value,
      notas: document.getElementById("notas").value,
    };
    const chkDetalle = document.getElementById("mostrar_detalle_cliente");
    if (chkDetalle) payload.mostrar_detalle_cliente = chkDetalle.checked;
    try {
      if (trabajo) {
        const res = await apiPut(`/api/trabajos/${trabajo.id}`, payload);
        flash("Trabajo actualizado.");
        window.location.hash = `#/clientes/${res.cliente_id}?trabajo=${trabajo.id}`;
      } else {
        payload.cliente_id = document.getElementById("cliente_id").value;
        const res = await apiPost("/api/trabajos", payload);
        flash("Trabajo registrado.");
        window.location.hash = `#/clientes/${res.cliente_id}?trabajo=${res.id}`;
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  const btnEliminarTrabajo = document.getElementById("btn-eliminar-trabajo");
  if (btnEliminarTrabajo) {
    btnEliminarTrabajo.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este trabajo?")) return;
      try {
        const res = await apiDelete(`/api/trabajos/${trabajo.id}`);
        flash("Trabajo eliminado.");
        window.location.hash = `#/clientes/${res.cliente_id}`;
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }
}

/* ---------------------------------------------------------------- */
/* Mensualidades                                                       */
/* ---------------------------------------------------------------- */
async function viewMensualidadesList() {
  setPage({ title: "Mensualidades" });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const { mensualidades } = await apiGet("/api/mensualidades");

  const rows = mensualidades
    .map(
      (m) => `
      <tr>
        <td><a data-goto="#/clientes/${m.cliente_id}">${escapeHtml(m.cliente_nombre)}</a></td>
        <td><a data-goto="#/mensualidades/${m.id}/editar">${escapeHtml(m.descripcion)}</a></td>
        <td class="num">${clp(m.monto)}</td>
        <td>Día ${m.dia_cobro}</td>
        <td><span class="badge ${m.activo ? "accent" : "neutral"}">${m.activo ? "Activa" : "Inactiva"}</span></td>
        <td>${
          m.pagado_completo
            ? '<span class="badge ok">Pagado</span>'
            : `<span class="badge warn">Saldo ${clp(m.saldo)}</span>`
        }</td>
        <td>${
          m.activo && !m.pagado_completo
            ? `<button class="btn btn-accent btn-sm" data-pagar="${m.id}">Marcar pagado</button>`
            : ""
        }</td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="panel"><div class="panel-body">
      ${
        rows
          ? `<table><thead><tr><th>Cliente</th><th>Servicio</th><th class="num">Monto</th><th>Día de cobro</th><th>Estado</th><th>Este mes</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty-state"><div class="big-ic">💳</div>
             <p>No hay mensualidades registradas todavía. Agrégalas desde la ficha de cada cliente.</p>
             <button class="btn btn-accent" data-goto="#/clientes">Ir a clientes</button></div>`
      }
    </div></div>
  `);
  attachNav();
  els.content.querySelectorAll("[data-pagar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await apiPost(`/api/mensualidades/${btn.dataset.pagar}/pagar`, {});
        flash("Pago registrado.");
        viewMensualidadesList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  });
}

async function viewMensualidadForm(id, presetClienteId) {
  let mensualidad = null;
  if (id) {
    const data = await apiGet(`/api/mensualidades/${id}`);
    mensualidad = data.mensualidad;
  }
  setPage({ title: mensualidad ? "Editar mensualidad" : "Nueva mensualidad" });

  const clienteBlock = mensualidad
    ? `<div class="field"><label>Cliente</label><input type="text" value="${escapeHtml(mensualidad.cliente_nombre)}" disabled>
         <span class="hint">Aquí no se puede cambiar (esta mensualidad queda siempre a nombre del mismo cliente). ¿Necesitas corregir el teléfono, correo u otro dato del cliente? <a data-goto="#/clientes/${mensualidad.cliente_id}/editar">Edítalos aquí</a>.</span></div>`
    : `<div class="field"><label for="cliente_id">Cliente *</label>
         <select id="cliente_id" required><option value="">Selecciona un cliente...</option>${await clienteOptions(
           presetClienteId
         )}</select></div>`;

  setContent(`
    <div class="form-card">
      <form id="mensualidad-form">
        ${clienteBlock}
        <div class="field"><label for="descripcion">Servicio *</label>
          <input type="text" id="descripcion" required placeholder="Mantención mensual, hosting, soporte remoto..." value="${escapeHtml(
            mensualidad?.descripcion || ""
          )}"></div>
        <div class="form-grid">
          <div class="field"><label for="monto">Monto mensual (CLP)</label>
            <input type="number" id="monto" min="0" step="1" value="${mensualidad ? mensualidad.monto : 0}"></div>
          <div class="field"><label for="dia_cobro">Día de cobro del mes</label>
            <input type="number" id="dia_cobro" min="1" max="31" value="${mensualidad ? mensualidad.dia_cobro : 1}"></div>
        </div>
        ${
          mensualidad
            ? `<div class="field checkbox-row"><input type="checkbox" id="activo" ${mensualidad.activo ? "checked" : ""}>
                <label for="activo" style="margin:0;">Mensualidad activa</label></div>`
            : ""
        }
        <div class="form-actions">
          <button type="submit" class="btn btn-accent">Guardar</button>
          <button type="button" class="btn btn-outline" data-goto="${
            mensualidad ? `#/clientes/${mensualidad.cliente_id}` : "#/mensualidades"
          }">Cancelar</button>
        </div>
      </form>
      ${
        mensualidad
          ? `<form id="mensualidad-eliminar-form" style="margin-top:14px;"><button type="submit" class="btn btn-danger-outline btn-sm">Eliminar mensualidad</button></form>`
          : ""
      }
    </div>
    ${mensualidad ? `<div id="abonos-container" style="margin-top:22px;"></div>` : ""}
  `);
  attachNav();
  if (mensualidad) {
    renderAbonosPanel("abonos-container", {
      categoria: "mensualidad",
      referenciaId: mensualidad.id,
      montoTotal: mensualidad.monto,
      periodo: mensualidad.periodo_actual,
      clienteNombre: mensualidad.cliente_nombre,
      clienteTelefono: mensualidad.cliente_telefono,
    });
  }

  document.getElementById("mensualidad-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      descripcion: document.getElementById("descripcion").value,
      monto: document.getElementById("monto").value,
      dia_cobro: document.getElementById("dia_cobro").value,
    };
    try {
      if (mensualidad) {
        payload.activo = document.getElementById("activo").checked;
        const res = await apiPut(`/api/mensualidades/${mensualidad.id}`, payload);
        flash("Mensualidad actualizada.");
        window.location.hash = `#/clientes/${res.cliente_id}`;
      } else {
        payload.cliente_id = document.getElementById("cliente_id").value;
        const res = await apiPost("/api/mensualidades", payload);
        flash("Mensualidad registrada.");
        window.location.hash = `#/clientes/${res.cliente_id}`;
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });

  const delForm = document.getElementById("mensualidad-eliminar-form");
  if (delForm) {
    delForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!confirm("¿Eliminar esta mensualidad y su historial de pagos?")) return;
      try {
        const res = await apiDelete(`/api/mensualidades/${mensualidad.id}`);
        flash("Mensualidad eliminada.");
        window.location.hash = `#/clientes/${res.cliente_id}`;
      } catch (err) {
        if (await handleAuthError(err)) return;
        flash(err.message, "error");
      }
    });
  }
}

/* ---------------------------------------------------------------- */
/* Finanzas                                                             */
/* ---------------------------------------------------------------- */
async function viewFinanzas() {
  setPage({
    title: "Finanzas",
    subtitle: "Quién está en deuda, quién ha abonado y quién ya pagó todo.",
  });
  setContent(`<div class="empty-state">Cargando…</div>`);
  const data = await apiGet("/api/finanzas/resumen");

  const badgeEstado = (estado) => {
    if (estado === "al_dia") return '<span class="badge ok">Al día</span>';
    if (estado === "abono_parcial") return '<span class="badge warn">Abono parcial</span>';
    return '<span class="badge danger">Sin abonos</span>';
  };

  const rows = data.clientes
    .map(
      (c) => `
      <tr data-goto="#/clientes/${c.cliente_id}" style="cursor:pointer;">
        <td>${escapeHtml(c.cliente_nombre)}</td>
        <td class="num">${clp(c.total_facturado)}</td>
        <td class="num">${clp(c.total_abonado)}</td>
        <td class="num">${c.saldo > 0 ? `<span class="danger">${clp(c.saldo)}</span>` : clp(0)}</td>
        <td>${badgeEstado(c.estado)}</td>
      </tr>`
    )
    .join("");

  setContent(`
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Total facturado</div><div class="value">${clp(data.total_facturado)}</div></div>
      <div class="stat-card"><div class="label">Total abonado</div><div class="value accent">${clp(data.total_abonado)}</div></div>
      <div class="stat-card"><div class="label">Total pendiente por cobrar</div>
        <div class="value ${data.total_pendiente ? "danger" : "ok"}">${clp(data.total_pendiente)}</div></div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Estado de cuenta por cliente</h2></div>
      <div class="panel-body">
        ${
          rows
            ? `<table><thead><tr><th>Cliente</th><th class="num">Facturado</th><th class="num">Abonado</th><th class="num">Saldo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
            : `<div class="empty-state"><div class="big-ic">💰</div>
               <p>Todavía no hay trabajos, equipos ni mensualidades facturados a ningún cliente.</p></div>`
        }
      </div>
    </div>
  `);
  attachNav();
}

/* ---------------------------------------------------------------- */
/* Mi cuenta                                                            */
/* ---------------------------------------------------------------- */
async function viewCuenta() {
  setPage({ title: "Mi cuenta", subtitle: "Cambia tu usuario o contraseña de acceso al panel." });
  setContent(`
    <div class="form-card">
      <form id="cuenta-form">
        <div class="field"><label for="c-username">Usuario</label>
          <input type="text" id="c-username" required value="${escapeHtml(currentUsername)}"></div>
        <div class="field"><label for="c-current-password">Contraseña actual *</label>
          <input type="password" id="c-current-password" required>
          <span class="hint">La necesitamos para confirmar que eres tú.</span></div>
        <div class="field"><label for="c-new-password">Nueva contraseña</label>
          <input type="password" id="c-new-password">
          <span class="hint">Déjala en blanco si no quieres cambiarla. Mínimo 6 caracteres si la cambias.</span></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-accent">Guardar cambios</button>
          <button type="button" class="btn btn-outline" data-goto="#/">Cancelar</button>
        </div>
      </form>
    </div>
  `);
  attachNav();

  document.getElementById("cuenta-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      username: document.getElementById("c-username").value,
      current_password: document.getElementById("c-current-password").value,
      new_password: document.getElementById("c-new-password").value,
    };
    try {
      const res = await apiPut("/api/account", payload);
      currentUsername = res.username;
      els.usernameLabel.textContent = res.username;
      flash("Cuenta actualizada.");
      window.location.hash = "#/";
    } catch (err) {
      if (await handleAuthError(err)) return;
      flash(err.message, "error");
    }
  });
}

/* ---------------------------------------------------------------- */
/* Router                                                               */
/* ---------------------------------------------------------------- */
function parseHash() {
  const raw = window.location.hash.slice(1) || "/";
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart || "");
  return { parts, query };
}

async function router() {
  const { parts, query } = parseHash();
  setActiveNav(parts[0] || "");
  try {
    if (parts.length === 0) {
      await viewDashboard();
    } else if (parts[0] === "clientes") {
      if (parts.length === 1) await viewClientesList(query.get("q") || "");
      else if (parts[1] === "nuevo") await viewClienteForm(null);
      else if (parts[2] === "editar") await viewClienteForm(parts[1]);
      else
        await viewClienteDetalle(parts[1], {
          openTrabajoId: query.get("trabajo"),
          openEquipoId: query.get("equipo"),
        });
    } else if (parts[0] === "equipos") {
      if (parts.length === 1) await viewEquiposList();
      else if (parts[1] === "nuevo") await viewEquipoForm(null, query.get("cliente_id"), query.get("trabajo_id"));
      else if (parts[2] === "editar") {
        // Un equipo siempre se ve y se edita dentro de la hoja de su
        // cliente — este link antiguo (o cualquiera guardado de antes)
        // redirige ahí en vez de abrir una página aparte.
        const { equipo } = await apiGet(`/api/equipos/${parts[1]}`);
        window.location.hash = `#/clientes/${equipo.cliente_id}?equipo=${parts[1]}`;
      }
    } else if (parts[0] === "trabajos") {
      if (parts.length === 1) await viewTrabajosList(query.get("estado") || "");
      else if (parts[1] === "nuevo") await viewTrabajoForm(null, query.get("cliente_id"));
      else if (parts[2] === "editar") {
        // Igual que con equipos: un trabajo siempre se ve dentro de la hoja
        // de su cliente, nunca en una página aparte.
        const { trabajo } = await apiGet(`/api/trabajos/${parts[1]}`);
        window.location.hash = `#/clientes/${trabajo.cliente_id}?trabajo=${parts[1]}`;
      }
    } else if (parts[0] === "mensualidades") {
      if (parts.length === 1) await viewMensualidadesList();
      else if (parts[1] === "nuevo") await viewMensualidadForm(null, query.get("cliente_id"));
      else if (parts[2] === "editar") await viewMensualidadForm(parts[1], null);
    } else if (parts[0] === "finanzas") {
      await viewFinanzas();
    } else if (parts[0] === "cuenta") {
      await viewCuenta();
    } else {
      setPage({ title: "No encontrado" });
      setContent(`<div class="empty-state">Página no encontrada.</div>`);
    }
  } catch (err) {
    if (await handleAuthError(err)) return;
    flash(err.message || "Ocurrió un error.", "error");
  }
}

/* ---------------------------------------------------------------- */
/* Bootstrap                                                            */
/* ---------------------------------------------------------------- */
// Listener delegado único: funciona para cualquier [data-goto], esté donde
// esté en la página (contenido central, acciones del topbar, etc.), y no
// necesita volver a conectarse después de cada render.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-goto]");
  if (el) {
    e.preventDefault();
    window.location.hash = el.dataset.goto;
  }
});

// Todos los trabajos y equipos de un cliente ya están desplegados de una
// vez en su misma hoja (ver viewClienteDetalle) — esta fila/atajo solo baja
// con scroll suave hasta el bloque correspondiente, sin volver a cargar
// nada. Sirve tanto para las tablas de resumen como para la tabla de
// "Equipos y garantía de este trabajo" dentro de un trabajo ya abierto.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-scroll-target]");
  if (el) {
    const destino = document.getElementById(el.dataset.scrollTarget);
    if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

async function bootstrap() {
  try {
    const me = await apiGet("/api/me");
    if (me.needsSetup) {
      window.location.href = "/setup.html";
      return;
    }
    if (!me.authenticated) {
      window.location.href = "/login.html";
      return;
    }
    currentNombreNegocio = me.nombreNegocio || "Mis Pitutos Informáticos";
    els.brandName.textContent = currentNombreNegocio;
    els.usernameLabel.textContent = me.username;
    currentUsername = me.username;
  } catch (err) {
    window.location.href = "/login.html";
    return;
  }

  document.getElementById("logout-link").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      /* noop */
    }
    window.location.href = "/login.html";
  });

  window.addEventListener("hashchange", router);
  router();
}

bootstrap();
