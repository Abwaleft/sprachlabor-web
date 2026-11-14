// Opciones ajustables desde ⚙ Opciones (kv["opciones"]). clave: [valor por defecto, mínimo, máximo].

import * as db from "../datos/db.js";

export const DEFS = {
  nuevas_por_dia: [10, 0, 50],
  restar_por_otra_vez: [1, 0, 5],
  lugar_reinsercion: [10, 2, 50],
  sesion_hoeren: [3, 0, 20],
  sesion_diktat: [2, 0, 20],
  sesion_zahlen: [5, 0, 30],
  sesion_vorlesen: [2, 0, 20],
  sesion_sprechen: [1, 0, 5],
  sesion_schreiben: [1, 0, 5],
  dias_lote: [3, 1, 7],
  recordar_copia_dias: [7, 0, 60],
};

export const defaults = () => Object.fromEntries(Object.entries(DEFS).map(([k, v]) => [k, v[0]]));

export async function get() {
  const out = defaults();
  const g = (await db.kvGet("opciones")) || {};
  for (const [k, v] of Object.entries(g)) if (k in DEFS && Number.isInteger(v)) out[k] = v;
  return out;
}

export async function guardar(nuevas) {
  const actual = await get();
  for (const [k, raw] of Object.entries(nuevas)) {
    if (!(k in DEFS)) continue;
    const [, lo, hi] = DEFS[k];
    const v = Number(raw);
    if (!Number.isInteger(v)) throw new Error(`${k}: tiene que ser un número entero`);
    if (v < lo || v > hi) throw new Error(`${k}: tiene que estar entre ${lo} y ${hi}`);
    actual[k] = v;
  }
  await db.kvSet("opciones", actual);
  return actual;
}

export const rangos = () => Object.fromEntries(Object.entries(DEFS).map(([k, [, lo, hi]]) => [k, [lo, hi]]));
