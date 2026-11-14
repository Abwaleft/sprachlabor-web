// Grabación de voz. Captura PCM crudo a 16 kHz (ScriptProcessor) para el reconocedor del celular —Chrome Android
// no decodifica sus propios webm— y, en paralelo, MediaRecorder (webm/ogg opus, chico) para mandar al taller de la PC.
// Devuelve {pcm: Float32Array 16 kHz, wav: Blob, comprimido: Blob|null, segundos}.

import { $, esc, fmtSec } from "./dom.js";
import { concatenar, pico, remuestrear, wavDesdeFloat32 } from "./voz/pcm.js";

export const SR = 16000;
let activeRecorder = null;

export function cancelActiveRecorder() {
  if (activeRecorder) { activeRecorder.cancel(); activeRecorder = null; }
}

export function micError(e) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "Este navegador no deja usar el micrófono acá (hace falta https).";
  if (e && e.name === "NotAllowedError") return "No hay permiso para el micrófono. Permitilo en el candado de la barra de direcciones (o en Ajustes del sitio).";
  if (e && e.name === "NotFoundError") return "No encuentro ningún micrófono.";
  return `No pude usar el micrófono: ${e && e.message ? e.message : e}`;
}

export async function openRecorder(onTick) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("sin soporte");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  let ctx;
  try { ctx = new AudioContext({ sampleRate: SR }); } catch { ctx = new AudioContext(); }
  const srReal = ctx.sampleRate;
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const trozos = [];
  let nivel = 0;
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    trozos.push(new Float32Array(d));
    nivel = pico(d);
  };
  src.connect(proc);
  proc.connect(ctx.destination);  // sin destino, algunos navegadores no procesan
  // comprimido en paralelo (para el taller): si no hay MediaRecorder, va el WAV
  let rec = null;
  const chunks = [];
  if (window.MediaRecorder) {
    const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    try {
      rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    } catch { rec = null; }
  }
  let t0 = 0;
  let raf = 0;
  const loop = () => { onTick((performance.now() - t0) / 1000, nivel); raf = requestAnimationFrame(loop); };
  const close = () => {
    cancelAnimationFrame(raf);
    try { proc.disconnect(); src.disconnect(); } catch { /* */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  const r = {
    start() { t0 = performance.now(); if (rec) { try { rec.start(500); } catch { rec = null; } } loop(); },
    elapsed: () => (performance.now() - t0) / 1000,
    async stop() {
      const segundos = r.elapsed();
      let comprimido = null;
      if (rec && rec.state !== "inactive") {
        comprimido = await new Promise((res) => {
          rec.onstop = () => res(chunks.length ? new Blob(chunks, { type: (rec.mimeType || "audio/webm").split(";")[0] }) : null);
          try { rec.stop(); } catch { res(null); }
        });
      }
      close();
      let pcm = concatenar(trozos);
      if (srReal !== SR) pcm = remuestrear(pcm, srReal, SR);
      return { pcm, wav: wavDesdeFloat32(pcm, SR), comprimido, segundos: Math.round(segundos * 10) / 10, pico: pico(pcm) };
    },
    cancel() { if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* */ } } close(); },
  };
  activeRecorder = r;
  return r;
}

/** Botón de grabar con tiempo y nivel. onDone(grabacion) */
export function recordWidget(el, { maxSec = 60, target = null, onDone }) {
  el.innerHTML = `<div class="rec">
      <button class="recbtn" id="recbtn" title="Grabar" aria-label="Grabar"></button>
      <div class="recinfo"><div class="timer" id="rectime">0:00${target ? ` <span class="muted small">/ ~${fmtSec(target)}</span>` : ""}</div>
        <div class="meter"><i id="reclvl"></i></div>
        <div class="muted small" id="rechint">Tocá el botón rojo para grabar.</div></div>
    </div><div id="recerr"></div>`;
  let r = null;
  let timer = 0;
  const btn = $("#recbtn", el);
  const stop = async () => {
    clearTimeout(timer);
    btn.disabled = true;
    btn.classList.remove("on");
    const g = await r.stop();
    activeRecorder = null;
    const hint = $("#rechint", el);
    if (hint) hint.textContent = "Listo.";
    onDone(g);
  };
  btn.onclick = async () => {
    if (r) { stop(); return; }
    try {
      r = await openRecorder((t, lvl) => {
        const tt = $("#rectime", el);
        if (!tt) return;
        tt.firstChild.textContent = fmtSec(t);
        $("#reclvl", el).style.width = `${Math.min(100, lvl * 160)}%`;
      });
    } catch (e) {
      $("#recerr", el).innerHTML = `<div class="bad">${esc(micError(e))}</div>`;
      return;
    }
    r.start();
    btn.classList.add("on");
    btn.title = "Parar";
    $("#rechint", el).textContent = `Grabando… tocá de nuevo para terminar (máx. ${fmtSec(maxSec)}).`;
    timer = setTimeout(stop, maxSec * 1000);
  };
}
