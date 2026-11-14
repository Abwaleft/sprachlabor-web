// ⚙ Opciones: números ajustables y nivel de las consignas.
// Al agregar un número nuevo: logica/opciones.js (DEFS) y OPCIONES_UI acá.

import { $, esc } from "../dom.js";
import * as niveles from "../logica/niveles.js";
import * as opciones from "../logica/opciones.js";
import { frame } from "../session.js";

export const OPCIONES_UI = [
  { titulo: "Vokabeln", items: [
    ["nuevas_por_dia", "Palabras nuevas por día", "Base del cupo diario de palabras nuevas."],
    ["restar_por_otra_vez", "Nuevas que resta cada «Otra vez» en un repaso", "Si fallás repasos, todavía estás aprendiendo esas: cada «Otra vez» en un repaso baja el cupo de nuevas de hoy. 0 = no resta."],
    ["lugar_reinsercion", "Lugar al que vuelve un repaso fallado", "Un repaso con «Otra vez» vuelve al final de la cola, o a este lugar si la cola es más larga."],
  ] },
  { titulo: "Sesión de hoy", nota: "Cuántos ejercicios de cada tipo. Vokabeln no tiene número: hace todos los repasos y las nuevas del día. Con 0, ese tipo no entra en la sesión.", items: [
    ["sesion_hoeren", "Hören", "Todos los días."], ["sesion_schreiben", "Schreiben", "Día de escribir (día por medio)."], ["sesion_zahlen", "Zahlen", "Día de escribir (día por medio)."],
    ["sesion_vorlesen", "Vorlesen", "Día de hablar (día por medio)."], ["sesion_sprechen", "Sprechen", "Día de hablar (día por medio)."], ["sesion_diktat", "Diktat", "Día de hablar (día por medio)."],
  ] },
  { titulo: "Tutor y copias", items: [
    ["dias_lote", "Días de práctica por envío", "Cuánto contenido pide cada envío al tutor (más días = envío más caro, menos envíos)."],
    ["recordar_copia_dias", "Recordar la copia de seguridad cada (días)", "Heute avisa cuando pasan estos días sin una copia. 0 = no avisar."],
  ] },
];

export async function opcionesView() {
  const valores = await opciones.get();
  const defaults = opciones.defaults();
  const rangos = opciones.rangos();
  const actual = await niveles.resumen();
  const sel = (tipo, label) => `<div class="optrow"><label for="n-${tipo}">${label}</label>
    <select id="n-${tipo}" class="nsel">${niveles.NIVELES.map((n) => `<option ${n === actual[tipo] ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
  const row = ([k, label, help]) => {
    const [lo, hi] = rangos[k];
    return `<div class="optrow"><label for="o-${k}">${esc(label)}</label>
      <input id="o-${k}" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${valores[k]}">
      <div class="muted small">${esc(help)} <span class="small">(${lo}–${hi}; por defecto ${defaults[k]})</span></div></div>`;
  };
  frame("Opciones", `
    ${OPCIONES_UI.map((g) => `<section class="card opt-group"><h2>${g.titulo}</h2>${g.nota ? `<p class="muted small">${esc(g.nota)}</p>` : ""}${g.items.map(row).join("")}</section>`).join("")}
    <section class="card opt-group"><h2>Nivel de las consignas</h2>
      <p class="muted small">Se ajusta solo con la dificultad que marcás después de cada Schreiben y Sprechen (Muy difícil −1 · Difícil = · Bien +½ · Fácil +1) y lo decide el tutor al corregir. Acá lo podés corregir a mano.</p>
      ${sel("schreiben", "Schreiben")}${sel("sprechen", "Sprechen")}
    </section>
    <button class="btn primary" id="guardar">Guardar</button>
    <button class="btn" id="defecto">Volver a los valores por defecto</button>
    <div id="res"></div>
    <p class="muted small" style="margin-top:16px">La clave de API y el modelo están en <a href="#/ia">Ajustes de IA</a>; copias, importar, buzón y voz en <a href="#/datos">Datos</a>.</p>`);
  const leer = () => Object.fromEntries(OPCIONES_UI.flatMap((g) => g.items).map(([k]) => [k, $(`#o-${k}`).value]));
  const guardar = async (v) => {
    try {
      await opciones.guardar(v);
      for (const t of ["schreiben", "sprechen"]) { const n = $(`#n-${t}`).value; if (n !== actual[t]) { await niveles.setObjetivo(t, niveles.aNumero(n)); actual[t] = n; } }
      $("#res").innerHTML = `<div class="ok">✓ Guardado. Se aplica desde la próxima sesión o cola de Vokabeln.</div>`;
    } catch (e) {
      let msg = e.message;
      OPCIONES_UI.flatMap((g) => g.items).forEach(([k, label]) => { msg = msg.replace(k, `«${label}»`); });
      $("#res").innerHTML = `<div class="bad">${esc(msg)}</div>`;
    }
  };
  $("#guardar").onclick = () => guardar(leer());
  $("#defecto").onclick = () => {
    if (!confirm("¿Volver todas las opciones a los valores por defecto?")) return;
    Object.entries(defaults).forEach(([k, v]) => { const el = $(`#o-${k}`); if (el) el.value = v; });
    guardar(defaults);
  };
}
