// Sirve las fotos subidas a R2 en /api/public/fotos/<key con / adentro>,
// por eso el nombre de archivo usa [[key]] (ruta "catch-all").
export async function onRequestGet({ env, params }) {
  const key = Array.isArray(params.key) ? params.key.join("/") : params.key;
  if (!key || !env.FOTOS) {
    return new Response("No encontrado", { status: 404 });
  }

  const object = await env.FOTOS.get(key);
  if (!object) {
    return new Response("No encontrado", { status: 404 });
  }

  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
