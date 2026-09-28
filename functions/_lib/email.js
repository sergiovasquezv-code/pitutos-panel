// Envía un correo de aviso cuando el cliente marca un avance (nota, enlace
// o foto) como revisado, usando la API de Resend (resend.com, tiene plan
// gratis). Si no está configurado (falta RESEND_API_KEY o
// EMAIL_NOTIFICACIONES en las variables/secrets del proyecto), no hace
// nada — el "marcar como revisado" del cliente sigue funcionando igual, el
// correo es un aviso opcional encima de eso.
const ETIQUETAS_TIPO = { nota: "una nota", url: "un enlace", foto: "una foto" };

export async function enviarAvisoRevisado(env, { clienteNombre, trabajoTipo, avance }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_NOTIFICACIONES) return;

  const tipoLabel = ETIQUETAS_TIPO[avance.tipo] || "un avance";
  const detalle = avance.texto || avance.valor || "";
  const asunto = `${clienteNombre} revisó ${tipoLabel} de "${trabajoTipo}"`;
  const cuerpo = [
    `${clienteNombre} acaba de marcar como revisado ${tipoLabel} del trabajo "${trabajoTipo}".`,
    detalle ? `Detalle: ${detalle}` : "",
    "Entra a tu panel de Pitutos para ver el trabajo completo.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_REMITENTE || "Pitutos Panel <onboarding@resend.dev>",
        to: [env.EMAIL_NOTIFICACIONES],
        subject: asunto,
        text: cuerpo,
      }),
    });
  } catch {
    // Si falla el envío (sin internet, API caída, clave mala, etc.) no
    // interrumpimos nada del flujo del cliente — el "revisado" ya quedó
    // guardado en la base de datos de todas formas.
  }
}
