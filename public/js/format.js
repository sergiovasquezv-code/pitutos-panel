export function clp(value) {
  const n = Math.round(Number(value) || 0);
  return "$" + n.toLocaleString("es-CL");
}

// Normaliza un teléfono chileno a formato internacional sin "+" ni espacios
// (lo que necesita el link de WhatsApp, ej: 56912345678). Acepta números ya
// escritos con +56, con o sin el 9, con espacios, guiones, etc. Devuelve ""
// si no hay nada que normalizar.
export function telefonoWhatsapp(numero) {
  let digitos = String(numero || "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("56")) return digitos;
  if (digitos.startsWith("9") && digitos.length === 9) return "56" + digitos;
  if (digitos.length === 8) return "569" + digitos;
  return "56" + digitos;
}

// Para el campo de teléfono con prefijo "+56 9" fijo en el formulario:
// saca solo los 8 dígitos que van después del +56 9, sin importar cómo
// haya quedado guardado el número antes (con o sin +, con espacios, etc).
export function soloDigitosTelefono(numero) {
  let digitos = String(numero || "").replace(/\D/g, "");
  if (digitos.startsWith("569")) digitos = digitos.slice(3);
  else if (digitos.startsWith("9") && digitos.length === 9) digitos = digitos.slice(1);
  return digitos.slice(0, 8);
}

// Formatea un RUT chileno mientras se escribe: puntos de miles en el
// cuerpo y guión antes del dígito verificador (que puede ser "K"). Ej:
// "123456785" -> "12.345.678-5". No valida el dígito verificador, solo
// da formato — así no bloquea al usuario si se equivoca de dígito, eso
// se puede corregir después.
export function formatearRut(valor) {
  const limpio = String(valor || "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase()
    .slice(0, 9);
  if (!limpio) return "";
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!cuerpo) return dv;
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoConPuntos}-${dv}`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
