// Catálogo privado — se entiende solo con el link que trae ?t=<token>.
// Sin ese token válido, el backend no entrega productos.

const params = new URLSearchParams(window.location.search);
const TOKEN = params.get("t") || "";

const state = {
  productos: [],
  negocio: "",
  carrito: {}, // sku -> cantidad
};

function money(n) {
  return "$" + Number(n || 0).toLocaleString("es-CL");
}

function productoPorSku(sku) {
  return state.productos.find((p) => p.sku === sku);
}

function totalCarrito() {
  return Object.entries(state.carrito).reduce((sum, [sku, cant]) => {
    const p = productoPorSku(sku);
    return sum + (p ? p.precio * cant : 0);
  }, 0);
}

function cantidadCarrito() {
  return Object.values(state.carrito).reduce((a, b) => a + b, 0);
}

async function cargarCatalogo() {
  const app = document.getElementById("app");
  if (!TOKEN) {
    app.innerHTML = `<div class="error-page">Este link no es válido. Pide el link correcto a Mis Pitutos Informáticos.</div>`;
    return;
  }

  let res, data;
  try {
    res = await fetch(`/api/catalogo?t=${encodeURIComponent(TOKEN)}`);
    data = await res.json();
  } catch {
    app.innerHTML = `<div class="error-page">No se pudo cargar el catálogo. Revisa tu conexión e intenta de nuevo.</div>`;
    return;
  }

  if (!res.ok) {
    app.innerHTML = `<div class="error-page">${data.error || "Este link no es válido."}</div>`;
    return;
  }

  state.productos = data.productos || [];
  state.negocio = data.negocio || "Catálogo";
  document.getElementById("nombre-negocio").textContent = state.negocio;
  document.title = state.negocio;

  const banner = document.getElementById("banner-destacado");
  if (data.mensaje_destacado) {
    // Texto duplicado dentro de una "pista" que se desplaza en loop (mismo
    // efecto marquee que la portada) — se arma con nodos de texto (no
    // innerHTML) para no correr riesgo de inyectar HTML desde el mensaje
    // que el admin escribe en el panel.
    banner.textContent = "";
    const track = document.createElement("div");
    track.className = "banner-marquee-track";
    const span1 = document.createElement("span");
    span1.textContent = data.mensaje_destacado;
    const span2 = document.createElement("span");
    span2.textContent = data.mensaje_destacado;
    span2.setAttribute("aria-hidden", "true");
    track.append(span1, span2);
    banner.append(track);
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  configurarContacto(data.contacto || {});
  renderCatalogo();

  // Si el link trae ?p=<sku>, abrimos ese producto directo (links compartidos).
  const skuInicial = params.get("p");
  if (skuInicial && productoPorSku(skuInicial)) {
    abrirProducto(skuInicial);
  }
}

let hayContactoEmail = false;

function configurarContacto(contacto) {
  hayContactoEmail = !!contacto.email;

  // Una sola barra de contacto, arriba, dentro de la cabecera fija —
  // siempre visible aunque se baje la página. Solo correo (se sacó
  // WhatsApp de aquí). El pie de página no repite estos datos; solo
  // lleva el crédito del sitio.
  const btnCorreo = document.getElementById("btn-abrir-contacto-top");

  btnCorreo.hidden = !hayContactoEmail;
  document.getElementById("contact-bar-top").hidden = !hayContactoEmail;

  return hayContactoEmail;
}

let categoriaSeleccionada = "";

function renderCatalogo() {
  const app = document.getElementById("app");
  if (!state.productos.length) {
    app.innerHTML = `<div class="loading">Por ahora no hay productos disponibles. Vuelve a revisar más tarde.</div>`;
    return;
  }

  const categorias = [...new Set(state.productos.map((p) => p.categoria || "General"))].sort();
  const productosFiltrados = categoriaSeleccionada
    ? state.productos.filter((p) => (p.categoria || "General") === categoriaSeleccionada)
    : state.productos;

  const filtroHtml =
    categorias.length > 1
      ? `
    <div class="categoria-filtros">
      <button type="button" class="chip-categoria ${categoriaSeleccionada === "" ? "active" : ""}" data-cat="">Todas</button>
      ${categorias
        .map((c) => `<button type="button" class="chip-categoria ${categoriaSeleccionada === c ? "active" : ""}" data-cat="${c}">${c}</button>`)
        .join("")}
    </div>
  `
      : "";

  app.innerHTML = `
    <p class="catalog-intro">Elige lo que necesites y arma tu pedido. El pago se hace con Mercado Pago.</p>
    ${filtroHtml}
    <div class="catalog-grid">
      ${productosFiltrados.map(productoCardHtml).join("")}
    </div>
  `;

  app.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaSeleccionada = btn.dataset.cat;
      renderCatalogo();
    });
  });

  app.querySelectorAll("[data-ver-sku]").forEach((card) => {
    card.addEventListener("click", () => abrirProducto(card.dataset.verSku));
  });
}

