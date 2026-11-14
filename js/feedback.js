// Correcciones del tutor, consignas y el widget de dificultad (Schreiben y Sprechen).

import { bindPlay, playButtons } from "./audio.js";
import { $, $$, esc, fmtDate } from "./dom.js";
import { mensaje } from "./errores.js";
import { setKeys, typing } from "./keys.js";
import { NIVEL_TXT, nombrePatron } from "./labels.js";
import * as ia from "./ia/ia.js";
import { fmtUSD } from "./ia/costos.js";
import * as korrektur from "./logica/korrektur.js";
import * as niveles from "./logica/niveles.js";
import * as db from "./datos/db.js";

export function feedbackHTML(fb, { titulo = "", fecha = "", tipo = "" } = {}) {
  const errs = (fb.errores || []).map((e) => `<li><b>${esc(e.fragmento)}</b> → <b>${esc(e.correccion)}</b>
      <span class="pat">· ${esc(nombrePatron(e.patron))}</span><br>${esc(e.explicacion)}</li>`).join("");
  const kind = tipo === "sprechen_frei" ? "Sprechen" : tipo === "schreiben" ? "Schreiben" : "";
  return `<div class="fb">
    ${titulo || fecha ? `<div class="meta">${kind ? esc(kind) + " · " : ""}${esc(titulo)}${fecha ? " · " + esc(fmtDate(fecha)) : ""}</div>` : ""}
    <p style="margin-top:8px">${fb.nivel_estimado ? `<span class="nivel">${NIVEL_TXT[fb.nivel_estimado] || esc(fb.nivel_estimado)}</span> ` : ""}${esc(fb.comentario || "")}</p>
    <h3>${tipo === "sprechen_frei" ? "Lo que dijiste (transcripción)" : "Lo que escribiste"}</h3><p class="orig">${esc(fb.original || "")}</p>
    <h3>Corregido</h3><p class="corr">${esc(fb.corregido)}</p>
    ${errs ? `<h3>Errores (${fb.errores.length})</h3><ul>${errs}</ul>` : `<div class="ok">Sin errores. 👏</div>`}
    ${fb.nivel_siguiente ? `<h3>Próximas consignas de ${tipo === "sprechen_frei" ? "Sprechen" : "Schreiben"}</h3>
      <p><span class="nivel">${esc(fb.nivel_siguiente)}</span> ${esc(fb.motivo_nivel || "")}
      ${fb.decision_nivel && fb.decision_nivel.antes !== fb.decision_nivel.ahora ? `<span class="muted small">(antes ${esc(fb.decision_nivel.antes)})</span>` : ""}</p>` : ""}
    ${fb.version_b1 ? `<h3>Versión B1</h3><div class="b1">${esc(fb.version_b1)}</div>${playButtons(fb.version_b1)}` : ""}
    ${fb.costo_usd != null ? `<p class="muted small" style="margin-top:8px">Corrección: ${fmtUSD(fb.costo_usd)}${fb.modelo ? ` · ${esc(fb.modelo)}` : ""}</p>` : ""}
  </div>`;
}

export function bindFeedback(root) {
  bindPlay(root);
}

/** Botón «Corregir ahora» que muestra la corrección en `out`. */
export function korrekturButton(btn, out, attemptId, meta) {
  btn.onclick = async () => {
    if (!(await ia.listo())) {
      out.innerHTML = `<div class="note">Para corregir hace falta la clave de API. <a href="#/ia">Cargarla en Ajustes de IA</a>. Si no, el tutor lo corrige en el próximo envío.</div>`;
      return;
    }
    btn.disabled = true;
    let t0 = Date.now();
    out.innerHTML = `<p><span class="spinner"></span>El tutor está corrigiendo… <span id="kt">0 s</span></p><p class="muted small">Suele tardar entre 10 y 30 segundos (unos centavos de dólar).</p>`;
    const timer = setInterval(() => { const t = $("#kt"); if (t) t.textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    try {
      const fb = await korrektur.corregir(attemptId);
      out.innerHTML = `<div class="card" style="margin:12px 0 0">${feedbackHTML(fb, meta)}</div>`;
      bindFeedback(out);
      btn.remove();
    } catch (e) {
      out.innerHTML = `<div class="bad">No se pudo corregir: ${esc(mensaje(e))}</div>`;
      btn.disabled = false;
    } finally { clearInterval(timer); }
  };
}

export const consignaHTML = (it) => `
  <div class="meta">${it.nivel ? `<span class="tag" title="Tu nivel actual en este tipo: ${esc(it.nivel_objetivo || "")}">nivel ${esc(it.nivel)}</span> ` : ""}${esc(it.tipo || "Sprechen")}${it.tema ? " · " + esc(it.tema) : ""} ${it.repetido ? '<span class="tag">repaso</span>' : ""}</div>
  <h2 style="margin-top:4px">${esc(it.titulo || "")}</h2>
  <p class="de">${esc(it.consigna_de)}</p>
  <p class="muted small">${esc(it.consigna_es || "")}</p>
  ${it.puntos && it.puntos.length ? `<ul class="puntos">${it.puntos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
  ${it.ayuda && it.ayuda.length ? `<div class="muted small">Para arrancar:</div><div class="ayuda">${it.ayuda.map((a) => `<span>${esc(a)}</span>`).join("")}</div>` : ""}`;

/** «¿Qué tan difícil te resultó?» después de Schreiben/Sprechen: ajusta el nivel de las próximas consignas. */
export function dificultadWidget(el, attemptId, tipoTxt) {
  el.innerHTML = `<div class="card" style="margin:12px 0 0;padding:14px">
    <p class="small" style="margin:0 0 8px"><b>¿Qué tan difícil te resultó esta consigna?</b>
      <span class="muted">(teclas 1–4) · ajusta el nivel de las próximas de ${tipoTxt}</span></p>
    <div class="grades">
      <button class="btn g1" data-d="1">Muy difícil</button><button class="btn g2" data-d="2">Difícil</button>
      <button class="btn g3" data-d="3">Bien</button><button class="btn g4" data-d="4">Fácil</button>
    </div><div class="muted small" id="dres" style="margin-top:8px"></div></div>`;
  const marcar = async (v) => {
    try {
      const a = await db.get("intentos", attemptId);
      const r = await niveles.calificar(a, v);
      await db.put("intentos", a);
      $$("[data-d]", el).forEach((b) => b.classList.toggle("sel", +b.dataset.d === v));
      if (r.decidido_por_tutor) {
        $("#dres", el).innerHTML = `✓ Anotado: ${esc(r.dificultad)}. El tutor ya decidió el nivel con tu respuesta (<b>${esc(r.decidido_por_tutor)}</b>).`;
        return;
      }
      const cambio = r.antes === r.ahora ? `se mantiene en <b>${r.ahora}</b>` : `pasa de ${r.antes} a <b>${r.ahora}</b>`;
      $("#dres", el).innerHTML = `✓ Anotado: ${esc(r.dificultad)}. Por ahora, el nivel de las próximas consignas de ${tipoTxt} ${cambio}. Cuando el tutor corrija tu respuesta, decide el nivel final.`;
    } catch (e) {
      $("#dres", el).innerHTML = `<span class="down">${esc(mensaje(e))}</span>`;
    }
  };
  $$("[data-d]", el).forEach((b) => (b.onclick = () => marcar(+b.dataset.d)));
  setKeys((e) => { if (typing()) return; if (["1", "2", "3", "4"].includes(e.key)) marcar(+e.key); });
}
