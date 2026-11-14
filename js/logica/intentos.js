// Registro de intentos e ítems del lote: lo que comparten todos los ejercicios.

import * as db from "../datos/db.js";
import { ahora, hoy, uuid } from "../datos/tiempo.js";

export class NoExiste extends Error {
  constructor(msg) { super(msg || "eso ya no está"); this.name = "NoExiste"; }
}

/** Registra un intento. Devuelve el objeto guardado (con id). */
export async function registrar(type, ref, payload, score, { ts = null, t = null } = {}) {
  const fila = { ts: ts || ahora(), type, ref: ref == null ? null : String(ref), payload, score: score == null ? null : score, enviado: 0, client_id: uuid() };
  const guardar = async (h) => { fila.id = await h.add("intentos", fila); return fila; };
  return t ? guardar(t) : db.tx("intentos", "readwrite", guardar);
}

export async function actualizar(intento, t = null) {
  return t ? t.put("intentos", intento) : db.put("intentos", intento);
}

export const porId = (id) => db.get("intentos", id);

export async function marcarHecho(itemId, ts = null, t = null) {
  const f = async (h) => {
    const it = await h.get("items", itemId);
    if (!it) return;
    it.times_done = (it.times_done || 0) + 1;
    it.last_done = ts || ahora();
    await h.put("items", it);
  };
  return t ? f(t) : db.tx("items", "readwrite", f);
}

export const itemsDeTipo = (type) => db.porIndice("items", "type", type);

export async function item(type, id) {
  const it = await db.get("items", id);
  if (!it || it.type !== type) throw new NoExiste("ítem inexistente");
  return it;
}

/** El ítem menos hecho (y hecho hace más tiempo) de un tipo, salvo los excluidos. */
export async function siguienteItem(type, excluir = []) {
  const ex = new Set(excluir.map(Number));
  const rows = (await itemsDeTipo(type)).filter((it) => !ex.has(it.id));
  rows.sort((a, b) => (a.times_done || 0) - (b.times_done || 0) || (a.last_done ? 1 : 0) - (b.last_done ? 1 : 0)
    || (a.last_done || "").localeCompare(b.last_done || "") || a.id - b.id);
  return rows[0] || null;
}

/** Intentos de hoy, agrupados por tipo (sprechen_frei cuenta como sprechen). */
export async function hechosHoy(dia = hoy()) {
  const out = {};
  const rows = await db.porIndice("intentos", "ts", IDBKeyRange.lowerBound(dia));
  for (const r of rows) {
    const k = r.type === "sprechen_frei" ? "sprechen" : r.type;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export const intentosDesde = (desde) => db.porIndice("intentos", "ts", IDBKeyRange.lowerBound(desde));
export const todosLosIntentos = () => db.all("intentos");
export const sinEnviar = () => db.porIndice("intentos", "enviado", 0);

/** Días distintos con práctica (YYYY-MM-DD), ordenados. */
export async function diasConPractica() {
  const dias = new Set();
  await db.tx("intentos", "readonly", (t) => t.each("intentos", (r) => { dias.add(r.ts.slice(0, 10)); }));
  return [...dias].sort();
}

export async function racha(dia = hoy()) {
  const dias = new Set(await diasConPractica());
  const d = new Date(dia + "T12:00:00");
  if (!dias.has(dia)) d.setDate(d.getDate() - 1);
  let n = 0;
  for (;;) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dias.has(iso)) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
