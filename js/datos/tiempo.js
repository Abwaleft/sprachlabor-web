// Fechas y horas en formato local ISO sin zona ("2026-11-14T09:30:00"), como las guarda la app.

const pad = (n) => String(n).padStart(2, "0");

export const isoLocal = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export const ahora = () => isoLocal(new Date());
export const hoy = (d = new Date()) => isoLocal(d).slice(0, 10);

/** Fecha (YYYY-MM-DD) a Date local a las 0:00. */
export function fecha(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(iso, n) {
  const d = fecha(iso);
  d.setDate(d.getDate() + n);
  return hoy(d);
}

/** Días transcurridos entre dos fechas YYYY-MM-DD (b − a). */
export const diasEntre = (a, b) => Math.round((fecha(b) - fecha(a)) / 86400000);

/** Número de día (como date.toordinal() en Python) para el criterio "día de escribir / de hablar". */
export function ordinal(iso) {
  const d = fecha(iso);
  return Math.round((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000) + 719163;
}

export const lunes = (iso) => { const d = fecha(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return hoy(d); };

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