// Aviso de poco stock — "¡Última unidad!" (1) o "¡Pocas unidades!" (2-3),
// para que el cliente sienta que hay que apurarse. No aplica a servicios
// (no manejan stock) ni a productos agotados (ese ya tiene su propio aviso).
function alertaStock(p) {
  if (p.tipo === "servicio" || typeof p.stock !== "number" || p.stock <= 0) return null;
  if (p.stock === 1) return { texto: "¡Última unidad!", clase: "stock-alert-critica" };
  if (p.stock <= 3) return { texto: "¡Pocas unidades!", clase: "stock-alert-baja" };
  return null;
}

function productoCardHtml(p) {
  const foto = p.fotos && p.fotos[0] ? p.fotos[0] : "";
  const esServicio = p.tipo === "servicio";
  const agotado = !esServicio && typeof p.stock === "number" && p.stock <= 0;
  const alerta = alertaStock(p);
  return `
    <button type="button" class="product-card" data-ver-sku="${p.sku}">
      <div class="product-photo-wrap">
        ${foto ? `<img class="product-photo" src="${foto}" alt="${p.nombre}" loading="lazy" />` : `<div class="product-photo product-photo-empty"></div>`}
        ${esServicio ? `<span class="badge-servicio">Servicio</span>` : ""}
        ${agotado ? `<span class="badge-agotado">Agotado</span>` : ""}
        ${alerta ? `<span class="badge-stock-alerta ${alerta.clase}">${alerta.texto}</span>` : ""}
      </div>
      <div class="product-body">
        <div class="product-name">${p.nombre}</div>
        <div class="product-price">${money(p.precio)}</div>
      </div>
    </button>
  `;
}

let productoModalSku = null;

function abrirProducto(sku) {
  const p = productoPorSku(sku);
  if (!p) return;
  productoModalSku = sku;

  const foto = p.fotos && p.fotos[0] ? p.fotos[0] : "";
  const fotoEl = document.getElementById("pm-foto");
  if (foto) {
    fotoEl.src = foto;
    fotoEl.alt = p.nombre;
    fotoEl.hidden = false;
  } else {
    fotoEl.hidden = true;
  }

  document.getElementById("pm-nombre").textContent = p.nombre;

  const catEl = document.getElementById("pm-categoria");
  if (p.categoria) {
    catEl.textContent = p.categoria;
    catEl.hidden = false;
  } else {
    catEl.hidden = true;
  }

  document.getElementById("pm-descripcion").textContent = p.descripcion || "";
  document.getElementById("pm-precio").textContent = money(p.precio);

  const esServicio = p.tipo === "servicio";
  const agotado = !esServicio && typeof p.stock === "number" && p.stock <= 0;
  const alerta = alertaStock(p);
  const stockEl = document.getElementById("pm-stock");
  stockEl.classList.remove("stock-alert-critica", "stock-alert-baja");
  if (alerta) {
    stockEl.textContent = alerta.texto;
    stockEl.classList.add(alerta.clase);
    stockEl.hidden = false;
  } else if (!esServicio && !agotado && typeof p.stock === "number" && p.stock <= 5) {
    stockEl.textContent = `Quedan ${p.stock} disponibles`;
    stockEl.hidden = false;
  } else {
    stockEl.hidden = true;
  }

  // Un servicio no se compra directo: se pide una cotización en vez de
  // mostrar cantidad + "Agregar al carrito".
  document.getElementById("pm-actions").hidden = esServicio || agotado;
  document.getElementById("pm-agotado").hidden = esServicio || !agotado;
  document.getElementById("pm-cotizar-actions").hidden = !esServicio;

  const qtyInput = document.getElementById("pm-qty");
  qtyInput.value = 1;
  qtyInput.max = typeof p.stock === "number" ? p.stock : 50;

  document.getElementById("pm-copiado").hidden = true;

  document.getElementById("producto-modal").hidden = false;
}

