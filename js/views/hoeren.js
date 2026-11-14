// Hören: audio de 1–3 frases, pregunta, máximo 2 escuchas antes de responder.

import { play } from "../audio.js";
import { $, $$, emptyCard, esc } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { clearKeys, setKeys } from "../keys.js";
import * as ueb from "../logica/uebungen.js";
import { frame, itemDone, skipIfSession } from "../session.js";

export async function hoeren() {
  const seen = [];
  const load = async () => {
    const it = await ueb.hoerenNext(seen);
    if (!it) {
      if (skipIfSession()) return;
      frame("Hören", seen.length ? `<div class="card center"><p>Ya escuchaste todos los audios de esta tanda.</p><a class="btn" href="#/">Volver</a></div>`
        : emptyCard("Todavía no hay audios. Pedile al tutor el primer lote."));
      return;
    }
    seen.push(it.id);
    let plays = 0;
    let answered = false;
    frame("Hören", `
      <div class="card">
        <div class="meta">${esc(it.niveau)} ${it.repetido ? '<span class="tag">repaso</span>' : ""}</div>
        <p class="frage">${esc(it.frage)}</p>
        <div class="plays">
          <button class="btn primary" id="pn">▶ Escuchar</button>
          <button class="btn" id="pl">🐢 Lento</button>
          <span class="muted small" id="cnt">máx. 2 escuchas</span>
        </div>
        <div class="opts">${it.optionen.map((o, i) => `<button class="opt" data-i="${i}" disabled>${esc(o)}</button>`).join("")}</div>
        <div id="res"></div>
      </div>`);

    const listen = async (lento) => {
      if (answered) { play(it.text_de, { lento }); return; }
      if (plays >= 2) return;
      $("#cnt").textContent = "preparando audio…";
      if (!(await play(it.text_de, { lento }))) { $("#cnt").textContent = "no pude reproducir"; return; }
      plays++;
      $("#cnt").textContent = `${plays}/2 escuchas`;
      $$(".opt").forEach((b) => (b.disabled = false));
      if (plays >= 2) $("#pn").disabled = $("#pl").disabled = true;
    };
    $("#pn").onclick = () => listen(false);
    $("#pl").onclick = () => listen(true);

    $$(".opt").forEach((b) => (b.onclick = async () => {
      if (answered) return;
      answered = true;
      let r;
      try { r = await ueb.hoerenAnswer(it.id, +b.dataset.i, plays); } catch (e) { answered = false; $("#res").innerHTML = avisoHTML(e); return; }
      $$(".opt").forEach((x, i) => { x.disabled = true; if (i === r.richtig) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
      $("#pn").disabled = $("#pl").disabled = false;
      $("#cnt").textContent = "escuchas libres";
      $("#res").innerHTML = `<div class="${r.ok ? "ok" : "bad"}">${r.ok ? "✓ ¡Bien!" : "✗ No era esa."}</div>
        <div class="satz"><p class="de">${esc(r.text_de)}</p><p class="muted">${esc(r.erklaerung)}</p></div>
        <button class="btn primary block" id="next">Siguiente →</button>`;
      const next = () => { clearKeys(); if (!itemDone("hoeren")) load(); };
      $("#next").onclick = next;
      setKeys((e) => { if (e.key === "Enter") next(); });
    }));
  };
  await load();
}
