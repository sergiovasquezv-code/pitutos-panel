// Emulación mínima en memoria del binding R2Bucket de Cloudflare,
// suficiente para probar fotos.js, avances/[avanceId].js y public/fotos/[[key]].js
// sin necesitar Wrangler/Miniflare real.
export function createR2() {
  const store = new Map(); // key -> { bytes: ArrayBuffer, contentType: string }

  return {
    async put(key, value, options = {}) {
      const bytes = value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer();
      const contentType = options?.httpMetadata?.contentType || "application/octet-stream";
      store.set(key, { bytes, contentType });
      return { key };
    },

    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: entry.bytes,
        httpEtag: `"${key}"`,
        writeHttpMetadata(headers) {
          headers.set("Content-Type", entry.contentType);
        },
      };
    },

    async delete(key) {
      store.delete(key);
    },

    // Helper solo para las pruebas (no existe en el R2Bucket real).
    _has(key) {
      return store.has(key);
    },
    _size() {
      return store.size;
    },
  };
}
