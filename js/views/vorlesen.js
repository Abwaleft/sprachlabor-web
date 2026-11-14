// Vorlesen: leer una frase en voz alta; Whisper (en el celular) la transcribe y se marca qué se entendió.

import { bindPlay } from "../audio.js";
import { $, emptyCard, esc } from "../dom.js";
import { avisoHTML } from "../errores.js";
import * as prod from "../logica/produktion.js";
import { recordWidget } from "../recorder.js";
import { frame, itemDone, skipIfSession } from "../session.js";
import * as stt from "../voz/stt.js";
import { wordHTML } from "./diktat.js";

export async function vorlesen() {
  const load = async () => {
    const it = await prod.vorlesenNext();
    if (!it) {
      if (skipIfSession()) return;
      frame("Vorlesen", emptyCard("Todavía no hay frases para leer. Pedile al tutor el primer lote."));
      return;
    }
    if (!stt.estado.soportado) {
      frame("Vorlesen", `<div class="card center"><p>Este navegador no puede reconocer voz (hace falta WebAssembly y Web Workers).</p><a class="btn" href="#/">Volver</a></div>`);
      return;
    }
    frame("Vorlesen", `
      <div class="card">
        <div class="meta">Leé en voz alta${it.schwerpunkt ? " · " + esc(it.schwerpunkt) : ""}</div>
        <p class="texto-leer de">${esc(it.text)}</p>
        <div class="plays"><span class="muted small">Modelo:</span>
          <button class="btn sm" data-tts="${esc(it.text)}" data-lento="0">▶ Normal</button>
          <button class="btn sm" data-tts="${esc(it.text)}" data-lento="1">🐢 Lento</button></div>
        <div id="stt-st" class="muted small"></div>
        <div id="recw"></div>
        <div id="res"></div>
      </div>`);
    bindPlay();
    const st = $("#stt-st");
    const off = stt.onCambio((s) => {
      if (!st) return;
      if (s.cargando) st.innerHTML = `<span class="spinner"></span>Bajando el reconocedor (~75 MB, una sola vez)… ${Math.round(s.progreso * 100)} %`;
      else if (s.error && !s.cargado) st.innerHTML = `<span class="down">No pude cargar el reconocedor: ${esc(s.error)}</span>`;
      else st.textContent = "";
    });
    if (!stt.estado.cargado) stt.cargar().catch(() => {});
    const attempt = () => recordWidget($("#recw"), {
      maxSec: 25,
      onDone: async (g) => {
        const res = $("#res");
        res.innerHTML = `<p><span class="spinner"></span>Escuchando lo que dijiste…</p>`;
        try {
          const tr = await stt.transcribir(g.pcm);
          const r = await prod.vorlesenEvaluar(it, tr.texto, g.segundos, { literal: false, whisper: tr.texto });
          const p = Math.round(r.score * 100);
          const blobs = { mia: g.wav };
          res.innerHTML = `
            <div class="${p >= 90 ? "ok" : p >= 60 ? "note" : "bad"}"><span class="score">${p} %</span> reconocido</div>
            <div class="diff">${r.palabras.map(wordHTML).join(" ")}</div>
            <p class="muted small">Se escuchó: «${esc(r.transkript || "—")}» · ${(tr.ms / 1000).toFixed(1)} s de reconocimiento</p>
            <div class="legend"><span><span class="w mal">rojo</span> no se entendió o sonó a otra palabra</span><span><span class="w umlaut">amarillo</span> diéresis u orden</span></div>
            <div class="plays" style="margin-top:12px">
              <button class="btn sm" data-blob="mia">▶ Tu grabación</button>
              <button class="btn sm" data-tts="${esc(it.text)}" data-lento="0">▶ Modelo</button></div>
            <button class="btn" id="again">↻ Otra vez</button>
            <button class="btn primary" id="next">Siguiente →</button>`;
          bindPlay(res, blobs);
          $("#again").onclick = () => { res.innerHTML = ""; attempt(); };
          $("#next").onclick = () => { off(); if (!itemDone("vorlesen")) load(); };
        } catch (e) {
          res.innerHTML = avisoHTML(e);
          attempt();
        }
      },
    });
    attempt();
  };
  await load();
}
