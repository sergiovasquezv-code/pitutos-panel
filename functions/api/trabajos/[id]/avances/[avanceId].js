import { json } from "../../../../_lib/json.js";
import { nowIso } from "../../../../_lib/dates.js";

export async function onRequestPut({ request, env, params }) {
  const db = env.DB;
  const avanceId = Number(params.avanceId);
  const trabajoId = Number(params.id);
  const avance = await db
    .prepare("SELECT * FROM avances WHERE id = ? AND trabajo_id = ?")
    .bind(avanceId, trabajoId)
    .first();
  if (!avance) return json({ error: "Avance no encontrado." }, 404);

  const body = await request.json().catch(() => ({}));

  // Cambiar solo si el cliente lo puede ver, sin tocar el contenido — para
  // marcar "esto ya está listo, muéstraselo" cuando decides que un avance
  // que armaste ya se puede publicar (o para volver a ocultarlo).
  if (typeof body.visible_cliente === "boolean" && body.texto === undefined && body.valor === undefined) {
    if (avance.tipo === "estado") {
      return json({ error: "Los hitos de estado siempre son visibles para el cliente." }, 400);
    }
    const visibleCliente = body.visible_cliente ? 1 : 0;
    // visible_desde guarda la primera/última vez que se hizo visible, como
    // trazabilidad — no se borra si después se vuelve a ocultar.
    const visibleDesde = body.visible_cliente ? nowIso() : avance.visible_desde;
    await db
      .prepare("UPDATE avances SET visible_cliente = ?, visible_desde = ? WHERE id = ?")
      .bind(visibleCliente, visibleDesde, avanceId)
      .run();
    return json({ ok: true, visible_cliente: !!visibleCliente, visible_desde: visibleDesde });
  }

  if (avance.tipo === "estado") {
    return json({ error: "Los hitos de estado se generan automáticamente y no se pueden editar." }, 400);
  }

  const texto = (body.texto || "").trim();

  if (avance.tipo === "nota") {
    if (!texto) return json({ error: "Escribe una nota." }, 400);
    await db
      .prepare("UPDATE avances SET texto = ?, editado_en = ? WHERE id = ?")
      .bind(texto, nowIso(), avanceId)
      .run();
  } else if (avance.tipo === "url") {
    const valor = (body.valor || "").trim();
    if (!valor) return json({ error: "Ingresa un enlace." }, 400);
    if (!/^https?:\/\//i.test(valor)) {
      return json({ error: "El enlace debe empezar con http:// o https://" }, 400);
    }
    await db
      .prepare("UPDATE avances SET texto = ?, valor = ?, editado_en = ? WHERE id = ?")
      .bind(texto, valor, nowIso(), avanceId)
      .run();
  } else if (avance.tipo === "foto") {
    // Para fotos solo se puede editar la descripción, no el archivo.
    await db
      .prepare("UPDATE avances SET texto = ?, editado_en = ? WHERE id = ?")
      .bind(texto, nowIso(), avanceId)
      .run();
  } else {
    return json({ error: "Tipo de avance desconocido." }, 400);
  }

  return json({ ok: true });
}

export async function onRequestDelete({ env, params }) {
  const db = env.DB;
  const avanceId = Number(params.avanceId);
  const trabajoId = Number(params.id);
  const avance = await db
    .prepare("SELECT * FROM avances WHERE id = ? AND trabajo_id = ?")
    .bind(avanceId, trabajoId)
    .first();
  if (!avance) return json({ error: "Avance no encontrado." }, 404);
  if (avance.tipo === "estado") {
    return json({ error: "Los hitos de estado se generan automáticamente y no se pueden eliminar." }, 400);
  }

  if (avance.tipo === "foto" && avance.valor && env.FOTOS) {
    try {
      await env.FOTOS.delete(avance.valor);
    } catch {
      /* si falla el borrado del archivo, igual limpiamos el registro */
    }
  }

  await db.prepare("DELETE FROM avances WHERE id = ?").bind(avanceId).run();
  return json({ ok: true });
}
