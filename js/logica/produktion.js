// Vorlesen, Sprechen frei y Schreiben: elección de frases y consignas, y registro de lo producido.

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";
import { compare, contarPalabras } from "./diktat.js";
import { item, itemsDeTipo, marcarHecho, registrar } from "./intentos.js";
import * as niveles from "./niveles.js";
import { erroresTxt } from "./uebungen.js";

export const MAX_PISTAS = 3;
export const MAX_PALABRAS_PISTA = 4;

/** Schreiben: como mucho 3 pistas cortas (1–4 palabras), nunca frases armadas que resuelvan el texto. */
export function pistas(ayuda) {
  return (ayuda || []).filter((a) => (String(a).match(/[\p{L}\p{N}]+/gu) || []).length <= MAX_PALABRAS_PISTA).slice(0, MAX_PISTAS);
}

// ---------- consignas ----------

export async function siguienteConsigna(typ, excluir = []) {
  const ex = new Set(excluir.map(Number));
  const rows = (await itemsDeTipo(typ)).filter((it) => !ex.has(it.id));
  const target = (await niveles.objetivo())[typ];
  const it = niveles.elegir(rows, typ, target);
  if (!it) return null;
  const { times_done, last_done, created, envio_id, type, ...p } = it;
  if (typ === "schreiben") p.ayuda = pistas(p.ayuda);
  return { ...p, repetido: (times_done || 0) > 0, nivel: niveles.etiqueta(niveles.nivelItem(typ, it)), nivel_objetivo: niveles.etiqueta(target) };
}

// ---------- Schreiben ----------

export async function schreibenGuardar(itemId, texto) {
  texto = String(texto || "").trim();
  if (!texto) throw new Error("texto vacío");
  const it = await item("schreiben", itemId);
  let intento;
  await db.tx(["items", "intentos"], "readwrite", async (t) => {
    intento = await registrar("schreiben", itemId, {
      item_id: itemId, titulo: it.titulo, tipo: it.tipo, nivel: niveles.etiqueta(niveles.nivelItem("schreiben", it)),
      consigna_de: it.consigna_de, consigna_es: it.consigna_es, puntos: it.puntos || [], palabras_min: it.palabras_min,
      palabras_max: it.palabras_max, texto, palabras: contarPalabras(texto),
    }, null, { t });
    await marcarHecho(itemId, null, t);
  });
  return intento;
}

// ---------- Sprechen frei ----------

/** Registra un monólogo. `transcripcion` = {texto, whisper, literal} (provisorio o literal) o null si todavía no hay. */
export async function sprechenGuardar(itemId, segundos, transcripcion) {
  const it = await item("sprechen", itemId);
  const texto = transcripcion ? transcripcion.texto || "" : "";
  let intento;
  await db.tx(["items", "intentos"], "readwrite", async (t) => {
    intento = await registrar("sprechen_frei", itemId, {
      item_id: itemId, titulo: it.titulo, tipo: "Monolog", nivel: niveles.etiqueta(niveles.nivelItem("sprechen", it)),
      consigna_de: it.consigna_de, consigna_es: it.consigna_es, puntos: it.puntos || [], duracion_objetivo: it.duracion_s,
      transkript: texto, transkript_whisper: transcripcion ? transcripcion.whisper || texto : "", literal: !!(transcripcion && transcripcion.literal),
      transcripcion_estado: transcripcion ? (transcripcion.literal ? "literal" : "provisoria") : "pendiente",
      segundos: Math.round(segundos * 10) / 10, palabras: contarPalabras(texto),
    }, null, { t });
    await marcarHecho(itemId, null, t);
  });
  return intento;
}

/** Llega la transcripción literal del taller de la PC: reemplaza la provisoria. */
export async function sprechenActualizarTranscripcion(attemptId, tr) {
  const a = await db.get("intentos", attemptId);
  if (!a) return null;
  a.payload.transkript = tr.text || tr.texto || "";
  a.payload.transkript_whisper = tr.whisper || a.payload.transkript_whisper || "";
  a.payload.literal = !!tr.literal;
  a.payload.transcripcion_estado = tr.literal ? "literal" : "whisper_pc";
  a.payload.palabras = contarPalabras(a.payload.transkript);
  if (tr.dauer) a.payload.segundos = Math.max(a.payload.segundos || 0, Math.round(tr.dauer * 10) / 10);
  await db.put("intentos", a);
  return a;
}

// ---------- Vorlesen ----------

export async function vorlesenNext() {
  const propias = (await itemsDeTipo("vorlesen")).filter((it) => !(it.times_done || 0)).sort((a, b) => a.id - b.id);
  if (propias.length) {
    const it = propias[0];
    return { text: it.text_de, item_id: it.id, schwerpunkt: it.schwerpunkt || "" };
  }
  // sin frases propias: frases ya vistas (dictados, frases de lectura y ejemplos de Vokabeln), sin números
  const pool = [...(await itemsDeTipo("diktat")), ...(await itemsDeTipo("vorlesen"))].map((it) => it.text_de);
  for (const w of await db.all("palabras")) if (w.introduced) pool.push(w.beispiel_de);
  const limpio = pool.filter((t) => t && !/\d/.test(t));
  if (!limpio.length) return null;
  return { text: limpio[Math.floor(Math.random() * limpio.length)], item_id: null, schwerpunkt: "" };
}

/** Compara lo reconocido con la frase y registra el intento. */
export async function vorlesenEvaluar(info, transkript, segundos, { literal = false, whisper = "" } = {}) {
  const res = compare(info.text, transkript || "");
  for (const p of res.palabras) if (p.estado === "mayuscula") p.estado = "ok";  // al hablar no hay mayúsculas
  res.errores = res.palabras.filter((p) => p.estado !== "ok");
  await db.tx(["items", "intentos"], "readwrite", async (t) => {
    if (info.item_id) await marcarHecho(info.item_id, null, t);
    await registrar("vorlesen", info.item_id || "", { text_de: info.text, transkript, transkript_whisper: whisper || transkript, literal,
      segundos: Math.round(segundos * 10) / 10, schwerpunkt: info.schwerpunkt, errores: erroresTxt(res) }, res.score, { t });
  });
  return { ...res, transkript, literal, referenz: info.text };
}

export { ahora };
