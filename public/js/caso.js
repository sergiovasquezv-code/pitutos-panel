import { clp } from "./format.js";

export const FLUJO_CASO = ["Cotización", "En curso", "Listo", "Entregado"];

const A_COTIZACION = ["Cotización", "Pendiente", "Demostración"];
const A_LISTO = ["Listo", "Equipo listo", "Entrega fijada"];

export function pasoDe(estado) {
  if (A_COTIZACION.includes(estado)) return "Cotización";
  if (A_LISTO.includes(estado)) return "Listo";
  if (estado === "Entregado") return "Entregado";
  return "En curso";
}

// Un solo mensaje por caso: saludo, una frase del paso, el dinero y el link.
// En cotización se informa el valor cotizado, sin abono ni saldo.
export function mensajeCaso(ctx) {
  const nombre = String(ctx.nombre || "")
    .trim()
    .split(/\s+/)[0];
  const tipo = String(ctx.tipo || "trabajo").toLowerCase();
  const paso = ctx.paso;
  const total = Number(ctx.total) || 0;
  const abonado = Number(ctx.abonado) || 0;
  const saldo = Number(ctx.saldo) || 0;
  const lineas = [`Hola${nombre ? ` ${nombre}` : ""}, te escribimos de ${ctx.negocio}.`];

  if (paso === "Cotización") {
    const detalle = String(ctx.descripcion || "").trim();
    lineas.push(`Te dejamos la cotización de tu ${tipo}${detalle ? `: ${detalle}` : ""}.`);
    if (total > 0) lineas.push(`Cotización: ${clp(total)}.`);
  } else if (paso === "En curso") {
    lineas.push(`Tu ${tipo} está en curso.`);
  } else if (paso === "Listo") {
    lineas.push(`Tu ${tipo} ya está listo.`);
    if (ctx.fechaEntrega) lineas.push(`Entrega: ${ctx.fechaEntrega}.`);
  } else if (paso === "Entregado") {
    lineas.push(`Ya entregamos tu ${tipo}.`);
  } else {
    lineas.push(`Te escribimos por tu ${tipo}.`);
  }

  if (paso !== "Cotización" && total > 0) {
    if (ctx.pagado) lineas.push(`Total ${clp(total)}. Tu pago está completo.`);
    else if (abonado > 0) lineas.push(`Total ${clp(total)}. Abonado ${clp(abonado)}. Saldo ${clp(saldo)}.`);
    else lineas.push(`Total ${clp(total)}. Saldo ${clp(saldo)}.`);
  }

  const nota = String(ctx.nota || "").trim();
  if (nota) lineas.push(nota);
  if (ctx.linkUrl) lineas.push(`Mira el detalle aquí: ${ctx.linkUrl}`);
  return lineas.join("\n");
}
