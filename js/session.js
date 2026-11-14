// Sesión del día (plan guardado en la base: recargar o volver más tarde la retoma) y práctica libre (feed al azar).

import { $, app } from "./dom.js";
import { MODS } from "./labels.js";
import * as heute from "./logica/heute.js";

export const FEED_MODS = [
  { mod: "vokabeln", n: 5, label: "Vokabeln" }, { mod: "hoeren", n: 2, label: "Hören" }, { mod: "diktat", n: 2, label: "Diktat" },
  { mod: "zahlen", n: 4, label: "Zahlen" }, { mod: "vorlesen", n: 2, label: "Vorlesen" },
];
export const SESSION_VIEWS = ["vokabeln", "hoeren", "diktat", "zahlen", "vorlesen", "sprechen", "schreiben", "fertig"];

let session = null;
export const getSession = () => session;
export const clearSession = () => { session = null; };

function desdeBase(s) {
  return { id: s.id, minutos: s.minutos, feed: false, i: s.paso, count: s.hechos, skipped: 0, steps: s.pasos.map((p) => ({ ...p, label: p.label || MODS[p.mod] || p.mod })) };
}

function persist(extra = {}) {
  if (!session || session.feed || !session.id) return Promise.resolve();
  const st = session.steps[session.i];
  return heute.actualizarSesion(session.id, { paso: session.i, hechos: session.count, n_paso: st ? st.n : null, ...extra }).catch(() => {});
}

export function randomStep(not) {
  const opts = FEED_MODS.filter((s) => s.mod !== not);
  return { ...opts[Math.floor(Math.random() * opts.length)] };
}

export async function startSession(minutos) {
  session = desdeBase(await heute.crearSesion(minutos));
  go(session.steps[0].mod);
}

export async function resumeSession() {
  const s = await heute.sesionActiva().catch(() => null);
  session = s ? desdeBase(s) : null;
  return session;
}

export async function continueSession() {
  const s = await resumeSession();
  if (!s) return false;
  if (s.i >= s.steps.length) { session = null; location.hash = "#/fertig"; return true; }
  go(s.steps[s.i].mod);
  return true;
}

export async function cancelSession() {
  const s = session && session.id ? session : await heute.sesionActiva().catch(() => null);
  if (s && s.id) await heute.actualizarSesion(s.id, { estado: "cancelada" }).catch(() => {});
  session = null;
}

export function startFeed() {
  session = { feed: true, steps: [randomStep()], i: 0, count: 0, skipped: 0 };
  go(session.steps[0].mod);
}

export function go(mod) {
  if (location.hash === "#/" + mod) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#/" + mod;
}

export function nextStep(skipped = false) {
  if (!session) return;
  session.skipped = skipped ? session.skipped + 1 : 0;
  if (session.feed) {
    if (session.skipped > 4) { session = null; location.hash = "#/"; return; }
    session.steps.push(randomStep(session.steps[session.i].mod));
  }
  session.i++;
  session.count = 0;
  if (session.i >= session.steps.length) {
    const done = session;
    session = null;
    if (done.id) heute.actualizarSesion(done.id, { paso: done.i, hechos: 0, estado: "completa" }).catch(() => {});
    location.hash = "#/fertig";
  } else {
    persist();
    go(session.steps[session.i].mod);
  }
}

export function currentStep(mod) {
  if (!session || session.steps[session.i].mod !== mod) return null;
  return session.steps[session.i];
}

export function itemDone(mod) {
  if (!currentStep(mod)) return false;
  session.count++;
  if (session.count >= session.steps[session.i].n) { nextStep(); return true; }
  persist();
  updateSessionBar();
  return false;
}

export function skipIfSession() {
  if (!session) return false;
  nextStep(true);
  return true;
}

export function setProgress(mod, n, count) {
  const st = currentStep(mod);
  if (!st) return;
  st.n = n;
  session.count = count;
  persist();
  updateSessionBar();
}

export function sessionBarHTML() {
  if (!session) return "";
  const st = session.steps[session.i];
  if (session.feed) {
    return `<div class="sessionbar"><div class="row"><span>Práctica libre · ${st.label}</span><span>${session.count}/${st.n}</span></div>
      <div class="progress"><i style="width:${(100 * session.count) / st.n}%"></i></div></div>`;
  }
  const total = session.steps.reduce((a, s) => a + s.n, 0);
  const done = session.steps.slice(0, session.i).reduce((a, s) => a + s.n, 0) + session.count;
  return `<div class="sessionbar"><div class="row"><span>Sesión de ${session.minutos} min · ${st.label} ${session.count}/${st.n}</span>
    <span>paso ${session.i + 1} de ${session.steps.length}</span></div>
    <div class="progress"><i style="width:${(100 * done) / total}%"></i></div></div>`;
}

export function updateSessionBar() {
  const el = $(".sessionbar");
  if (el) el.outerHTML = sessionBarHTML();
}

export function frame(title, inner) {
  app.innerHTML = `${sessionBarHTML()}<section class="view">
    <div class="view-head"><a href="#/" class="back">← Heute</a><h1>${title}</h1></div>${inner}</section>`;
}

export function routeChanged(name) {
  if (session && !SESSION_VIEWS.includes(name)) session = null;
  if (session && name !== "fertig" && session.steps[session.i].mod !== name) session = null;
}
