// Reproductor único de la app. Reproduce audios de Piper (WAV de la caché local) o la voz del sistema como respaldo.
// «Lento» = mismo audio a 0,75× (sin cambiar el tono). Con ?mute=1 (o localStorage "sprachlabor-mute" = "1") no
// suena nada, pero play() resuelve true igual: los ejercicios cuentan la escucha como si hubiera sonado (pruebas).

import { $$ } from "./dom.js";
import * as tts from "./voz/tts.js";

function detectMute() {
  try {
    return new URLSearchParams(location.search).has("mute") || localStorage.getItem("sprachlabor-mute") === "1";
  } catch { return false; }
}

export const MUTED = detectMute();
export const player = new Audio();
player.muted = MUTED;
let urlActual = null;
let generando = null;

export const estado = { generando: false, texto: "" };
const oyentes = new Set();
export function onCambio(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
const avisar = () => { for (const fn of oyentes) { try { fn({ ...estado }); } catch { /* */ } } };

function reproducirBlob(blob, lento) {
  player.pause();
  if (urlActual) URL.revokeObjectURL(urlActual);
  urlActual = URL.createObjectURL(blob);
  player.src = urlActual;
  player.playbackRate = lento ? 0.75 : 1;
  try { player.preservesPitch = true; } catch { /* */ }
  if (MUTED) return Promise.resolve(true);
  return player.play().then(() => true).catch(() => false);
}

/**
 * Reproduce `texto` con Piper (de la caché o generándolo en el momento) o, si Piper no está, con la voz del sistema.
 * Devuelve true si empezó a sonar (o si está silenciado), false si no se pudo.
 */
export async function play(texto, { lento = false, onEstado = null } = {}) {
  texto = String(texto || "").trim();
  if (!texto) return false;
  if (MUTED) return true;
  const voz = await tts.vozLista();
  if (!voz) {
    tts.pararSistema();
    return tts.hablarSistema(texto, { lento });
  }
  try {
    estado.generando = !(await tts.enCache(texto));
    estado.texto = texto;
    avisar();
    if (onEstado) onEstado(estado.generando ? "generando" : "listo");
    generando = tts.obtener(texto);
    const blob = await generando;
    generando = null;
    estado.generando = false;
    avisar();
    if (estado.texto !== texto) return false;  // se pidió otro mientras tanto
    return reproducirBlob(blob, lento);
  } catch (e) {
    estado.generando = false;
    avisar();
    console.warn("audio:", e);
    return tts.hablarSistema(texto, { lento });
  }
}

/** Reproduce un Blob (la grabación propia). */
export function playBlob(blob) {
  return reproducirBlob(blob, false);
}

export function stopAudio() {
  player.pause();
  estado.texto = "";
  tts.pararSistema();
}

/** Botones ▶ / 🐢 de un texto. */
export const playButtons = (texto, { cls = "" } = {}) => `<div class="plays ${cls}">
  <button class="btn sm" data-tts="${esc(texto)}" data-lento="0">▶ Normal</button>
  <button class="btn sm" data-tts="${esc(texto)}" data-lento="1">🐢 Lento</button></div>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Conecta los botones [data-tts] (texto) y [data-blob] (grabación guardada en `blobs`) de un contenedor. */
export function bindPlay(root = document, blobs = {}) {
  $$("[data-tts]", root).forEach((b) => (b.onclick = async () => {
    const txt = b.textContent;
    b.textContent = "…";
    b.disabled = true;
    try { await play(b.dataset.tts, { lento: b.dataset.lento === "1" }); } finally { b.textContent = txt; b.disabled = false; }
  }));
  $$("[data-blob]", root).forEach((b) => (b.onclick = () => { const bl = blobs[b.dataset.blob]; if (bl) playBlob(bl); }));
}
