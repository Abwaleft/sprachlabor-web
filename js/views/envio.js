// Enviar al tutor (4 llamadas a la IA), Rückmeldung y pantalla de sesión terminada.

import { $, emptyCard, esc, fmtDate } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { bindFeedback, feedbackHTML } from "../feedback.js";
import * as ia from "../ia/ia.js";
import { estimar, fmtUSD } from "../ia/costos.js";
import * as envioMod from "../logica/envio.js";
import * as estado from "../logica/estado.js";
import * as korrektur from "../logica/korrektur.js";
import * as opciones from "../logica/opciones.js";
import { frame, startFeed } from "../session.js";
import * as tts from "../voz/tts.js";
import { perfilCard } from "./heute.js";

function textosDelLote(e) {
  const r = e.result || {};
  const out = [];
  for (const w of r.palabras_nuevas || []) out.push(`${w.artikel || ""} ${w.wort}`.trim(), w.beispiel_de);
  for (const k of ["hoeren", "diktat", "vorlesen"]) for (const it of (r.lote || {})[k] || []) out.push(it.text_de);
  for (const f of r.feedback || []) if (f.version_b1) out.push(f.version_b1);
  return out.filter(Boolean);
}

export async function enviar() {
  const s = await estado.status();
  const listo = await ia.listo();
  const a = await ia.ajustes();
  const ult = await envioMod.ultimos();
  const op = await opciones.get();
  const estimado = estimar(a.modelo, 60000, 9000);  // export recortado ≈ 60 k caracteres en total, ≈ 9 k tokens de salida
  frame("Enviar al tutor", `
    <div class="card">
      <p>Se mandan <b>${s.pendientes}</b> intentos nuevos, tu perfil y el estado de tus palabras. El tutor corrige lo que falte,
        actualiza tu perfil y arma palabras nuevas y ejercicios para ~${op.dias_lote} días.</p>
      <p class="muted small">Son 4 llamadas a la IA (${esc(a.modelo)}); suelen tardar 1–3 minutos en total y costar alrededor de ${fmtUSD(estimado)}.
        Podés seguir practicando mientras tanto.</p>
      ${listo ? "" : `<div class="note">Falta la clave de API: <a href="#/ia">cargarla en Ajustes de IA</a>.</div>`}
      <button class="btn primary" id="go" ${!listo || envioMod.status().running ? "disabled" : ""}>Enviar al tutor</button>
      ${ult.incompletos.length ? `<button class="btn" id="retry" data-id="${ult.incompletos[0].id}">Completar el envío a medias (${Object.keys(ult.incompletos[0].partes).length}/4 partes)</button>` : ""}
      <div id="st"></div>
    </div>`);

  const render = (st) => {
    const el = $("#st");
    if (!el) return;
    if (st.running) {
      const m = Math.floor(st.elapsed / 60);
      const sec = String(st.elapsed % 60).padStart(2, "0");
      const partes = ["a", "b", "c", "d"].map((p) => (st.partes[p] ? "●" : "○")).join(" ");
      el.innerHTML = `<p style="margin-top:14px"><span class="spinner"></span>${esc(st.stage)}… ${m}:${sec} <span class="muted small">${partes}</span></p>`;
    } else if (st.error) {
      el.innerHTML = `<div class="bad">Falló: ${esc(st.error)}</div><p class="muted small">Lo que ya llegó quedó guardado. Podés completar las partes que faltan.</p>`;
      $("#go").disabled = false;
    } else if (st.resultado) {
      const r = st.resultado;
      el.innerHTML = `<div class="ok">✓ Listo: ${r.palabras || 0} palabras, ${r.hoeren || 0} Hören, ${r.diktat || 0} Diktat, ${r.vorlesen || 0} Vorlesen,
        ${r.schreiben || 0} Schreiben, ${r.sprechen || 0} Sprechen${r.feedback ? ` y ${r.feedback} correcciones` : ""}.
        ${r.niveles && Object.keys(r.niveles).length ? ` Nivel de consignas: ${Object.entries(r.niveles).map(([k, v]) => `${k === "schreiben" ? "Schreiben" : "Sprechen"} ${v}`).join(" · ")}.` : ""}
        <span class="muted small">Costó ${fmtUSD(r.costo_usd)}.</span></div>
        <p class="muted small">Los audios del lote se generan en segundo plano (${tts.pendientes()} en cola).</p>
        <a class="btn primary" href="#/rueckmeldung">Ver Rückmeldung</a> <a class="btn" href="#/">Heute</a>`;
      $("#go").disabled = false;
    }
  };
  const off = envioMod.onCambio((st) => {
    render(st);
    if (!st.running && st.resultado && st.resultado.envio_id) {
      envioMod.ultimos().then((u) => { if (u.ok && u.ok.id === st.resultado.envio_id) tts.pregenerar(textosDelLote(u.ok)); });
    }
  });
  window.addEventListener("hashchange", off, { once: true });
  $("#go").onclick = () => { $("#go").disabled = true; envioMod.iniciar(); render(envioMod.status()); };
  const rb = $("#retry");
  if (rb) rb.onclick = () => { rb.disabled = true; $("#go").disabled = true; envioMod.iniciar(+rb.dataset.id); render(envioMod.status()); };
  const st = envioMod.status();
  if (st.running || st.resultado || st.error) render(st);
}

