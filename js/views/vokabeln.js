// Vokabeln (repetición espaciada). Cola: primero TODOS los repasos vencidos; «Otra vez» en un repaso vuelve al final
// (o al lugar N de ⚙ Opciones) y resta nuevas del día; después las nuevas.

import { bindPlay, play, playButtons } from "../audio.js";
import { $, $$, bindUmlauts, esc, normalize, umlautBar } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { clearKeys, setKeys } from "../keys.js";
import * as vok from "../logica/vokabeln.js";
import { currentStep, frame, nextStep, setProgress, skipIfSession } from "../session.js";
import * as tts from "../voz/tts.js";

export async function vokabeln() {
  const q = await vok.queue();
  const rep = q.repasos;
  const nue = q.nuevas;
  const plan = currentStep("vokabeln");
  if (plan && plan.nuevas != null) nue.splice(plan.nuevas);
  let budget = q.presupuesto;
  let done = 0;
  let card;
  let fase;
  let revealed;
  // audios de las próximas tarjetas en segundo plano
  tts.pregenerar([...rep, ...nue].slice(0, 12).flatMap((c) => [c.texto, c.beispiel_de]));

  const inSession = () => !!currentStep("vokabeln");
  const progress = () => { if (inSession()) setProgress("vokabeln", Math.max(1, done + rep.length + nue.length + (card && !revealed ? 1 : 0)), done); };
  const trimNew = () => {
    let excess = nue.filter((c) => c.neu && !c.shown).length - budget.quedan;
    for (let k = nue.length - 1; k >= 0 && excess > 0; k--) if (nue[k].neu && !nue[k].shown) { nue.splice(k, 1); excess--; }
  };
  const budgetNote = () => {
    const b = budget;
    const penal = b.otra_vez_repaso_hoy * b.resta;
    return `Nuevas hoy: base ${b.base} − ${b.vistas_hoy} ya vistas${penal ? ` − ${penal} por ${b.otra_vez_repaso_hoy} «Otra vez» en repasos` : ""} = <b>${b.quedan}</b> por ver`;
  };
  const finish = () => { if (inSession()) { nextStep(); return; } location.hash = "#/"; };

  if (!rep.length && !nue.length) {
    if (skipIfSession()) return;
    frame("Vokabeln", `<div class="card center"><p>No hay repasos pendientes ni palabras nuevas por ahora.</p>
      <p class="muted small">${budgetNote()}${budget.quedan && !q.nuevas.length ? " · no quedan palabras sin ver: <a href='#/enviar'>pedile más al tutor</a>" : ""}</p>
      <a class="btn" href="#/">Volver</a></div>`);
    return;
  }

  const show = () => {
    fase = rep.length ? "repaso" : "nueva";
    card = fase === "repaso" ? rep.shift() : nue.shift();
    revealed = false;
    if (!card) {
      if (inSession()) { nextStep(); return; }
      frame("Vokabeln", `<div class="card center"><p>¡Listo por ahora! 🎉</p><p class="muted small">${budgetNote()}</p><a class="btn primary" href="#/">Volver</a></div>`);
      return;
    }
    card.shown = true;
    const nRep = rep.length + (fase === "repaso" ? 1 : 0);
    const nNue = nue.length + (fase === "nueva" ? 1 : 0);
    frame("Vokabeln", `
      <div class="vq muted small"><span>Repasos: <b>${nRep}</b></span><span>Nuevas: <b>${nNue}</b></span>
        <button class="btn sm" id="fin">Terminar Vokabeln →</button></div>
      <div class="card">
        <div class="meta">${fase === "repaso" ? "repaso" : card.neu ? '<span class="tag">nueva</span>' : "aprendiendo"} · ${esc(card.wortart)}${card.tema ? " · " + esc(card.tema) : ""}</div>
        <div class="prompt">${esc(card.es)}</div>
        <input id="ein" class="input" placeholder="En alemán, con artículo (opcional)" autocomplete="off" autocapitalize="off" spellcheck="false">
        ${umlautBar()}
        <button class="btn primary block" id="rev">Mostrar</button>
        <div id="back"></div>
      </div>
      <p class="muted small center">${budgetNote()}</p>`);
    bindUmlauts();
    progress();
    const ein = $("#ein");
    ein.focus();
    ein.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); reveal(); } };
    $("#rev").onclick = reveal;
    $("#fin").onclick = finish;
  };

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    const typed = normalize($("#ein").value);
    const full = card.texto;
    let korrekt = null;
    let check = "";
    if (typed) {
      korrekt = typed === full;
      if (korrekt) check = `<div class="ok">✓ ¡Exacto!</div>`;
      else if (typed.toLowerCase() === full.toLowerCase()) check = `<div class="note">Casi: ojo con la mayúscula.</div>`;
      else check = `<div class="bad">✗ Escribiste: ${esc(typed)}</div>`;
    }
    $("#rev").remove();
    $("#ein").disabled = true;
    $("#back").innerHTML = `${check}
      <div class="answer">${card.artikel ? `<span class="art art-${card.artikel}">${card.artikel}</span>` : ""}
        <b>${esc(card.wort)}</b><button class="icon" data-tts="${esc(card.texto)}" data-lento="0" title="Escuchar">🔊</button></div>
      ${card.formen ? `<div class="formen">${esc(card.formen)}</div>` : ""}
      <div class="satz"><p class="de">${esc(card.beispiel_de)}</p><p class="muted">${esc(card.beispiel_es)}</p>${playButtons(card.beispiel_de)}</div>
      <p class="muted small">¿Qué tan bien la sabías? (teclas 1–4)</p>
      <div class="grades">
        <button class="btn g1" data-g="1">Otra vez</button><button class="btn g2" data-g="2">Difícil</button>
        <button class="btn g3" data-g="3">Bien</button><button class="btn g4" data-g="4">Fácil</button>
      </div>`;
    bindPlay($("#back"));
    play(card.beispiel_de);
    $$("[data-g]").forEach((b) => (b.onclick = () => grade(+b.dataset.g, typed, korrekt)));
    setKeys((e) => { if (["1", "2", "3", "4"].includes(e.key)) grade(+e.key, typed, korrekt); });
  };

  let busy = false;
  const grade = async (g, typed, korrekt) => {
    if (busy) return;
    busy = true;
    clearKeys();
    let r;
    try {
      r = await vok.review(card.id, g, typed || null, korrekt);
    } catch (e) {
      busy = false;
      const back = $("#back");
      if (back) back.insertAdjacentHTML("afterbegin", avisoHTML(e));
      setKeys((ev) => { if (["1", "2", "3", "4"].includes(ev.key)) grade(+ev.key, typed, korrekt); });
      return;
    } finally { busy = false; }
    budget = r.presupuesto;
    if (g === 1) {
      if (fase === "repaso") rep.splice(Math.min(budget.lugar_reinsercion - 1, rep.length), 0, { ...card });
      else nue.push({ ...card, neu: false });
    }
    trimNew();
    done++;
    show();
  };

  show();
}
