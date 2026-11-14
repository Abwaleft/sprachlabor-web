// Inicio: bienvenida, datos del alumno y test de nivel (crea el perfil). También «Editar perfil» (#/inicio?editar=1).

import { bindPlay, play } from "../audio.js";
import { $, $$, app, bindUmlauts, esc, umlautBar } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { contarPalabras } from "../logica/diktat.js";
import * as perfilMod from "../logica/perfil.js";
import * as seeds from "../logica/seeds.js";
import * as test from "../logica/testnivel.js";
import { usarPerfil } from "../labels.js";
import { recordWidget } from "../recorder.js";
import * as stt from "../voz/stt.js";
import * as ia from "../ia/ia.js";

const IDIOMAS = ["español", "portugués", "inglés", "francés", "italiano", "otro"];

function pasoDatos(datos, onNext) {
  const p = datos;
  app.innerHTML = `<section class="card hero"><div><div class="meta">Sprachlabor</div><h1>Hallo! 👋</h1>
    <p class="muted">Alemán todos los días, en tu celular, con un tutor que corrige y arma ejercicios para vos. Primero, unos datos y un test corto (10 min) para armar tu perfil.</p></div></section>
    <section class="card"><h2>Sobre vos</h2>
      <div class="optrow"><label for="nombre">Tu nombre</label><input id="nombre" autocomplete="given-name" value="${esc(p.nombre || "")}"></div>
      <div class="optrow"><label for="nativo">Idioma materno</label><select id="nativo">${IDIOMAS.map((i) => `<option ${i === (p.idiomas.nativo || "español") ? "selected" : ""}>${i}</option>`).join("")}</select></div>
      <div class="optrow"><label>Otros idiomas que hablás</label><div class="chips" id="otros">${IDIOMAS.filter((i) => i !== "otro").map((i) => `<button type="button" class="chip ${(p.idiomas.otros || []).includes(i) ? "on" : ""}" data-v="${i}">${i}</button>`).join("")}</div></div>
      <div class="optrow"><label for="meta">Meta</label><select id="meta"><option value="B1" ${p.meta !== "B2" ? "selected" : ""}>Goethe-Zertifikat B1</option><option value="B2" ${p.meta === "B2" ? "selected" : ""}>Goethe-Zertifikat B2</option></select></div>
      <div class="optrow"><label for="anios">¿Cuánto alemán estudiaste?</label><select id="anios">${["nada todavía", "unos meses", "1–2 años", "más de 2 años"].map((a) => `<option ${a === p.anios ? "selected" : ""}>${a}</option>`).join("")}</select></div>
      <div class="optrow"><label>Temas que te interesan (para los textos y audios)</label><div class="chips" id="temas">${perfilMod.TEMAS_SUGERIDOS.map((t) => `<button type="button" class="chip ${(p.temas || []).includes(t) ? "on" : ""}" data-v="${t}">${t}</button>`).join("")}</div>
        <input id="tema-extra" placeholder="otro tema…" autocomplete="off" style="margin-top:8px"></div>
      <div class="optrow"><label for="expl">Explicaciones en</label><select id="expl">${["español rioplatense", "español neutro", "portugués", "inglés"].map((x) => `<option ${x === (p.idioma_explicaciones || "español rioplatense") ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <button class="btn primary big" id="sig">${p._editar ? "Guardar" : "Empezar el test →"}</button>
      <div id="err"></div>
    </section>`;
  $$("#otros .chip, #temas .chip").forEach((b) => (b.onclick = () => b.classList.toggle("on")));
  $("#sig").onclick = () => {
    const nombre = $("#nombre").value.trim();
    if (!nombre) { $("#err").innerHTML = `<div class="bad">Decime tu nombre (así el tutor te saluda).</div>`; return; }
    const temas = $$("#temas .chip.on").map((b) => b.dataset.v);
    const extra = $("#tema-extra").value.trim();
    if (extra) temas.push(extra);
    Object.assign(datos, { nombre, idiomas: { nativo: $("#nativo").value, otros: $$("#otros .chip.on").map((b) => b.dataset.v) }, meta: $("#meta").value, anios: $("#anios").value,
      temas: temas.length ? temas : ["vida diaria", "viajes por Alemania"], idioma_explicaciones: $("#expl").value });
    onNext();
  };
}

function pasoLesen(datos, onNext) {
  const items = test.LESEN.flatMap((t) => t.fragen.map((f) => ({ ...f, texto: t })));
  datos.lesen = datos.lesen || new Array(items.length).fill(null);
  app.innerHTML = `<section class="view"><div class="view-head"><h1>Test · Lesen</h1></div>
    <p class="muted small">Leé cada texto y respondé. Sin diccionario.</p>
    ${test.LESEN.map((t, ti) => `<div class="card"><div class="meta">${esc(t.niveau)} · ${esc(t.titulo)}</div><p class="de">${esc(t.text)}</p>
      ${t.fragen.map((f, fi) => { const idx = test.LESEN.slice(0, ti).reduce((a, x) => a + x.fragen.length, 0) + fi; return `<p class="frage">${esc(f.frage)}</p><div class="opts">${f.optionen.map((o, oi) => `<button class="opt ${datos.lesen[idx] === oi ? "sel" : ""}" data-q="${idx}" data-o="${oi}">${esc(o)}</button>`).join("")}</div>`; }).join("")}
    </div>`).join("")}
    <button class="btn primary big" id="sig">Seguir →</button><div id="err"></div></section>`;
  $$(".opt").forEach((b) => (b.onclick = () => { datos.lesen[+b.dataset.q] = +b.dataset.o; $$(`.opt[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle("sel", x === b)); }));
  $("#sig").onclick = () => { if (datos.lesen.some((x) => x == null)) { $("#err").innerHTML = `<div class="bad">Faltan respuestas.</div>`; return; } onNext(); };
}

