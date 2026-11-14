// Hören, Diktat y Zahlen: siguiente ejercicio, respuesta, corrección y registro.

import * as db from "../datos/db.js";
import { compare } from "./diktat.js";
import { item, marcarHecho, registrar, siguienteItem } from "./intentos.js";
import * as zahlen from "./zahlen.js";

const erroresTxt = (res) => res.errores.map((e) => `${e.estado}: ${e.hyp || "∅"} → ${e.ref || "∅"}`);

// ---------- Hören ----------

export async function hoerenNext(excluir = []) {
  const it = await siguienteItem("hoeren", excluir);
  if (!it) return null;
  return { id: it.id, frage: it.frage_es, optionen: it.optionen_es, text_de: it.text_de, repetido: (it.times_done || 0) > 0, niveau: it.niveau || "" };
}

export async function hoerenAnswer(id, wahl, escuchas) {
  const it = await item("hoeren", id);
  const ok = wahl === it.richtig;
  await db.tx(["items", "intentos"], "readwrite", async (t) => {
    await marcarHecho(id, null, t);
    await registrar("hoeren", id, { text_de: it.text_de, frage: it.frage_es, elegida: it.optionen_es[wahl] ?? null,
      correcta: it.optionen_es[it.richtig], ok, escuchas, niveau: it.niveau, repetido: (it.times_done || 0) > 0 }, ok ? 1 : 0, { t });
  });
  return { ok, richtig: it.richtig, text_de: it.text_de, erklaerung: it.erklaerung_es || "" };
}

// ---------- Diktat ----------

export async function diktatNext(excluir = []) {
  const it = await siguienteItem("diktat", excluir);
  if (!it) return null;
  return { id: it.id, text_de: it.text_de, repetido: (it.times_done || 0) > 0, schwerpunkt: it.schwerpunkt || "" };
}

export async function diktatAnswer(id, eingabe, escuchas) {
  const it = await item("diktat", id);
  const res = compare(it.text_de, eingabe);
  await db.tx(["items", "intentos"], "readwrite", async (t) => {
    await marcarHecho(id, null, t);
    await registrar("diktat", id, { referenz: it.text_de, eingabe, escuchas, schwerpunkt: it.schwerpunkt, errores: erroresTxt(res) }, res.score, { t });
  });
  return { ...res, referenz: it.text_de };
}

// ---------- Zahlen ----------

export function zahlenNext(art = "mix") {
  const a = zahlen.generate(art);
  return { id: `z-${Date.now()}`, ...a };
}

export async function zahlenAnswer(a, eingabe, escuchas) {
  const ok = zahlen.check(a, eingabe);
  await registrar("zahlen", a.art, { art: a.art, text_de: a.text_de, solucion: a.loesung, eingabe, ok, escuchas }, ok ? 1 : 0);
  return { ok, solucion: a.loesung, text_de: a.text_de };
}

export { erroresTxt };
