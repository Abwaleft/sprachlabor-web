// Repetición espaciada: variante de SM-2 con 4 botones.
// 1 = Otra vez · 2 = Difícil · 3 = Bien · 4 = Fácil. Las tarjetas vencen a las 4:00 del día que toca.

import { isoLocal } from "../datos/tiempo.js";

export const GRADOS = [1, 2, 3, 4];
export const ETIQUETAS_GRADO = { 1: "Otra vez", 2: "Difícil", 3: "Bien", 4: "Fácil" };

export function review(card, grade, now = new Date()) {
  let ease = +card.ease || 2.5;
  let interval = +card.interval || 0;
  let reps = +card.reps || 0;
  let lapses = +card.lapses || 0;
  let due;
  if (grade <= 1) {
    if (reps > 0) lapses += 1;
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    due = new Date(now.getTime() + 10 * 60000);
  } else {
    if (reps === 0) interval = { 2: 1, 3: 1, 4: 3 }[grade];
    else if (reps === 1) interval = { 2: 2, 3: 3, 4: 6 }[grade];
    else if (grade === 2) interval = Math.max(interval + 1, interval * 1.2);
    else if (grade === 3) interval = Math.max(interval + 1, interval * ease);
    else interval = Math.max(interval + 2, interval * ease * 1.3);
    ease = Math.max(1.3, ease + { 2: -0.15, 3: 0, 4: 0.15 }[grade]);
    reps += 1;
    due = new Date(now.getTime() + Math.round(interval) * 86400000);
    due.setHours(4, 0, 0, 0);
  }
  return { ease: Math.round(ease * 1000) / 1000, interval: Math.round(interval * 100) / 100, reps, lapses, due: isoLocal(due) };
}

/** Palabra nueva (sin estado todavía). */
export const nuevaTarjeta = () => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: null, introduced: null, last_review: null });
