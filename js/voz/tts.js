// Voz: Piper en el navegador (voz alemana thorsten-medium, 63 MB una sola vez, guardada en OPFS) con caché de WAV en
// IndexedDB (almacén `audio`), y la voz alemana del sistema (Web Speech API) como respaldo instantáneo.
//
// Medido en el celular de Victor (Android 10, 8 núcleos): primera frase ~6,5 s (calentamiento), después 1,6–2,8 s por
// frase. Por eso los audios del lote se generan en segundo plano (cola de baja prioridad) y no al mostrar el ejercicio.
// piper-tts-web no expone la velocidad: la versión «lenta» es el mismo WAV con playbackRate 0,75 (sin cambiar el tono).
// Cada WAV lleva 1 s de silencio al principio y al final (pedido de Victor: que no suene cortado).

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";
import { leerWav, rellenarSilencio, wavDesdeFloat32 } from "./pcm.js";

export const VOZ = "de_DE-thorsten-medium";
export const VOZ_MB = 63;
const LIB = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.3/+esm";
const SILENCIO_S = 1;

let lib = null;
let listaPromesa = null;
let sintetizando = null;  // Piper no es reentrante: una síntesis a la vez
const cola = [];           // textos pendientes de pregenerar
let colaCorriendo = false;
const oyentes = new Set();
export const estado = { voz_bajada: null, bajando: false, progreso: 0, error: null, cola: 0, generados: 0, ultimo_ms: null };

export function onCambio(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function avisar() { estado.cola = cola.length; for (const fn of oyentes) { try { fn({ ...estado }); } catch { /* */ } } }

export async function hash(texto) {
  const data = new TextEncoder().encode(`${VOZ}|${SILENCIO_S}|${texto.trim()}`);
  const h = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

async function piper() {
  if (!lib) lib = await import(LIB);
  return lib;
}

/** ¿Está la voz guardada en el celular? Mira OPFS directo (carpeta «piper» de la librería), sin cargar la librería. */
export async function vozLista() {
  if (estado.voz_bajada !== null) return estado.voz_bajada;
  let lista = false;
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle("piper");
      for await (const [nombre, h] of dir.entries()) {
        if (h.kind === "file" && nombre.startsWith(VOZ) && nombre.endsWith(".onnx") && (await h.getFile()).size > 1e6) lista = true;
      }
    }
  } catch { lista = false; }
  estado.voz_bajada = lista;
  avisar();
  return lista;
}

/** Baja la voz (63 MB, una vez). onProgress(mb, totalMb). */
export async function bajarVoz(onProgress) {
  const p = await piper();
  estado.bajando = true;
  estado.error = null;
  avisar();
  try {
    await p.download(VOZ, (pr) => {
      estado.progreso = pr.total ? pr.loaded / pr.total : 0;
      if (onProgress) onProgress(Math.round((pr.loaded || 0) / 1e6), Math.round((pr.total || 0) / 1e6));
      avisar();
    });
    estado.voz_bajada = true;
  } catch (e) {
    estado.error = String(e && e.message || e);
    throw e;
  } finally {
    estado.bajando = false;
    avisar();
  }
}

/** Borra la voz guardada (si quedó corrupta: «No graph was found in the protobuf»). */
export async function borrarVoz() {
  const p = await piper();
  await p.flush();
  estado.voz_bajada = false;
  avisar();
}

async function sintetizar(texto) {
  const p = await piper();
  let intento = 0;
  for (;;) {
    try {
      const t0 = performance.now();
      const wav = await p.predict({ text: texto, voiceId: VOZ });
      estado.ultimo_ms = Math.round(performance.now() - t0);
      const { sampleRate, samples } = leerWav(await wav.arrayBuffer());
      return wavDesdeFloat32(rellenarSilencio(samples, sampleRate, SILENCIO_S), sampleRate);
    } catch (e) {
      // voz guardada corrupta (visto en el celular): borrar y volver a bajar una vez
      if (intento === 0 && /protobuf|graph|onnx|session/i.test(String(e && e.message || e))) {
        intento++;
        await borrarVoz();
        await bajarVoz();
        continue;
      }
      throw e;
    }
  }
}

