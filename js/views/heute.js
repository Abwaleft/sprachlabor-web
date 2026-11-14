// Heute: la entrada única. ¿Cuánto tiempo tenés? → plan del día con un botón grande; si hay sesión a medias, «Seguir».
// Práctica libre, tutor y perfil quedan plegados abajo.

import { $, $$, app, esc, fmtDate } from "../dom.js";
import { avisoHTML } from "../errores.js";
import * as ia from "../ia/ia.js";
import { setKeys, typing } from "../keys.js";
import { HABILIDADES } from "../labels.js";
import * as db from "../datos/db.js";
import { diasEntre, hoy } from "../datos/tiempo.js";
import * as envioMod from "../logica/envio.js";
import * as estado from "../logica/estado.js";
import * as heuteMod from "../logica/heute.js";
import * as opciones from "../logica/opciones.js";
import { cancelSession, continueSession, startSession } from "../session.js";
import * as tts from "../voz/tts.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaLarga(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`;
}
const hora = (iso) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export function planResumen(p) {
  return p.pasos.map((s) => {
    if (s.mod !== "vokabeln") return `${s.label} ${s.n}`;
    const partes = [];
    if (s.repasos) partes.push(`${s.repasos} ${s.repasos === 1 ? "repaso" : "repasos"}`);
    if (s.nuevas) partes.push(`${s.nuevas} ${s.nuevas === 1 ? "nueva" : "nuevas"}`);
    return `Vokabeln ${partes.join(" + ")}`;
  }).join(" · ");
}

function planesHTML(planes) {
  if (!planes.some((p) => p.pasos.length)) {
    return `<section class="card center"><p>No hay nada para practicar todavía.</p><a class="btn primary" href="#/enviar">Pedirle contenido al tutor</a></section>`;
  }
  return `<section class="card"><h2>¿Cuánto tiempo tenés?</h2>
    <div class="planes">${planes.map((p, i) => `<button class="plan-btn" data-min="${p.minutos}" ${p.pasos.length ? "" : "disabled"}>
      <b>${p.minutos} min</b><span>${esc(planResumen(p)) || "—"}</span><small>~${p.estimado_min} min · tecla ${i + 1}</small></button>`).join("")}</div>
    <div id="herr"></div></section>`;
}

function seguirHTML(s) {
  const st = s.pasos[s.paso];
  const total = s.pasos.reduce((a, p) => a + p.n, 0);
  const done = s.pasos.slice(0, s.paso).reduce((a, p) => a + p.n, 0) + s.hechos;
  return `<section class="card seguir"><h2>Sesión de ${s.minutos} min en curso</h2>
    <p class="muted">${st ? `Paso ${s.paso + 1} de ${s.pasos.length} · ${esc(st.label)} ${s.hechos}/${st.n}` : "Último paso terminado"} · última actividad ${esc(hora(s.updated))}</p>
    <div class="progress" style="margin-bottom:12px"><i style="width:${total ? (100 * done) / total : 100}%"></i></div>
    <button class="btn primary big" id="seguir">Seguir ▶ <span class="muted small" style="color:inherit;opacity:.8">(Enter)</span></button>
    <p class="small" style="margin:10px 0 0"><a href="#" id="cancelar">Cancelar esta sesión y elegir otro tiempo</a></p>
    <div id="herr"></div></section>`;
}

async function avisos(s) {
  const out = [];
  if (!(await ia.listo())) out.push(`<div class="note">Sin clave de API todavía: los ejercicios funcionan, pero el tutor no puede corregir ni armar lotes nuevos. <a href="#/ia">Cargar la clave</a>.</div>`);
  if (!(await tts.vozLista())) out.push(`<div class="note">La voz alemana (63 MB) todavía no está bajada: mientras tanto se usa la voz del sistema. <a href="#/datos">Bajar la voz</a>.</div>`);
  const op = await opciones.get();
  const ultima = (await db.kvGet("ultima_copia")) || (await db.kvGet("ultima_copia_buzon"));
  const primerDia = (s.hoy || 0) + (s.pendientes || 0) > 0;
  if (op.recordar_copia_dias && primerDia && (!ultima || diasEntre(ultima.slice(0, 10), hoy()) >= op.recordar_copia_dias)) {
    out.push(`<div class="note">${ultima ? `Hace ${diasEntre(ultima.slice(0, 10), hoy())} días que no hacés una copia de seguridad.` : "Todavía no hiciste ninguna copia de seguridad de tus datos."} <a href="#/datos">Hacer una copia</a>.</div>`);
  }
  return out.join("");
}