function cerrarProducto() {
  document.getElementById("producto-modal").hidden = true;
  productoModalSku = null;
}

function agregarDesdeModal() {
  const sku = productoModalSku;
  const p = productoPorSku(sku);
  if (!p) return;

  const qtyInput = document.getElementById("pm-qty");
  let cantidad = Math.max(1, Math.min(50, Number(qtyInput.value) || 1));
  const yaEnCarrito = state.carrito[sku] || 0;
  if (typeof p.stock === "number" && yaEnCarrito + cantidad > p.stock) {
    cantidad = Math.max(0, p.stock - yaEnCarrito);
    if (cantidad <= 0) return;
  }
  state.carrito[sku] = yaEnCarrito + cantidad;
  actualizarContadorCarrito();

  const btn = document.getElementById("btn-agregar-modal");
  btn.textContent = "Agregado ✓";
  setTimeout(() => {
    btn.textContent = "Agregar al carrito";
    cerrarProducto();
  }, 700);
}

async function copiarLinkProducto() {
  if (!productoModalSku) return;
  const url = new URL(window.location.href);
  url.searchParams.set("p", productoModalSku);
  try {
    await navigator.clipboard.writeText(url.toString());
  } catch {
    // Si el navegador bloquea el portapapeles, no interrumpimos el flujo.
  }
  document.getElementById("pm-copiado").hidden = false;
}

function actualizarContadorCarrito() {
  document.getElementById("carrito-contador").textContent = cantidadCarrito();
}

function renderCarritoPanel() {
  const itemsEl = document.getElementById("cart-items");
  const vacioEl = document.getElementById("cart-vacio");
  const btnPagar = document.getElementById("btn-ir-a-pagar");
  const entradas = Object.entries(state.carrito).filter(([, c]) => c > 0);

  if (!entradas.length) {
    itemsEl.innerHTML = "";
    vacioEl.hidden = false;
    btnPagar.hidden = true;
  } else {
    vacioEl.hidden = true;
    btnPagar.hidden = false;
    itemsEl.innerHTML = entradas
      .map(([sku, cant]) => {
        const p = productoPorSku(sku);
        if (!p) return "";
        return `
          <div class="cart-item">
            <div>
              <div class="cart-item-name">${p.nombre}</div>
              <div class="cart-item-sub">${cant} x ${money(p.precio)}</div>
            </div>
            <button type="button" class="btn-remove" data-remove-sku="${sku}">Quitar</button>
          </div>
        `;
      })
      .join("");

    itemsEl.querySelectorAll("[data-remove-sku]").forEach((btn) => {
      btn.addEventListener("click", () => {
        delete state.carrito[btn.dataset.removeSku];
        actualizarContadorCarrito();
        renderCarritoPanel();
      });
    });
  }

  document.getElementById("cart-total").textContent = money(totalCarrito());
}

function abrirCarrito() {
  renderCarritoPanel();
  document.getElementById("cart-panel").hidden = false;
}

function cerrarCarrito() {
  document.getElementById("cart-panel").hidden = true;
}

function abrirContacto() {
  const form = document.getElementById("contacto-form");
  form.hidden = false;
  form.reset();
  document.getElementById("contacto-error").hidden = true;
  document.getElementById("contacto-ok").hidden = true;
  document.getElementById("contacto-modal").hidden = false;
}

function cerrarContacto() {
  document.getElementById("contacto-modal").hidden = true;
}

