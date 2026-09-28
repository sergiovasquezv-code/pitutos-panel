const TIMEZONE = "America/Santiago";

// Formatea una fecha en la zona horaria del negocio como YYYY-MM-DD
// (el locale "en-CA" produce ese formato directamente).
export function todayStr(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

export function periodoActual(date = new Date()) {
  return todayStr(date).slice(0, 7); // YYYY-MM
}

export function nowIso() {
  return new Date().toISOString();
}

function daysInMonth(year, month) {
  // month: 1-12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Suma (o resta) meses a una fecha "YYYY-MM-DD", ajustando el día si el mes
// destino tiene menos días (ej: 31 de enero + 1 mes -> 28/29 de febrero).
export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = m - 1 + months;
  const year = y + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Diferencia en días (later - earlier), ambas fechas "YYYY-MM-DD".
export function diffDays(laterStr, earlierStr) {
  const toUTC = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(laterStr) - toUTC(earlierStr)) / 86400000);
}