export async function heute() {
  const [h, s] = await Promise.all([heuteMod.resumen(), estado.status()]);
  const p = s.perfil || {};
  const v = s.vokabeln;
  const ses = h.sesion;
  const planes = ["5", "10", "20"].map((m) => h.planes[m]);
  const racha = h.racha ? `🔥 Racha: ${h.racha} ${h.racha === 1 ? "día" : "días"}` : "Sin racha todavía";
  const hoyTxt = h.hoy ? `hoy ya hiciste ${h.hoy} ${h.hoy === 1 ? "ejercicio" : "ejercicios"}` : "hoy todavía nada";
  const tile = (mod, title, num, sub) => `<a class="tile" href="#/${mod}"><b>${title}</b><div class="num">${num}</div><div class="muted small">${sub}</div></a>`;
  const env = envioMod.status();
  const saludo = p.nombre ? `Hallo, ${esc(p.nombre.split(/\s+/)[0])}!` : "Heute";

  app.innerHTML = `
  <section class="card hero heute">
    <div><div class="meta">${esc(fechaLarga(h.fecha))} · día de ${h.escribir ? "escribir" : "hablar"}</div>
      <h1>${saludo}</h1>
      <p class="muted">${racha} · ${hoyTxt}.</p>
      ${p.progreso_b1 != null ? `<div class="small muted">Camino a ${esc(p.meta || "B1")}: ${Math.round(p.progreso_b1)} %</div>
      <div class="progress" style="max-width:260px"><i style="width:${p.progreso_b1}%"></i></div>` : ""}
    </div>
  </section>
  <div id="avisos">${await avisos(s)}</div>
  ${ses ? seguirHTML(ses) : planesHTML(planes)}
  <details class="card libre"><summary>Práctica libre, tutor y tu perfil</summary>
    <div class="grid" style="margin-top:12px">
      ${tile("vokabeln", "Vokabeln", v.faellig + v.neu_hoy, `${v.faellig} para repasar · ${v.neu_hoy} nuevas`)}
      ${tile("hoeren", "Hören", s.hoeren.frescos, `sin escuchar (de ${s.hoeren.total})`)}
      ${tile("diktat", "Diktat", s.diktat.frescos, `sin hacer (de ${s.diktat.total})`)}
      ${tile("zahlen", "Zahlen", "∞", "números, precios, horas, fechas")}
      ${tile("schreiben", "Schreiben", s.schreiben.frescos, `consignas nuevas (de ${s.schreiben.total})`)}
      ${tile("sprechen", "Sprechen", s.sprechen.frescos, `consignas nuevas (de ${s.sprechen.total})`)}
      ${tile("vorlesen", "Vorlesen", s.vorlesen.frescos || "∞", "leer en voz alta y ver qué se entiende")}
      ${tile("rueckmeldung", "Rückmeldung", s.sin_corregir, s.sin_corregir === 1 ? "texto sin corregir" : "textos sin corregir")}
    </div>
    <h2>Tutor</h2>
    <p class="muted small">Último envío: ${fmtDate(s.ultimo_envio)} · ${s.pendientes} intentos sin enviar · ${v.sin_ver} palabras sin ver</p>
    ${env.running ? `<p><span class="spinner"></span>${esc(env.stage)}…</p>` : ""}
    <p><a class="btn primary" href="#/enviar">Enviar al tutor</a>
    ${s.ultimo_envio ? `<a class="btn" href="#/rueckmeldung">Rückmeldung</a>` : ""}
    <a class="btn" href="#/estadisticas">Estadísticas</a>
    <a class="btn" href="#/datos">💾 Datos</a></p>
    ${perfilCard(p)}
  </details>`;

  const fallo = (e) => { const el = $("#herr"); if (el) el.innerHTML = avisoHTML(e); };
  const empezar = async (min) => {
    $$(".plan-btn").forEach((b) => (b.disabled = true));
    try { await startSession(min); } catch (e) { $$(".plan-btn").forEach((b) => (b.disabled = false)); fallo(e); }
  };
  $$(".plan-btn").forEach((b) => (b.onclick = () => empezar(+b.dataset.min)));
  if (ses) {
    $("#seguir").onclick = async () => { try { if (!(await continueSession())) heute(); } catch (e) { fallo(e); } };
    $("#cancelar").onclick = async (e) => { e.preventDefault(); await cancelSession(); heute(); };
  }
  setKeys((e) => {
    if (typing()) return;
    if (ses) { if (e.key === "Enter") $("#seguir").click(); return; }
    const min = { 1: 5, 2: 10, 3: 20 }[e.key];
    if (min && planes.find((p) => p.minutos === min && p.pasos.length)) empezar(min);
  });
}

export function perfilCard(p) {
  if (!p || !p.niveles) return "";
  const pats = [...(p.patrones || [])].sort((a, b) => b.peso - a.peso);
  return `<section class="card" style="margin:14px 0 0"><h2>Tu perfil <span class="muted small">(${esc(p.fecha || "")})</span></h2>
    <dl class="levels">${Object.entries(HABILIDADES).map(([k, l]) => `<dt>${l}</dt><dd>${esc(p.niveles[k])}</dd>`).join("")}</dl>
    <h2>Qué practicar primero</h2>
    ${pats.map((x) => `<div class="pat"><div>${x.patron}. ${esc(x.nombre || "")}${x.nota ? ` <span class="muted small">— ${esc(x.nota)}</span>` : ""}</div>
      <div class="bar"><i style="width:${Math.round((x.peso || 0) * 100)}%"></i></div></div>`).join("")}
    <p class="small muted" style="margin-top:10px">Temas: ${(p.temas || []).map(esc).join(" · ")} · <a href="#/inicio?editar=1">Editar perfil</a></p>
  </section>`;
}
