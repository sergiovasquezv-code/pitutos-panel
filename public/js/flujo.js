import { clp } from "./format.js";

// Un paso se abre cuando el anterior ya tiene una elección, o cuando el
// trabajo ya trae líneas cargadas (casos anteriores a este flujo).
export function pasosAbiertos({ tipoMarcado, hechoMarcado, tieneLineas, cierreEstadoMarcado }) {
  const hecho = !!(tipoMarcado || tieneLineas);
  const cierre = !!(hecho && (hechoMarcado || tieneLineas));
  const informe = !!(cierre && cierreEstadoMarcado);
  return { tipo: true, hecho, cierre, informe };
}

export function informeDesdeSeleccion(ctx) {
  const nombre = String(ctx.nombre || "")
    .trim()
    .split(/\s+/)[0];
  const lineas = [`Hola${nombre ? ` ${nombre}` : ""}, te escribimos de ${ctx.negocio}.`];
  const vistas = new Set();
  for (const frase of ctx.frases || []) {
    const texto = String(frase || "").trim();
    if (!texto || vistas.has(texto)) continue;
    vistas.add(texto);
    lineas.push(texto);
  }
  const nota = String(ctx.nota || "").trim();
  if (nota) lineas.push(nota);
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
