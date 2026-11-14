// Schreiben: consigna estilo Goethe B1, contador de palabras, borrador local y «Corregir ahora».

import { $, $$, bindUmlauts, emptyCard, esc, umlautBar } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { consignaHTML, dificultadWidget, korrekturButton } from "../feedback.js";
import { clearKeys } from "../keys.js";
import { contarPalabras } from "../logica/diktat.js";
import * as prod from "../logica/produktion.js";
import { frame, itemDone, skipIfSession } from "../session.js";

const draftKey = (id) => `schreiben-borrador-${id}`;
export function draftGet(id) { try { return localStorage.getItem(draftKey(id)) || ""; } catch { return ""; } }
export function draftSet(id, v) { try { if (v) localStorage.setItem(draftKey(id), v); else localStorage.removeItem(draftKey(id)); } catch { /* */ } }

export async function schreiben() {
  const seen = [];
  const load = async () => {
    const it = await prod.siguienteConsigna("schreiben", seen);
    if (!it) {
      if (skipIfSession()) return;
      frame("Schreiben", emptyCard("No hay consignas para escribir. Pedile más al tutor."));
      return;
    }
    seen.push(it.id);
    const min = it.palabras_min || 0;
    const max = it.palabras_max || 0;
    frame("Schreiben", `
      <div class="card">
        ${consignaHTML(it)}
        <textarea id="ein" class="input" autocomplete="off" spellcheck="false" placeholder="Escribí acá en alemán…">${esc(draftGet(it.id))}</textarea>
        <div class="counter" id="cnt"></div>
        ${umlautBar()}
        <button class="btn" id="save">Guardar</button>
        <button class="btn primary" id="savek">Guardar y corregir ahora</button>
        <button class="btn" id="skip" style="float:right">Otra consigna</button>
        <div id="res"></div>
      </div>`);
    bindUmlauts();
    const ein = $("#ein");
    const count = () => {
      const n = contarPalabras(ein.value);
      const c = $("#cnt");
      c.textContent = `${n} palabras${min ? ` · objetivo ${min}–${max}` : ""}`;
      c.className = "counter" + (min && n >= min && n <= max ? " ok" : "");
      draftSet(it.id, ein.value);
    };
    ein.oninput = count;
    count();
    ein.focus();
    $("#skip").onclick = () => load();
    const save = async (corregir) => {
      const texto = ein.value.trim();
      if (!texto) { ein.focus(); return; }
      $("#save").disabled = $("#savek").disabled = true;
      let intento;
      try { intento = await prod.schreibenGuardar(it.id, texto); } catch (e) { $("#save").disabled = $("#savek").disabled = false; $("#res").innerHTML = avisoHTML(e); return; }
      draftSet(it.id, "");
      ein.disabled = true;
      $$(".umlauts, #skip").forEach((x) => x.remove());
      $("#save").remove();
      $("#savek").remove();
      const res = $("#res");
      res.innerHTML = `<div class="ok">✓ Guardado.</div>
        <div id="dif"></div>
        <p class="muted small" style="margin-top:12px">Si no lo corregís ahora, el tutor lo corrige en el próximo envío.</p>
        <button class="btn" id="korr">✍️ Corregir ahora</button>
        <button class="btn primary" id="next">Siguiente →</button>
        <div id="kout"></div>`;
      dificultadWidget($("#dif"), intento.id, "Schreiben");
      korrekturButton($("#korr"), $("#kout"), intento.id, { titulo: it.titulo, tipo: "schreiben" });
      $("#next").onclick = () => { clearKeys(); if (!itemDone("schreiben")) load(); };
      if (corregir) $("#korr").click();
    };
    $("#save").onclick = () => save(false);
    $("#savek").onclick = () => save(true);
  };
  await load();
}
