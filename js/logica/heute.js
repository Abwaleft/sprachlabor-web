// «Heute»: plan del día según el tiempo disponible, y la sesión en curso (guardada: recargar la retoma).
//
// Plan (5, 10 o 20 min): Vokabeln primero (TODOS los repasos vencidos y nuevas hasta la mitad del tiempo);
// después bloques por prioridad mientras quede tiempo. Días pares «de escribir», impares «de hablar».
// Cantidades de ⚙ Opciones, a la mitad con 5 min y al doble con 20. Schreiben y Sprechen una vez por día y no en 5 min.
// Un bloque entra si queda al menos el 60 % de su costo. Lo que no tiene contenido no entra.

import * as db from "../datos/db.js";
import { ahora, hoy, ordinal } from "../datos/tiempo.js";
import { hechosHoy, itemsDeTipo, racha } from "./intentos.js";
import * as opciones from "./opciones.js";
import * as vokabeln from "./vokabeln.js";

export const MINUTOS = [5, 10, 20];
export const COSTO_S = { vokabeln: 20, hoeren: 60, diktat: 60, zahlen: 25, vorlesen: 45, sprechen: 150, schreiben: 360 };
export const ETIQUETAS = { vokabeln: "Vokabeln", hoeren: "Hören", diktat: "Diktat", zahlen: "Zahlen", vorlesen: "Vorlesen", sprechen: "Sprechen", schreiben: "Schreiben" };
const ORDEN_ESCRIBIR = ["hoeren", "schreiben", "zahlen", "diktat", "vorlesen", "sprechen"];
const ORDEN_HABLAR = ["hoeren", "vorlesen", "sprechen", "diktat", "zahlen", "schreiben"];
const UNA_VEZ_POR_DIA = ["schreiben", "sprechen"];
const FACTOR = { 5: 0.5, 10: 1, 20: 2 };
const UMBRAL = 0.6;

export const escribirHoy = (dia = hoy()) => ordinal(dia) % 2 === 0;

async function contexto(dia) {
  const palabras = await vokabeln.todas();
  const op = await opciones.get();
  const items = {};
  for (const t of ["hoeren", "diktat", "vorlesen", "schreiben", "sprechen"]) items[t] = (await itemsDeTipo(t)).length;
  return { palabras, op, items, hechos: await hechosHoy(dia), presupuesto: await vokabeln.presupuesto(palabras, op),
    vistas: palabras.filter((w) => w.introduced).length, dia };
}

export function planCon(ctx, minutos) {
  const { palabras, op, items, hechos, presupuesto, vistas, dia } = ctx;
  const total = minutos * 60;
  const { repasos, aprendiendo, sinVer } = vokabeln.colas(palabras, ahora(), dia);
  const disponibles = aprendiendo.length + Math.min(presupuesto.quedan, sinVer.length);
  const c = COSTO_S.vokabeln;
  const libre = Math.max(0, Math.floor(total / 2) - repasos.length * c);
  const nuevas = Math.min(disponibles, Math.floor(libre / c));
  const pasos = [];
  if (repasos.length + nuevas) pasos.push({ mod: "vokabeln", n: repasos.length + nuevas, repasos: repasos.length, nuevas, segundos: (repasos.length + nuevas) * c });
  let restante = total - (repasos.length + nuevas) * c;
  const hayVorlesen = !!(items.vorlesen || items.diktat || vistas);
  const factor = FACTOR[minutos];
  for (const mod of (escribirHoy(dia) ? ORDEN_ESCRIBIR : ORDEN_HABLAR)) {
    const base = op[`sesion_${mod}`] || 0;
    if (base <= 0) continue;
    if (UNA_VEZ_POR_DIA.includes(mod) && (hechos[mod] || minutos <= 5)) continue;
    if ((mod === "hoeren" || mod === "diktat") && !items[mod]) continue;
    if (mod === "vorlesen" && !hayVorlesen) continue;
    if ((mod === "schreiben" || mod === "sprechen") && !items[mod]) continue;
    const costo = COSTO_S[mod];
    if (restante < costo * UMBRAL) continue;
    let n = UNA_VEZ_POR_DIA.includes(mod) ? 1 : Math.max(1, Math.round(base * factor));
    n = Math.min(n, Math.max(1, Math.floor(restante / costo)));
    pasos.push({ mod, n, segundos: n * costo });
    restante -= n * costo;
  }
  for (const p of pasos) p.label = ETIQUETAS[p.mod];
  return { minutos, escribir: escribirHoy(dia), pasos, estimado_min: Math.max(1, Math.round(pasos.reduce((a, p) => a + p.segundos, 0) / 60)) };
}

export async function plan(minutos, dia = hoy()) {
  if (!MINUTOS.includes(minutos)) throw new Error("minutos: 5 / 10 / 20");
  return planCon(await contexto(dia), minutos);
}

// ---------- sesión persistida ----------

export async function sesionActiva(dia = hoy()) {
  const activas = await db.porIndice("sesiones", "estado", "activa");
  let actual = null;
  for (const s of activas) {
    if (s.fecha !== dia) { s.estado = "vencida"; s.updated = ahora(); await db.put("sesiones", s); }
    else if (!actual || s.id > actual.id) actual = s;
  }
  return actual;
}

export async function crearSesion(minutos, dia = hoy()) {
  const p = await plan(minutos, dia);
  if (!p.pasos.length) throw new Error("No hay nada para practicar: pedile contenido al tutor (Enviar).");
  const t = ahora();
  for (const s of await db.porIndice("sesiones", "estado", "activa")) { s.estado = "cancelada"; s.updated = t; await db.put("sesiones", s); }
  const s = { fecha: dia, minutos, pasos: p.pasos, paso: 0, hechos: 0, estado: "activa", created: t, updated: t };
  s.id = await db.add("sesiones", s);
  return s;
}

export async function actualizarSesion(id, { paso = null, hechos = null, n_paso = null, estado = null } = {}) {
  const s = await db.get("sesiones", id);
  if (!s) throw new Error("sesión inexistente");
  if (paso != null) s.paso = Math.max(0, Math.min(paso, s.pasos.length));
  if (hechos != null) s.hechos = Math.max(0, hechos);
  if (n_paso != null && s.paso < s.pasos.length) s.pasos[s.paso].n = Math.max(1, n_paso);
  if (estado) s.estado = estado;
  else if (s.paso >= s.pasos.length) s.estado = "completa";
  s.updated = ahora();
  await db.put("sesiones", s);
  return s;
}

export async function resumen(dia = hoy()) {
  const ctx = await contexto(dia);
  const total = Object.values(ctx.hechos).reduce((a, b) => a + b, 0);
  return { fecha: dia, escribir: escribirHoy(dia), racha: await racha(dia), hoy: total, hechos_hoy: ctx.hechos,
    planes: Object.fromEntries(MINUTOS.map((m) => [String(m), planCon(ctx, m)])), sesion: await sesionActiva(dia) };
}