export async function rueckmeldung() {
  const u = await envioMod.ultimos();
  const corr = await korrektur.recientes(30);
  if (!u.ok && !corr.length) { frame("Rückmeldung", emptyCard("Todavía no hay ninguna devolución del tutor.")); return; }
  const e = u.ok;
  const r = e ? e.result : null;
  const L = r && r.lote ? Object.fromEntries(Object.entries(r.lote).map(([k, v]) => [k, v.length])) : {};
  frame("Rückmeldung", `
    ${e ? `<div class="card"><h2>Último envío al tutor</h2><p class="muted small">${fmtDate(e.finished)} · ${fmtUSD(e.costo_usd)}</p><p>${esc(r.resumen)}</p>
      <p class="muted small">Lote nuevo: ${(r.palabras_nuevas || []).length} palabras · ${L.hoeren || 0} Hören · ${L.diktat || 0} Diktat · ${L.vorlesen || 0} Vorlesen · ${L.schreiben || 0} Schreiben · ${L.sprechen || 0} Sprechen</p>
      ${r.nivel_consignas ? `<h3 class="meta" style="margin-top:12px">Nivel de las próximas consignas</h3>
        ${[["schreiben", "Schreiben"], ["sprechen", "Sprechen"]].filter(([k]) => r.nivel_consignas[k]).map(([k, l]) =>
          `<p class="small"><b>${l}:</b> <span class="nivel">${esc(r.nivel_consignas[k].nivel)}</span> ${esc(r.nivel_consignas[k].motivo)}</p>`).join("")}` : ""}
    </div>` : ""}
    <h2 style="margin:18px 0 10px">Correcciones de Schreiben y Sprechen ${corr.length ? `<span class="muted small">(${corr.length})</span>` : ""}</h2>
    ${corr.length ? corr.map((c, i) => `<div class="card" id="fb-${i}">${feedbackHTML(c, { titulo: c.titulo, fecha: c.fecha, tipo: c.tipo })}</div>`).join("")
      : `<div class="card"><p class="muted">Todavía no hay correcciones. Escribí o hablá algo y tocá «Corregir ahora», o esperá al próximo envío.</p></div>`}
    ${e ? perfilCard({ ...(await estado.status()).perfil }) : ""}
    ${e && (r.palabras_nuevas || []).length ? `<div class="card"><h2>Palabras nuevas del último envío</h2><ul class="clean">${r.palabras_nuevas.map((w) => `<li>${esc(`${w.artikel || ""} ${w.wort}`.trim())} — ${esc(w.es)}</li>`).join("")}</ul></div>` : ""}`);
  corr.forEach((c, i) => bindFeedback($(`#fb-${i}`)));
}

export function fertig() {
  frame("¡Sesión completa! 🎉", `
    <div class="card center">
      <p>Buen trabajo. Lo que hiciste queda guardado para el próximo envío al tutor.</p>
      <button class="btn primary big" id="more">Seguir practicando</button>
      <p></p><a class="btn" href="#/">Heute</a>
    </div>`);
  $("#more").onclick = () => startFeed();
}
