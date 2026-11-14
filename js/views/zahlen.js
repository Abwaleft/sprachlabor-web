// Zahlen: números, precios, horas y fechas generados en el celular (infinito).

import { play } from "../audio.js";
import { $, $$, esc } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { clearKeys, setKeys } from "../keys.js";
import * as ueb from "../logica/uebungen.js";
import { frame, itemDone } from "../session.js";
import * as tts from "../voz/tts.js";

let zahlenArt = "mix";
const ARTS = [["mix", "Mezcla"], ["zahl", "Números"], ["preis", "Precios"], ["uhrzeit", "Horas"], ["datum", "Fechas"]];
let proximo = null;

export async function zahlen() {
  const load = async () => {
    const it = proximo && (zahlenArt === "mix" || proximo.art === zahlenArt) ? proximo : ueb.zahlenNext(zahlenArt);
    proximo = ueb.zahlenNext(zahlenArt);
    tts.pregenerar([proximo.text_de]);  // el siguiente se prepara mientras se hace este
    let plays = 0;
    let done = false;
    const numeric = it.art === "zahl" || it.art === "preis";
    frame("Zahlen", `
      <div class="chips">${ARTS.map(([k, l]) => `<button class="chip ${k === zahlenArt ? "on" : ""}" data-a="${k}">${l}</button>`).join("")}</div>
      <div class="card">
        <p class="muted">${esc(it.prompt)}</p>
        <div class="plays">
          <button class="btn primary" data-s="0">▶ Escuchar</button>
          <button class="btn" data-s="1">🐢 Lento</button>
          <span class="muted small" id="cnt"></span>
        </div>
        <input id="ein" class="input big" autocomplete="off" inputmode="${numeric ? "decimal" : "text"}">
        <button class="btn primary block" id="chk">Comprobar</button>
        <div id="res"></div>
      </div>`);
    $$("[data-a]").forEach((b) => (b.onclick = () => { zahlenArt = b.dataset.a; proximo = null; load(); }));
    const listen = async (lento) => {
      $("#cnt").textContent = plays ? `${plays} escucha${plays > 1 ? "s" : ""}` : "preparando…";
      if (!(await play(it.text_de, { lento }))) { $("#cnt").textContent = "no pude reproducir"; return; }
      if (!done) { plays++; $("#cnt").textContent = `${plays} escucha${plays > 1 ? "s" : ""}`; }
      $("#ein").focus();
    };
    $$("[data-s]").forEach((b) => (b.onclick = () => listen(b.dataset.s === "1")));

    const check = async () => {
      const v = $("#ein").value.trim();
      if (!v || done) return;
      done = true;
      $("#ein").disabled = true;
      let r;
      try { r = await ueb.zahlenAnswer(it, v, plays); } catch (e) { done = false; $("#ein").disabled = false; $("#res").innerHTML = avisoHTML(e); return; }
      $("#chk").remove();
      $("#res").innerHTML = `<div class="${r.ok ? "ok" : "bad"}">${r.ok ? "✓ ¡Bien!" : `✗ Era ${esc(r.solucion)}`}</div>
        <div class="satz"><p class="de">${esc(r.text_de)}</p></div>
        <button class="btn primary block" id="next">Siguiente →</button>`;
      const next = () => { clearKeys(); if (!itemDone("zahlen")) load(); };
      $("#next").onclick = next;
      setTimeout(() => setKeys((e) => { if (e.key === "Enter") next(); }), 50);
    };
    $("#ein").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } };
    $("#chk").onclick = check;
    listen(false);
  };
  await load();
}
