// Errores en lenguaje claro.

import { esc } from "./dom.js";

export function mensaje(e) {
  if (!e) return "Algo falló.";
  if (e.name === "ErrorIA" || e.name === "ErrorGitHub" || e.name === "NoExiste") return e.message;
  const txt = e.message ? e.message : String(e);
  if (e instanceof TypeError && /fetch|network/i.test(txt)) return "No hay conexión a internet (o el servidor no responde).";
  if (e.name === "QuotaExceededError") return "El navegador no tiene más espacio para guardar datos. Borrá audios en «Datos» o liberá espacio en el celular.";
  return txt.replace(/^\d{3}: /, "");
}

/** Tarjeta de error con botón de reintentar (el que la muestra conecta #retry). */
export const errorHTML = (e, titulo = "Algo falló") => `<div class="card error">
  <div class="bad">${esc(titulo)}</div>
  <p>${esc(mensaje(e))}</p>
  <div class="plays"><button class="btn primary" id="retry">↻ Reintentar</button><a class="btn" href="#/">Heute</a></div>
</div>`;

export const avisoHTML = (e) => `<div class="bad">${esc(mensaje(e))}</div>`;
