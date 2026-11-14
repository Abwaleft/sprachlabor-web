// Utilidades de DOM y formato compartidas por todas las vistas.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const app = $("#app");

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function normalize(s) {
  return s.trim().replace(/\s+/g, " ");
}

export function fmtDate(iso) {
  if (!iso) return "nunca";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtSec(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const umlautBar = () => `<div class="umlauts">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"]
  .map((c) => `<button type="button" class="key" data-k="${c}">${c}</button>`).join("")}</div>`;

/** Botones de diéresis: insertan la letra en el campo #ein sin robarle el foco. */
export function bindUmlauts() {
  $$("[data-k]").forEach((b) => {
    b.onpointerdown = (e) => e.preventDefault();
    b.onclick = () => {
      const el = $("#ein");
      if (!el || el.disabled) return;
      el.setRangeText(b.dataset.k, el.selectionStart, el.selectionEnd, "end");
      el.focus();
    };
  });
}

export const emptyCard = (msg) => `<div class="card center"><p>${msg}</p>
  <a class="btn primary" href="#/enviar">Enviar al tutor</a> <a class="btn" href="#/">Volver</a></div>`;