async function enviarContacto(e) {
  e.preventDefault();
  const errorEl = document.getElementById("contacto-error");
  errorEl.hidden = true;
  const form = document.getElementById("contacto-form");
  const btn = form.querySelector("button[type=submit]");

  const nombre = document.getElementById("ct-nombre").value.trim();
  const contacto = document.getElementById("ct-contacto").value.trim();
  const mensaje = document.getElementById("ct-mensaje").value.trim();

  if (!nombre || !contacto || !mensaje) {
    errorEl.textContent = "Completa todos los campos.";
    errorEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Enviando…";

  let res, data;
  try {
    res = await fetch("/api/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, nombre, contacto, mensaje }),
    });
    data = await res.json();
  } catch {
    errorEl.textContent = "No se pudo enviar el mensaje. Revisa tu conexión e intenta de nuevo.";
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Enviar";
    return;
  }

  if (!res.ok) {
    errorEl.textContent = data.error || "No se pudo enviar el mensaje.";
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Enviar";
    return;
  }

  form.hidden = true;
  document.getElementById("contacto-ok").hidden = false;
}

// ---------- Cotizar (servicios) ----------

let cotizarSku = null;

function abrirCotizar(sku) {
  const p = productoPorSku(sku);
  cotizarSku = sku || null;
  cerrarProducto();

  document.getElementById("cotizar-titulo").textContent = p ? `Cotizar: ${p.nombre}` : "Solicitar cotización";
  const form = document.getElementById("cotizar-form");
  form.hidden = false;
  form.reset();
  document.getElementById("cotizar-error").hidden = true;
  document.getElementById("cotizar-ok").hidden = true;
  document.getElementById("cotizar-modal").hidden = false;
}

function cerrarCotizar() {
  document.getElementById("cotizar-modal").hidden = true;
  cotizarSku = null;
}

async function enviarCotizacion(e) {
  e.preventDefault();
  const errorEl = document.getElementById("cotizar-error");
  errorEl.hidden = true;
  const form = document.getElementById("cotizar-form");
  const btn = form.querySelector("button[type=submit]");

  const nombre = document.getElementById("cz-nombre").value.trim();
  const telefonoDigitos = document.getElementById("cz-telefono").value.replace(/\D/g, "");
  const email = document.getElementById("cz-email").value.trim();
  const descripcion = document.getElementById("cz-descripcion").value.trim();

  if (!nombre || !descripcion) {
    errorEl.textContent = "Completa tu nombre y cuéntanos tu proyecto.";
    errorEl.hidden = false;
    return;
  }
  if (!telefonoDigitos && !email) {
    errorEl.textContent = "Déjanos un teléfono o un correo para poder contactarte.";
    errorEl.hidden = false;
    return;
  }
  if (telefonoDigitos && telefonoDigitos.length < 8) {
    errorEl.textContent = "El teléfono debe tener 8 dígitos, o déjalo vacío.";
    errorEl.hidden = false;
    return;
  }

  const telefono = telefonoDigitos ? `+56 9 ${telefonoDigitos}` : "";
  const producto = cotizarSku ? productoPorSku(cotizarSku) : null;

  btn.disabled = true;
  btn.textContent = "Enviando…";

  let res, data;
  try {
    res = await fetch("/api/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: TOKEN,
        nombre,
        telefono,
        email,
        descripcion,
        producto_sku: producto ? producto.sku : "",
        producto_nombre: producto ? producto.nombre : "",
      }),
    });
    data = await res.json();
  } catch {
    errorEl.textContent = "No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.";
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Enviar solicitud";
    return;
  }

  if (!res.ok) {
    errorEl.textContent = data.error || "No se pudo enviar la solicitud.";
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Enviar solicitud";
    return;
  }

  form.hidden = true;
  document.getElementById("cotizar-ok").hidden = false;
}

function abrirCheckout() {
  cerrarCarrito();
  resetCheckoutModal();
  document.getElementById("checkout-modal").hidden = false;
}

function cerrarCheckout() {
  document.getElementById("checkout-modal").hidden = true;
}

function resetCheckoutModal() {
  document.getElementById("checkout-form").hidden = false;
  document.getElementById("checkout-form").reset();
  document.getElementById("checkout-error").hidden = true;
  document.getElementById("post-mercadopago").hidden = true;
}

