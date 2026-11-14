// Sprechen frei: monólogo de 30–90 s sobre una consigna. En el celular, Whisper da una transcripción provisoria;
// la grabación va al buzón para que la PC haga la literal (wav2vec2). Sin buzón, se corrige con la provisoria.

import { bindPlay } from "../audio.js";
import * as buzon from "../buzon/buzon.js";
import { $, emptyCard, esc, fmtSec } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { consignaHTML, dificultadWidget, korrekturButton } from "../feedback.js";
import { clearKeys } from "../keys.js";
import * as prod from "../logica/produktion.js";
import { recordWidget } from "../recorder.js";
import { frame, itemDone, skipIfSession } from "../session.js";
import * as stt from "../voz/stt.js";

export async function sprechen() {
  const seen = [];
  const load = async () => {
    const it = await prod.siguienteConsigna("sprechen", seen);
    if (!it) {
      if (skipIfSession()) return;
      frame("Sprechen", emptyCard("No hay consignas para hablar. Pedile más al tutor."));
      return;
    }
    seen.push(it.id);
    const target = it.duracion_s || 45;
    const hayBuzon = buzon.estado.configurado;
    frame("Sprechen", `
      <div class="card">
        ${consignaHTML({ ...it, tipo: "Sprechen" })}
        <p class="muted small">Hablá unos ${target} segundos. No pasa nada si te trabás: seguí.</p>
        <div id="recw"></div>
        <div id="res"></div>
      </div>`);
    if (stt.estado.soportado && !stt.estado.cargado) stt.cargar().catch(() => {});  // que vaya cargando mientras habla
    recordWidget($("#recw"), {
      maxSec: Math.max(120, target * 2),
      target,
      onDone: async (g) => {
        const res = $("#res");
        const blobs = { mia: g.wav };
        res.innerHTML = `<p><span class="spinner"></span>Reconociendo lo que dijiste… <span id="tt"></span></p>
          <p class="muted small">Tarda más o menos ${Math.round(g.segundos * 0.8)} s${stt.estado.cargado ? "" : " (la primera vez baja el reconocedor, ~75 MB)"}.</p>`;
        const off = stt.onCambio((s) => { const t = $("#tt"); if (t && s.cargando) t.textContent = `bajando ${Math.round(s.progreso * 100)} %`; });
        let tr = null;
        try {
          if (stt.estado.soportado) {
            const r = await stt.transcribir(g.pcm);
            tr = { texto: r.texto, whisper: r.texto, literal: false, ms: r.ms };
          }
        } catch (e) { console.warn("whisper:", e); }
        off();
        let intento;
        try {
          intento = await prod.sprechenGuardar(it.id, g.segundos, tr);
          if (hayBuzon) await buzon.encolarGrabacion({ attempt_id: intento.id, blob: g.comprimido || g.wav, segundos: g.segundos, tipo: "sprechen" });
        } catch (e) { res.innerHTML = avisoHTML(e); return; }
        if (hayBuzon) buzon.sincronizar().catch(() => {});
        res.innerHTML = `
          <h3 class="meta" style="margin-top:14px">${tr ? "Lo que entendió el celular (provisorio)" : "Grabación guardada"}</h3>
          ${tr ? `<p class="de">${esc(tr.texto || "(no se escuchó nada)")}</p>
            <p class="muted small">Whisper a veces corrige tu orden de palabras. ${hayBuzon ? "La PC va a hacer la transcripción literal cuando reciba la grabación (buzón)." : "Para una transcripción literal, configurá el buzón con la PC en «Datos»."}</p>`
            : `<p class="muted small">${hayBuzon ? "La PC la transcribe cuando reciba la grabación (buzón)." : "Este navegador no puede reconocer voz; configurá el buzón con la PC en «Datos»."}</p>`}
          <p class="muted small">${fmtSec(g.segundos)} de habla. Queda guardado para el próximo envío al tutor.</p>
          <div class="plays"><button class="btn sm" data-blob="mia">▶ Tu grabación</button></div>
          <div id="dif"></div>
          <p></p>
          ${tr && tr.texto ? `<button class="btn" id="korr">✍️ Corregir ahora</button>` : ""}
          <button class="btn primary" id="next">Siguiente →</button>
          <div id="kout"></div>`;
        bindPlay(res, blobs);
        dificultadWidget($("#dif"), intento.id, "Sprechen");
        if ($("#korr")) korrekturButton($("#korr"), $("#kout"), intento.id, { titulo: it.titulo, tipo: "sprechen_frei" });
        $("#next").onclick = () => { clearKeys(); if (!itemDone("sprechen")) load(); };
      },
    });
  };
  await load();
}
