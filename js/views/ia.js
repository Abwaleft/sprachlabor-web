// Ajustes de IA: clave de API (vive solo en este celular), modelo para envíos y para correcciones, prueba de la clave.

import { $, esc } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { fmtUSD, MODELOS } from "../ia/costos.js";
import * as ia from "../ia/ia.js";
import * as stats from "../logica/stats.js";
import { frame } from "../session.js";
import { costosHTML } from "./estadisticas.js";

export async function ajustesIA() {
  const a = await ia.ajustes();
  const costos = await stats.costosIA();
  const opt = (sel) => Object.entries(MODELOS).map(([id, m]) => `<option value="${id}" ${id === sel ? "selected" : ""}>${m.nombre} — ${esc(m.nota)}</option>`).join("");
  frame("Ajustes de IA", `
    <section class="card"><h2>Clave de API de Claude</h2>
      <p class="muted small">La app llama a la API de Claude desde este celular con tu propia clave. La clave se guarda solo acá (en la base local del
        navegador) y viaja únicamente a <code>api.anthropic.com</code>. Se consigue en <b>console.anthropic.com → API keys</b>; hay que tener saldo cargado.</p>
      <div class="optrow"><label for="k">Clave</label>
        <input id="k" type="password" autocomplete="off" spellcheck="false" placeholder="${a.api_key ? "guardada: •••" + esc(a.api_key.slice(-4)) : "sk-ant-…"}">
        <div class="muted small"><label><input type="checkbox" id="ver"> mostrar</label> · dejá vacío para no cambiarla</div></div>
      <div class="optrow"><label for="m">Modelo para envíos</label><select id="m">${opt(a.modelo)}</select></div>
      <div class="optrow"><label for="mc">Modelo para correcciones</label><select id="mc">${opt(a.modelo_correcciones)}</select>
        <div class="muted small">Sonnet 5.5 para todo es lo recomendado (medido con textos reales). Haiku como modo económico solo en correcciones.</div></div>
      <div class="plays"><button class="btn primary" id="guardar">Guardar</button><button class="btn" id="probar" ${a.api_key ? "" : "disabled"}>Probar la clave</button>
        ${a.api_key ? `<button class="btn" id="borrar">Borrar la clave</button>` : ""}</div>
      <div id="res"></div>
    </section>
    <section class="card"><h2>Costo</h2>${costosHTML(costos)}</section>
    <section class="card"><h2>Qué hace la IA y qué no</h2>
      <ul class="clean small">
        <li><b>Corregir ahora</b> (Schreiben / Sprechen): 1 llamada, ~1–2 centavos.</li>
        <li><b>Enviar al tutor</b>: 4 llamadas (correcciones y perfil · palabras · Hören/Diktat/Vorlesen · Schreiben/Sprechen), ~15–45 centavos.</li>
        <li><b>Test de nivel</b>: 1 llamada al terminar, ~5 centavos.</li>
        <li>Vokabeln, Hören, Diktat, Zahlen, Vorlesen y la voz no usan la IA: funcionan sin internet.</li>
      </ul></section>`);
  $("#ver").onchange = () => { $("#k").type = $("#ver").checked ? "text" : "password"; };
  $("#guardar").onclick = async () => {
    const nuevos = { modelo: $("#m").value, modelo_correcciones: $("#mc").value };
    const k = $("#k").value.trim();
    if (k) nuevos.api_key = k;
    try {
      await ia.guardarAjustes(nuevos);
      $("#k").value = "";
      $("#res").innerHTML = `<div class="ok">✓ Guardado.${k ? " Probá la clave para confirmar que funciona." : ""}</div>`;
      $("#probar").disabled = !(await ia.listo());
    } catch (e) { $("#res").innerHTML = avisoHTML(e); }
  };
  $("#probar").onclick = async () => {
    $("#probar").disabled = true;
    $("#res").innerHTML = `<p><span class="spinner"></span>Probando con la llamada más chica posible (Haiku, unos tokens)…</p>`;
    try {
      const r = await ia.probarClave();
      $("#res").innerHTML = `<div class="ok">✓ La clave funciona (${r.segundos} s, ${fmtUSD((await stats.costosIA()).ultimas[0].costo_usd)}).</div>`;
    } catch (e) { $("#res").innerHTML = avisoHTML(e); } finally { $("#probar").disabled = false; }
  };
  const b = $("#borrar");
  if (b) b.onclick = async () => {
    if (!confirm("¿Borrar la clave de API de este celular? Sin clave, el tutor no puede corregir ni armar lotes.")) return;
    await ia.guardarAjustes({ api_key: "" });
    ajustesIA();
  };
}