// El pago ahora es solo por Mercado Pago (se sacó transferencia + subir
// comprobante del catálogo público).
async function enviarPedido(e) {
  e.preventDefault();
  const errorEl = document.getElementById("checkout-error");
  errorEl.hidden = true;
  const btn = document.getElementById("btn-confirmar-pedido");

  const nombre = document.getElementById("f-nombre").value.trim();
  const telefonoDigitos = document.getElementById("f-telefono").value.replace(/\D/g, "");
  const email = document.getElementById("f-email").value.trim();
  const direccion = document.getElementById("f-direccion").value.trim();

  if (!nombre || telefonoDigitos.length < 8 || !email || !direccion) {
    errorEl.textContent = "Completa nombre, teléfono (8 dígitos), correo y dirección.";
    errorEl.hidden = false;
    return;
  }

  const telefono = `+56 9 ${telefonoDigitos}`;

  const items = Object.entries(state.carrito)
    .filter(([, c]) => c > 0)
    .map(([sku, cantidad]) => ({ sku, cantidad }));

  if (!items.length) {
    errorEl.textContent = "Tu carrito está vacío.";
    errorEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Enviando…";

  let res, data;
  try {
    res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, nombre, telefono, email, direccion, metodo_pago: "mercadopago", items }),
    });
    data = await res.json();
  } catch {
    errorEl.textContent = "No se pudo enviar el pedido. Revisa tu conexión e intenta de nuevo.";
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Confirmar y pagar con Mercado Pago";
    return;
  }

  if (!res.ok) {
    errorEl.textContent = data.error || "No se pudo enviar el pedido.";
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Confirmar y pagar con Mercado Pago";
    return;
  }

  document.getElementById("checkout-form").hidden = true;
  state.carrito = {};
  actualizarContadorCarrito();

  document.getElementById("post-mercadopago").hidden = false;
  document.getElementById("link-mercadopago").href = data.init_point;
  window.location.href = data.init_point;
}

document.getElementById("btn-abrir-carrito").addEventListener("click", abrirCarrito);
document.getElementById("btn-cerrar-carrito").addEventListener("click", cerrarCarrito);
document.getElementById("btn-ir-a-pagar").addEventListener("click", abrirCheckout);
document.getElementById("btn-cerrar-checkout").addEventListener("click", cerrarCheckout);
document.getElementById("checkout-form").addEventListener("submit", enviarPedido);

document.getElementById("btn-cerrar-producto").addEventListener("click", cerrarProducto);
document.getElementById("btn-agregar-modal").addEventListener("click", agregarDesdeModal);
document.getElementById("btn-copiar-link").addEventListener("click", copiarLinkProducto);
document.getElementById("btn-cotizar-modal").addEventListener("click", () => abrirCotizar(productoModalSku));

document.getElementById("btn-cerrar-cotizar").addEventListener("click", cerrarCotizar);
document.getElementById("cotizar-form").addEventListener("submit", enviarCotizacion);

document.getElementById("btn-abrir-contacto-top").addEventListener("click", abrirContacto);
document.getElementById("btn-cerrar-contacto").addEventListener("click", cerrarContacto);
document.getElementById("contacto-form").addEventListener("submit", enviarContacto);

// Tocar el fondo oscuro (fuera de la tarjeta blanca) cierra el modal.
document.getElementById("cart-panel").addEventListener("click", (e) => {
  if (e.target.id === "cart-panel") cerrarCarrito();
});
document.getElementById("producto-modal").addEventListener("click", (e) => {
  if (e.target.id === "producto-modal") cerrarProducto();
});
document.getElementById("checkout-modal").addEventListener("click", (e) => {
  if (e.target.id === "checkout-modal") cerrarCheckout();
});
document.getElementById("contacto-modal").addEventListener("click", (e) => {
  if (e.target.id === "contacto-modal") cerrarContacto();
});
document.getElementById("cotizar-modal").addEventListener("click", (e) => {
  if (e.target.id === "cotizar-modal") cerrarCotizar();
});

cargarCatalogo();