/** WAV (Blob) del texto: de la caché, o lo genera (y guarda). Puede tardar unos segundos en el celular. */
export async function obtener(texto) {
  texto = String(texto || "").trim();
  if (!texto) throw new Error("texto vacío");
  const h = await hash(texto);
  const c = await db.get("audio", h);
  if (c && c.blob) return c.blob;
  // una síntesis a la vez
  while (sintetizando) await sintetizando.catch(() => {});
  const c2 = await db.get("audio", h);
  if (c2 && c2.blob) return c2.blob;
  sintetizando = (async () => {
    const blob = await sintetizar(texto);
    await db.put("audio", { hash: h, text: texto, blob, created: ahora(), bytes: blob.size });
    estado.generados++;
    avisar();
    return blob;
  })();
  try { return await sintetizando; } finally { sintetizando = null; }
}

export async function enCache(texto) {
  const c = await db.get("audio", await hash(texto));
  return !!(c && c.blob);
}

/** Encola textos para generar en segundo plano (de a uno, cuando la app está libre). */
export function pregenerar(textos) {
  for (const t of textos) if (t && !cola.includes(t)) cola.push(String(t).trim());
  avisar();
  if (!colaCorriendo) correrCola();
}

async function correrCola() {
  colaCorriendo = true;
  try {
    while (cola.length) {
      if (!(await vozLista())) break;  // sin voz, no se puede: la cola queda para cuando la bajen
      const t = cola[0];
      try {
        if (!(await enCache(t))) await obtener(t);
      } catch (e) { console.warn("pregenerar:", e); if (!estado.voz_bajada) break; }
      cola.shift();
      avisar();
      await new Promise((r) => setTimeout(r, 150));  // respiro para la interfaz
    }
  } finally { colaCorriendo = false; avisar(); }
}

export const pendientes = () => cola.length;

/** Cuántos de estos textos ya tienen audio. */
export async function cuantosListos(textos) {
  let n = 0;
  for (const t of textos) if (await enCache(t)) n++;
  return n;
}

// ---------- voz del sistema (Web Speech API) ----------

export function vocesSistema() {
  if (!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("de"));
}

export function hablarSistema(texto, { lento = false } = {}) {
  const de = vocesSistema();
  if (!de.length) return false;
  const u = new SpeechSynthesisUtterance(texto);
  u.voice = de.find((v) => v.localService) || de[0];
  u.lang = u.voice.lang;
  u.rate = lento ? 0.7 : 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

export const pararSistema = () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); };

/** Tamaño total de la caché de audio. */
export async function tamanoCache() {
  let bytes = 0;
  let n = 0;
  await db.tx("audio", "readonly", (t) => t.each("audio", (r) => { bytes += r.bytes || (r.blob ? r.blob.size : 0); n++; }));
  return { bytes, n };
}

export const vaciarCache = () => db.tx("audio", "readwrite", (t) => t.clear("audio"));

/**
 * Encola los audios que faltan para lo próximo que se va a practicar (ejercicios sin hacer y palabras por ver/vencidas).
 * Lo llama la app al arrancar y después de un envío o un import; es barato si ya están todos.
 */
export async function pregenerarFaltantes(limite = 80) {
  if (!(await vozLista())) return 0;
  const textos = [];
  const items = await db.all("items");
  for (const it of items.filter((i) => ["hoeren", "diktat", "vorlesen"].includes(i.type)).sort((a, b) => (a.times_done || 0) - (b.times_done || 0) || a.id - b.id)) textos.push(it.text_de);
  const palabras = await db.all("palabras");
  const t = ahora();
  const prox = palabras.filter((w) => !w.introduced || (w.due && w.due <= t)).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  for (const w of prox) textos.push(`${w.artikel || ""} ${w.wort}`.trim(), w.beispiel_de);
  const faltan = [];
  for (const x of textos) {
    if (faltan.length >= limite) break;
    if (x && !(await enCache(x))) faltan.push(x);
  }
  if (faltan.length) pregenerar(faltan);
  return faltan.length;
}
