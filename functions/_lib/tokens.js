// Token largo y aleatorio para links públicos (imposible de adivinar).
export function randomToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

// Llave aleatoria y segura para nombrar un objeto en R2.
export function randomFileKey(trabajoId, originalName) {
  const ext = (originalName || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `trabajo-${trabajoId}/${crypto.randomUUID()}.${ext}`;
}

// Igual que randomFileKey, pero para fotos del estado de un equipo.
export function randomFileKeyEquipo(equipoId, originalName) {
  const ext = (originalName || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `equipo-${equipoId}/${crypto.randomUUID()}.${ext}`;
}
