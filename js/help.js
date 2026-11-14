// Ayuda de atajos de teclado: tecla ? (o el botón ? de arriba). Esc la cierra.

import { $, esc } from "./dom.js";
import { typing } from "./keys.js";

export const ATAJOS = {
  "": [["1 · 2 · 3", "Empezar la sesión de 5 / 10 / 20 min"], ["Enter", "Seguir la sesión en curso"]],
  vokabeln: [["Enter", "Mostrar la palabra"], ["1 – 4", "Otra vez · Difícil · Bien · Fácil"]],
  hoeren: [["Enter", "Siguiente (después de responder)"]],
  diktat: [["Enter", "Corregir; después, Siguiente"], ["Shift + Enter", "Salto de línea"]],
  zahlen: [["Enter", "Comprobar; después, Siguiente"]],
  schreiben: [["1 – 4", "Dificultad (después de guardar)"]],
  sprechen: [["1 – 4", "Dificultad (después de grabar)"]],
  datos: [], enviar: [], inicio: [],
};
const GLOBALES = [["?", "Esta ayuda"], ["Esc", "Cerrar la ayuda"]];

export function closeHelp() {
  const o = $(".overlay");
  if (o) o.remove();
}

export function toggleHelp() {
  if ($(".overlay")) { closeHelp(); return; }
  const name = location.hash.replace(/^#\/?/, "");
  const filas = [...(ATAJOS[name] || []), ...GLOBALES];
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="card" role="dialog" aria-label="Atajos de teclado"><h2>Atajos de teclado</h2>
    <table class="tbl">${filas.map(([k, t]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(t)}</td></tr>`).join("")}</table>
    <p class="muted small" style="margin:10px 0 0">Los atajos de una tecla no actúan mientras escribís en un campo.</p>
    <button class="btn block" id="cerrar-ayuda" style="margin-top:10px">Cerrar</button></div>`;
  o.onclick = (e) => { if (e.target === o || e.target.id === "cerrar-ayuda") closeHelp(); };
  document.body.appendChild(o);
}

export function initHelp() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !typing()) { e.preventDefault(); toggleHelp(); }
    else if (e.key === "Escape") closeHelp();
  });
  const b = $("#ayuda");
  if (b) b.onclick = toggleHelp;
  window.addEventListener("hashchange", closeHelp);
}
