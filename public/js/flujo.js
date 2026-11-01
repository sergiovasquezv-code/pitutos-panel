import { clp } from "./format.js";

// Un paso se abre cuando el anterior ya tiene una elección, o cuando el
// trabajo ya trae líneas cargadas (casos anteriores a este flujo).
// En cotización no se muestran "qué se hizo" ni el cierre: todavía no hay
// visita, foto ni entrega. El informe sale cuando ya hay líneas.
export function pasosAbiertos({ tipoMarcado, hechoMarcado, tieneLineas, cierreEstadoMarcado, esCotizacion }) {
  if (esCotizacion) {
    return { tipo: true, hecho: false, detalle: true, cierre: false, informe: !!tieneLineas };
  }
  const hecho = !!(tipoMarcado || tieneLineas);
  const detalle = !!(hecho && (hechoMarcado || tieneLineas));
  const cierre = detalle;
  const informe = !!(cierre && cierreEstadoMarcado);
  return { tipo: true, hecho, detalle, cierre, informe };
}

// En el cierre se ve un grupo a la vez: foto, después garantía, después listo.
// Un grupo ya elegido en un trabajo viejo sigue visible aunque falte uno anterior.
export function gruposCierreVisibles(grupos, elegido) {
  const visibles = [];
  for (const g of grupos) {
    visibles.push(g);
    if (!elegido[g]) break;
  }
  for (const g of grupos) {
    if (elegido[g] && !visibles.includes(g)) visibles.push(g);
  }
  return visibles;
}

// En la ficha del cliente se ve un bloque a la vez.
// Primero el trabajo. El equipo aparece cuando ya hay un trabajo.
// La mensualidad aparece cuando ya hay un equipo, o cuando el trabajo ya quedó listo.
// Un bloque que ya tiene datos sigue visible.
export function seccionesCliente({ trabajos = 0, equipos = 0, mensualidades = 0, trabajoListo = false }) {
  const tieneTrabajo = trabajos > 0;
  const tieneEquipo = equipos > 0;
  const tieneMensualidad = mensualidades > 0;
  return {
    trabajo: true,
    equipo: tieneTrabajo || tieneEquipo,
    mensualidad: tieneEquipo || tieneMensualidad || !!trabajoListo,
  };
}

// Lo que se cobra en el enlace: líneas del trabajo más los productos.
// El saldo es uno solo. El saldo de un producto no reemplaza al total.
export function cuentaVisita({ monto = 0, saldo = 0, equipos = [] }) {
  const lista = equipos || [];
  const total = (Number(monto) || 0) + lista.reduce((s, e) => s + (Number(e.monto_total) || 0), 0);
  const pendiente = (Number(saldo) || 0) + lista.reduce((s, e) => s + (Number(e.saldo) || 0), 0);
  return { total, pendiente };
}

export function informeDesdeSeleccion(ctx) {
  const nombre = String(ctx.nombre || "")
    .trim()
    .split(/\s+/)[0];
  const lineas = [`Hola${nombre ? ` ${nombre}` : ""}, te escribimos de ${ctx.negocio}.`];
  const vistas = new Set();
  const realizado = String(ctx.realizado || "").trim();
  if (realizado) {
    vistas.add(realizado);
    lineas.push(realizado);
  }
  for (const frase of ctx.frases || []) {
    const texto = String(frase || "").trim();
    if (!texto || vistas.has(texto)) continue;
    vistas.add(texto);
    lineas.push(texto);
  }
  const nota = String(ctx.nota || "").trim();
  if (nota && !vistas.has(nota)) lineas.push(nota);
  if (ctx.incluirDetalle) {
    const partes = (ctx.items || []).map((i) => {
      const cant = Number(i.cantidad) || 1;
      const desc = cant > 1 ? `${cant} × ${i.descripcion}` : i.descripcion;
      return `- ${desc}: ${clp(i.valor)}`;
    });
    const total = Number(ctx.total) || 0;
    if (partes.length) lineas.push(`Según el detalle:\n${partes.join("\n")}\nTotal: ${clp(total)}.`);
    else if (total > 0) lineas.push(`Total: ${clp(total)}.`);
  }
  if (ctx.linkUrl) lineas.push(`Mira el detalle aquí: ${ctx.linkUrl}`);
  return lineas.join("\n");
}
