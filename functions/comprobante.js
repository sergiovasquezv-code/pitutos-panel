// Sirve la página pública de comprobante de abono directamente en
// /comprobante (sin .html), igual que functions/garantia.js y
// functions/seguimiento.js — mismo motivo: evitar el bucle de
// redirecciones entre la URL "limpia" y el .html real.
//
// Si cambias public/comprobante.html, copia el cambio también aquí abajo
// (son dos copias a propósito, por la razón de arriba).

const PAGINA_BASE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comprobante de pago</title>
  <meta property="og:title" content="Comprobante de pago">
  <meta property="og:description" content="Revisa el detalle de tu pago y el estado de tu cuenta.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://panel.mispitutosinformaticos.cl/comprobante">
  <meta name="twitter:card" content="summary">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    /* Tema claro y profesional para esta página pública — a propósito
       independiente del tema Matrix del panel interno, para que lo que
       ve el cliente se vea sobrio y confiable. */
    :root {
      --bg: #f4f6fa;
      --card: #ffffff;
      --border: #e3e7ef;
      --text: #1c2536;
      --text-muted: #6b7690;
      --navy-950: #10203a;
      --navy-900: #eef1f6;
      --navy-800: #e6eaf1;
      --accent: #7c3aed;
      --accent-dark: #6d28d9;
      --accent-soft: #f1ecfd;
      --warn: #b45309;
      --warn-soft: #fff2d9;
      --danger: #b3261e;
      --danger-soft: #fdeceb;
      --ok: #197a4f;
      --ok-soft: #e7f6ee;
      --radius: 12px;
      --shadow: 0 8px 30px rgba(20, 30, 50, .08), 0 1px 2px rgba(20, 30, 50, .04);
    }
    body { background: var(--bg); }
    .public-wrap { max-width: 640px; margin: 0 auto; padding: 32px 18px 60px; }
    .public-header { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
    .public-header .logo {
      width: 42px; height: 42px; border-radius: 10px; background: var(--navy-950);
      color: var(--accent); display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 15px; flex-shrink: 0;
    }
    .public-header .negocio { font-weight: 650; font-size: 15.5px; }
    .public-header .subt { color: var(--text-muted); font-size: 12.5px; }
    .card {
      background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: var(--shadow); padding: 22px; margin-bottom: 18px;
    }
    .card h1 { font-size: 19px; margin: 0 0 4px; }
    .card .cliente { color: var(--text-muted); font-size: 13.5px; margin-bottom: 14px; }
    .monto-grande { font-size: 30px; font-weight: 700; margin: 6px 0 2px; }
    .monto-label { color: var(--text-muted); font-size: 12.5px; text-transform: uppercase; letter-spacing: .03em; font-weight: 600; }
    .detalle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; margin-top: 14px; }
    .detalle-grid .item .label { font-size: 11.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; font-weight: 600; }
    .detalle-grid .item .valor { font-size: 14.5px; margin-top: 2px; }
    .banner-saldo {
      border-radius: 12px; border-left: 4px solid currentColor; padding: 18px; margin-top: 4px; display: flex; align-items: flex-start; gap: 12px;
    }
    .banner-saldo .ic { font-size: 22px; line-height: 1; flex-shrink: 0; }
    .banner-saldo .titulo { font-weight: 700; font-size: 16px; margin: 0 0 4px; }
    .banner-saldo .detalle { font-size: 13.5px; margin: 0; }
    .banner-saldo.ok { background: var(--ok-soft); color: var(--ok); }
    .banner-saldo.warn { background: var(--warn-soft); color: var(--warn); }
    .historial-item {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13.5px;
    }
    .historial-item:last-child { border-bottom: none; }
    .historial-item .fecha { color: var(--text-muted); }
    .historial-item .nota { display: block; color: var(--text-muted); font-size: 12px; margin-top: 2px; }
    .footer-note { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="public-wrap">
    <div class="public-header">
      <div class="logo" id="logo-ini">PI</div>
      <div>
        <div class="negocio" id="negocio-nombre">Cargando…</div>
        <div class="subt">Comprobante de pago</div>
      </div>
    </div>

    <div id="content">
      <div class="card"><div class="empty-state">Cargando información…</div></div>
    </div>

    <div class="footer-note" id="footer-note" style="display:none;">
      Este es un link privado — no lo compartas si no quieres que otras personas vean el detalle de tu cuenta.
      <br><a href="https://mispitutosinformaticos.cl/" target="_blank" rel="noopener">Conoce más de nuestros servicios</a>
    </div>
  </div>

  <script type="module">
    function escapeHtml(str) {
      return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[c]));
    }

    function clp(value) {
      const n = Math.round(Number(value) || 0);
      return "$" + n.toLocaleString("es-CL");
    }

    function fechaLarga(fecha) {
      if (!fecha) return "";
      try {
        const [y, m, d] = fecha.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("es-CL", { dateStyle: "long" });
      } catch {
        return fecha;
      }
    }

    const ETIQUETA_CATEGORIA = { trabajo: "Trabajo", equipo: "Equipo", mensualidad: "Mensualidad" };

    function bannerSaldo(data) {
      if (data.pagado_completo) {
        return \`
          <div class="banner-saldo ok">
            <div class="ic">&#10003;</div>
            <div>
              <p class="titulo">Cuenta al día</p>
              <p class="detalle">Ya pagaste el total de \${clp(data.monto_total)}\${data.periodo ? " correspondiente a este mes" : ""}. ¡Gracias!</p>
            </div>
          </div>\`;
      }
      return \`
        <div class="banner-saldo warn">
          <div class="ic">&#8987;</div>
          <div>
            <p class="titulo">Queda un saldo pendiente</p>
            <p class="detalle">Llevas abonado \${clp(data.abonado)} de \${clp(data.monto_total)} · saldo pendiente: <strong>\${clp(data.saldo)}</strong>.</p>
          </div>
        </div>\`;
    }

    async function cargar() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("t");
      const content = document.getElementById("content");

      if (!token) {
        content.innerHTML = \`<div class="card"><div class="empty-state">Este link no es válido.</div></div>\`;
        return;
      }

      let data;
      try {
        const res = await fetch(\`/api/public/comprobante/\${encodeURIComponent(token)}\`);
        if (!res.ok) {
          content.innerHTML = \`<div class="card"><div class="empty-state">Este comprobante no es válido o ya no está disponible.</div></div>\`;
          return;
        }
        data = await res.json();
      } catch {
        content.innerHTML = \`<div class="card"><div class="empty-state">No se pudo cargar la información. Intenta de nuevo más tarde.</div></div>\`;
        return;
      }

      document.title = \`Comprobante de pago — \${data.negocio}\`;
      document.getElementById("negocio-nombre").textContent = data.negocio;
      document.getElementById("logo-ini").textContent = data.negocio
        .split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "PI";
      document.getElementById("footer-note").style.display = "block";

      const historialHtml = data.historial
        .map(
          (a) => \`
          <div class="historial-item">
            <div>
              <div class="fecha">\${fechaLarga(a.fecha_pago)}</div>
              \${a.nota ? \`<span class="nota">\${escapeHtml(a.nota)}</span>\` : ""}
            </div>
            <div><strong>\${clp(a.monto)}</strong></div>
          </div>\`
        )
        .join("");

      content.innerHTML = \`
        <div class="card">
          <h1>Recibimos tu pago, gracias 🙌</h1>
          <div class="cliente">\${escapeHtml(data.cliente_nombre)} · \${ETIQUETA_CATEGORIA[data.categoria] || "Cuenta"}\${data.periodo ? " · " + data.periodo : ""}</div>
          <div class="monto-label">Monto abonado</div>
          <div class="monto-grande">\${clp(data.abono.monto)}</div>
          <div class="detalle-grid">
            <div class="item"><div class="label">Concepto</div><div class="valor">\${escapeHtml(data.concepto)}</div></div>
            <div class="item"><div class="label">Fecha de pago</div><div class="valor">\${fechaLarga(data.abono.fecha_pago)}</div></div>
            \${data.abono.nota ? \`<div class="item"><div class="label">Nota</div><div class="valor">\${escapeHtml(data.abono.nota)}</div></div>\` : ""}
          </div>
        </div>
        <div class="card">\${bannerSaldo(data)}</div>
        \${
          data.historial.length > 1
            ? \`<div class="card"><h1 style="font-size:15.5px;">Historial de pagos\${data.periodo ? " de este mes" : ""}</h1>\${historialHtml}</div>\`
            : ""
        }
      \`;
    }

    cargar();
  </script>
</body>
</html>
`

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";

  let titulo = "Comprobante de pago";
  let descripcion = "Revisa el detalle de tu pago y el estado de tu cuenta.";

  if (token && env.DB) {
    try {
      const abono = await env.DB.prepare("SELECT * FROM abonos WHERE public_token = ?").bind(token).first();
      if (abono) {
        const negocio = env.NOMBRE_NEGOCIO || "Pitutos Informáticos";
        titulo = `Comprobante de pago — ${negocio}`;
        descripcion = `Comprobante por ${new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "CLP",
          maximumFractionDigits: 0,
        }).format(abono.monto)}.`;
      }
    } catch {
      // Si falla la lectura, igual servimos la página con el título genérico.
    }
  }

  const html = PAGINA_BASE
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtmlAttr(titulo)}</title>`)
    .replace(
      /<meta property="og:title" content=".*?">/,
      `<meta property="og:title" content="${escapeHtmlAttr(titulo)}">`
    )
    .replace(
      /<meta property="og:description" content=".*?">/,
      `<meta property="og:description" content="${escapeHtmlAttr(descripcion)}">`
    )
    .replace(
      /<meta property="og:url" content=".*?">/,
      `<meta property="og:url" content="${escapeHtmlAttr(url.href)}">`
    );

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtmlAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
