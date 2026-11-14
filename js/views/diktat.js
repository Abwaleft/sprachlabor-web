// Diktat: escribir lo que se oye; comparación palabra por palabra.

import { play } from "../audio.js";
import { $, $$, bindUmlauts, emptyCard, esc, umlautBar } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { clearKeys, setKeys } from "../keys.js";
import * as ueb from "../logica/uebungen.js";
import { frame, itemDone, skipIfSession } from "../session.js";

/** Una palabra del resultado de la comparación (también la usa Vorlesen). */
export function wordHTML(p) {
  const r = esc(p.ref);
  const h = esc(p.hyp);
  const tips = { mayuscula: "Mayúscula", umlaut: "Diéresis / ß", orden: "Orden de palabras", mal: "Mal escrita", falta: "Falta", sobra: "Sobra" };
  const t = `title="${tips[p.estado] || ""}"`;
  switch (p.estado) {
    case "ok": return `<span class="w ok">${r}</span>`;
    case "falta": return `<span class="w falta" ${t}>[${r}]</span>`;
    case "sobra": return `<span class="w sobra" ${t}>${h}</span>`;
    case "orden": return `<span class="w orden" ${t}>↔ ${r}</span>`;
    default: return `<span class="w ${p.estado}" ${t}><s>${h}</s>${r}</span>`;
  }
}

export async function diktat() {
  const seen = [];
  const load = async () => {
    const it = await ueb.diktatNext(seen);
    if (!it) {
      if (skipIfSession()) return;
      frame("Diktat", seen.length ? `<div class="card center"><p>Terminaste los dictados de esta tanda.</p><a class="btn" href="#/">Volver</a></div>`
        : emptyCard("Todavía no hay dictados. Pedile al tutor el primer lote."));
      return;
    }
    seen.push(it.id);
    let plays = 0;
    let checked = false;
    frame("Diktat", `
      <div class="card">
        <div class="meta">${it.repetido ? '<span class="tag">repaso</span>' : "escribí exactamente lo que oís"}</div>
        <div class="plays">
          <button class="btn primary" data-s="0">▶ Escuchar</button>
          <button class="btn" data-s="1">🐢 Lento</button>
          <span class="muted small" id="cnt"></span>
        </div>
        <textarea id="ein" class="input" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escribí acá…"></textarea>
        ${umlautBar()}
        <button class="btn primary block" id="chk">Corregir</button>
        <div id="res"></div>
      </div>`);
    const listen = async (lento) => {
      if (!(await play(it.text_de, { lento }))) return;
      if (!checked) { plays++; $("#cnt").textContent = `${plays} escucha${plays > 1 ? "s" : ""}`; }
      $("#ein").focus();
    };
    $$("[data-s]").forEach((b) => (b.onclick = () => listen(b.dataset.s === "1")));
    bindUmlauts();

    const check = async () => {
      const text = $("#ein").value.trim();
      if (!text || checked) return;
      checked = true;
      $("#ein").disabled = true;
      let r;
      try { r = await ueb.diktatAnswer(it.id, text, plays); } catch (e) { checked = false; $("#ein").disabled = false; $("#res").innerHTML = avisoHTML(e); return; }
      $("#chk").remove();
      const pct = Math.round(r.score * 100);
      $("#res").innerHTML = `
        <div class="${pct >= 90 ? "ok" : pct >= 60 ? "note" : "bad"}"><span class="score">${pct} %</span></div>
        <div class="diff">${r.palabras.map(wordHTML).join(" ")}</div>
        <div class="satz"><p class="de">${esc(r.referenz)}</p>${it.schwerpunkt ? `<p class="muted small">Foco: ${esc(it.schwerpunkt)}</p>` : ""}</div>
        <div class="legend"><span><span class="w mal">rojo</span> mal o falta</span><span><span class="w mayuscula">amarillo</span> mayúscula, diéresis u orden (↔)</span></div>
        <p></p><button class="btn primary block" id="next">Siguiente →</button>`;
      const next = () => { clearKeys(); if (!itemDone("diktat")) load(); };
      $("#next").onclick = next;
      setTimeout(() => setKeys((e) => { if (e.key === "Enter") next(); }), 50);
    };
    $("#ein").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } };
    $("#chk").onclick = check;
    listen(false);
  };
  await load();
}
