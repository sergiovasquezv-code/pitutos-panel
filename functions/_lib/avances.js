// Borra todos los avances (notas, enlaces, fotos e hitos de estado) de un
// trabajo, incluyendo los archivos que haya en R2 — se usa al eliminar un
// trabajo, o en cascada al eliminar un cliente.
export async function borrarAvancesDeTrabajo(db, env, trabajoId) {
  const { results: avances } = await db
    .prepare("SELECT id, tipo, valor FROM avances WHERE trabajo_id = ?")
    .bind(trabajoId)
    .all();

  if (env.FOTOS) {
    for (const a of avances) {
      if (a.tipo === "foto" && a.valor) {
        try {
          await env.FOTOS.delete(a.valor);
        } catch {
          /* si falla el borrado del archivo, igual limpiamos el registro */
        }
      }
    }
  }

  await db.prepare("DELETE FROM avances WHERE trabajo_id = ?").bind(trabajoId).run();
}

// Borra todas las fotos del estado de un equipo, incluyendo los archivos
// que haya en R2 — se usa al eliminar un equipo, o en cascada al eliminar
// un cliente.
export async function borrarFotosDeEquipo(db, env, equipoId) {
  const { results: fotos } = await db
    .prepare("SELECT id, r2_key FROM fotos_equipo WHERE equipo_id = ?")
    .bind(equipoId)
    .all();

  if (env.FOTOS) {
    for (const f of fotos) {
      if (f.r2_key) {
        try {
          await env.FOTOS.delete(f.r2_key);
        } catch {
          /* si falla el borrado del archivo, igual limpiamos el registro */
        }
      }
    }
  }

  await db.prepare("DELETE FROM fotos_equipo WHERE equipo_id = ?").bind(equipoId).run();
}