function pasoHoeren(datos, onNext) {
  datos.hoeren = datos.hoeren || new Array(test.HOEREN.length).fill(null);
  datos.hoeren_escuchas = datos.hoeren_escuchas || new Array(test.HOEREN.length).fill(0);
  app.innerHTML = `<section class="view"><div class="view-head"><h1>Test · Hören</h1></div>
    <p class="muted small">Escuchá cada frase (hasta 2 veces) y respondé. Si la voz alemana todavía no está bajada, se usa la del sistema.</p>
    ${test.HOEREN.map((h, i) => `<div class="card"><div class="meta">${esc(h.niveau)} · frase ${i + 1}</div>
      <div class="plays"><button class="btn primary sm" data-h="${i}">▶ Escuchar</button><span class="muted small" id="c${i}">${datos.hoeren_escuchas[i]}/2</span></div>
      <p class="frage">${esc(h.frage)}</p><div class="opts">${h.optionen.map((o, oi) => `<button class="opt ${datos.hoeren[i] === oi ? "sel" : ""}" data-q="${i}" data-o="${oi}" ${datos.hoeren_escuchas[i] ? "" : "disabled"}>${esc(o)}</button>`).join("")}</div></div>`).join("")}
    <button class="btn primary big" id="sig">Seguir →</button><div id="err"></div></section>`;
  $$("[data-h]").forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.h;
    if (datos.hoeren_escuchas[i] >= 2) return;
    b.disabled = true;
    const ok = await play(test.HOEREN[i].text);
    b.disabled = false;
    if (!ok) return;
    datos.hoeren_escuchas[i]++;
    $(`#c${i}`).textContent = `${datos.hoeren_escuchas[i]}/2`;
    $$(`.opt[data-q="${i}"]`).forEach((x) => (x.disabled = false));
  }));
  $$(".opt").forEach((b) => (b.onclick = () => { datos.hoeren[+b.dataset.q] = +b.dataset.o; $$(`.opt[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle("sel", x === b)); }));
  $("#sig").onclick = () => { if (datos.hoeren.some((x) => x == null)) { $("#err").innerHTML = `<div class="bad">Faltan respuestas (escuchá cada frase primero).</div>`; return; } onNext(); };
}

function pasoSchreiben(datos, onNext) {
  const c = test.SCHREIBEN;
  app.innerHTML = `<section class="view"><div class="view-head"><h1>Test · Schreiben</h1></div>
    <div class="card"><h2>${esc(c.titulo)}</h2><p class="de">${esc(c.consigna_de)}</p><p class="muted small">${esc(c.consigna_es)}</p>
      <textarea id="ein" class="input" rows="6" spellcheck="false" placeholder="Escribí acá en alemán…">${esc(datos.texto || "")}</textarea>
      <div class="counter" id="cnt"></div>${umlautBar()}
      <button class="btn primary big" id="sig">Seguir →</button><div id="err"></div></div></section>`;
  bindUmlauts();
  const ein = $("#ein");
  const count = () => { const n = contarPalabras(ein.value); $("#cnt").textContent = `${n} palabras · objetivo ${c.palabras_min}–${c.palabras_max}`; };
  ein.oninput = count;
  count();
  $("#sig").onclick = () => {
    datos.texto = ein.value.trim();
    if (contarPalabras(datos.texto) < 15) { $("#err").innerHTML = `<div class="bad">Escribí al menos unas 15 palabras, aunque sea con errores: es para ver tu nivel real.</div>`; return; }
    onNext();
  };
}

function pasoSprechen(datos, onNext) {
  const c = test.SPRECHEN;
  app.innerHTML = `<section class="view"><div class="view-head"><h1>Test · Sprechen (opcional)</h1></div>
    <div class="card"><h2>${esc(c.titulo)}</h2><p class="de">${esc(c.consigna_de)}</p><p class="muted small">${esc(c.consigna_es)}</p>
      <div id="recw"></div><div id="res"></div>
      <div class="plays" style="margin-top:12px"><button class="btn" id="saltar">Saltar este paso</button><button class="btn primary" id="sig" disabled>Seguir →</button></div></div></section>`;
  if (stt.estado.soportado) stt.cargar().catch(() => {});
  recordWidget($("#recw"), { maxSec: 60, target: c.duracion_s, onDone: async (g) => {
    $("#res").innerHTML = `<p><span class="spinner"></span>Reconociendo…${stt.estado.cargado ? "" : " (la primera vez baja el reconocedor, ~75 MB)"}</p>`;
    try {
      const r = await stt.transcribir(g.pcm);
      datos.transkript = r.texto;
      datos.segundos = g.segundos;
      $("#res").innerHTML = `<p class="de">${esc(r.texto || "(no se escuchó nada)")}</p><p class="muted small">Transcripción provisoria del celular.</p>`;
    } catch (e) { $("#res").innerHTML = avisoHTML(e); }
    $("#sig").disabled = false;
  } });
  $("#saltar").onclick = () => { delete datos.transkript; onNext(); };
  $("#sig").onclick = onNext;
}

async function pasoFinal(datos) {
  const conIA = await ia.listo();
  app.innerHTML = `<section class="view"><div class="view-head"><h1>Tu perfil</h1></div><div class="card" id="fin">
    <p><span class="spinner"></span>${conIA ? "El tutor está mirando tus respuestas (unos 20 segundos, ~5 centavos)…" : "Armando tu perfil con lo que contestaste…"}</p></div></section>`;
  try {
    const r = await test.evaluar(datos);
    usarPerfil(r.perfil);
    await seeds.asegurar();
    const p = r.perfil;
    $("#fin").innerHTML = `<div class="ok">✓ Listo, ${esc(p.nombre)}.</div>
      <p>${esc(r.comentario)}</p>${r.plan_arranque ? `<p class="muted">${esc(r.plan_arranque)}</p>` : ""}
      <dl class="levels">${Object.entries(perfilMod.HABILIDADES).map(([k, l]) => `<dt>${l}</dt><dd>${esc(p.niveles[k])}</dd>`).join("")}</dl>
      <p class="small muted">Camino a ${esc(p.meta)}: ${Math.round(p.progreso_b1)} %.</p>
      ${conIA ? `<p>El siguiente paso es pedirle al tutor el primer lote de ejercicios (palabras, audios, dictados y consignas para ~3 días).</p>
        <a class="btn primary big" href="#/enviar">Pedir el primer lote →</a>` : `<p>Para que el tutor corrija y arme ejercicios hace falta tu clave de API de Claude.</p>
        <a class="btn primary big" href="#/ia">Cargar la clave →</a>`}
      <p></p><a class="btn" href="#/">Ir a Heute</a>`;
  } catch (e) {
    $("#fin").innerHTML = `${avisoHTML(e)}<p class="muted small">Podés reintentar o seguir sin IA (el perfil se estima en el celular).</p>
      <div class="plays"><button class="btn primary" id="re">Reintentar</button><button class="btn" id="sin">Seguir sin IA</button></div>`;
    $("#re").onclick = () => pasoFinal(datos);
    $("#sin").onclick = async () => { const resumen = test.resumir(datos); await perfilMod.set(test.perfilLocal(datos, resumen)); await seeds.asegurar(); location.hash = "#/"; };
  }
}

export async function inicio() {
  const editar = /editar=1/.test(location.hash);
  const existente = await perfilMod.get();
  if (editar && existente) {
    const datos = { ...existente, _editar: true };
    pasoDatos(datos, async () => {
      const p = { ...existente, nombre: datos.nombre, idiomas: datos.idiomas, meta: datos.meta, temas: datos.temas, idioma_explicaciones: datos.idioma_explicaciones };
      await perfilMod.set(p);
      location.hash = "#/";
    });
    return;
  }
  const datos = { idiomas: { nativo: "español", otros: [] }, temas: [] };
  const pasos = [pasoDatos, pasoLesen, pasoHoeren, pasoSchreiben, pasoSprechen];
  let i = 0;
  const siguiente = () => { i++; if (i < pasos.length) pasos[i](datos, siguiente); else pasoFinal(datos); window.scrollTo(0, 0); };
  pasos[0](datos, siguiente);
  bindPlay();
}
