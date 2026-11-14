// Estadísticas sobre todo el historial de intentos (pantalla Estadísticas y export al tutor).
// "7d" = los últimos 7 días EN QUE HUBO PRÁCTICA (no de calendario).
// Acierto por tipo (0–1): vokabeln = Bien/Fácil · hoeren/zahlen = correcta · diktat = puntaje · vorlesen = % reconocido.

import * as db from "../datos/db.js";
import { hoy, lunes, sumarDias } from "../datos/tiempo.js";
import * as niveles from "./niveles.js";
import * as vokabeln from "./vokabeln.js";

export const TIPOS = ["vokabeln", "hoeren", "diktat", "zahlen", "vorlesen", "schreiben", "sprechen_frei"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const acierto = (typ, score, p) => (typ === "vokabeln" ? ((p.grade || 0) >= 3 ? 1 : 0) : score);
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);

function etiquetaSemana(start) {
  const end = sumarDias(start, 6);
  const [, m1, d1] = start.split("-").map(Number);
  const [, m2, d2] = end.split("-").map(Number);
  return m1 === m2 ? `${d1}–${d2} ${MESES[m2 - 1]}` : `${d1} ${MESES[m1 - 1]}–${d2} ${MESES[m2 - 1]}`;
}

function bloque(items) {
  const out = {};
  for (const typ of TIPOS) {
    const sel = items.filter(([t]) => t === typ);
    if (!sel.length) continue;
    const vals = sel.map(([, a]) => a).filter((a) => a != null);
    const d = { intentos: sel.length, acierto: mean(vals) };
    if (typ === "hoeren") {
      const esc = sel.map(([, , p]) => p.escuchas || 0);
      d.escuchas_promedio = Math.round((esc.reduce((a, b) => a + b, 0) / esc.length) * 100) / 100;
      d.acierto_con_1_escucha = mean(sel.map(([, , p]) => (p.ok && (p.escuchas || 0) <= 1 ? 1 : 0)));
    }
    if (typ === "vokabeln") d.nuevas_vistas = sel.filter(([, , p]) => p.nueva).length;
    if (typ === "schreiben" || typ === "sprechen_frei") { d.palabras = sel.reduce((a, [, , p]) => a + (p.palabras || 0), 0); delete d.acierto; }
    if (typ === "sprechen_frei") d.minutos = Math.round((sel.reduce((a, [, , p]) => a + (p.segundos || 0), 0) / 60) * 10) / 10;
    out[typ] = d;
  }
  return out;
}

export async function compute(today = hoy()) {
  const rows = (await db.all("intentos")).sort((a, b) => a.id - b.id);
  const atts = rows.map((r) => [r.ts.slice(0, 10), r.type, acierto(r.type, r.score, r.payload), r.payload]);

  const porDia = {};
  for (const [d] of atts) porDia[d] = (porDia[d] || 0) + 1;
  const actividad = [];
  for (let i = 29; i >= 0; i--) { const d = sumarDias(today, -i); actividad.push({ fecha: d, ejercicios: porDia[d] || 0 }); }
  let racha = 0;
  let d = porDia[today] ? today : sumarDias(today, -1);
  while (porDia[d]) { racha++; d = sumarDias(d, -1); }
  const diasActivos = Object.keys(porDia).sort();

  const semanas = {};
  for (const [dd, t, a, p] of atts) (semanas[lunes(dd)] = semanas[lunes(dd)] || []).push([t, a, p]);
  const porSemana = Object.keys(semanas).sort().map((s) => ({ semana: s, etiqueta: etiquetaSemana(s), ...bloque(semanas[s]) }));

  const rec7 = new Set(diasActivos.slice(-7));
  const ant7 = new Set(diasActivos.slice(-14, -7));
  const ult = atts.filter(([dd]) => rec7.has(dd)).map(([, t, a, p]) => [t, a, p]);
  const ant = atts.filter(([dd]) => ant7.has(dd)).map(([, t, a, p]) => [t, a, p]);
  const comparacion = { ultimos_7_dias_practicados: bloque(ult), "7_dias_practicados_anteriores": bloque(ant),
    dias: { ultimos: [...rec7].sort(), anteriores: [...ant7].sort() } };

  const zahlen = {};
  for (const art of ["zahl", "preis", "uhrzeit", "datum"]) {
    const tot = atts.filter(([, t, , p]) => t === "zahlen" && p.art === art);
    if (!tot.length) continue;
    const rec = tot.filter(([dd]) => rec7.has(dd));
    zahlen[art] = { intentos: tot.length, acierto: mean(tot.map((x) => x[2])), intentos_7d: rec.length, acierto_7d: mean(rec.map((x) => x[2])) };
  }

  const hoerenNivel = {};
  for (const niv of ["A2", "B1"]) {
    const sel = atts.filter(([, t, , p]) => t === "hoeren" && p.niveau === niv);
    if (sel.length) hoerenNivel[niv] = { intentos: sel.length, acierto: mean(sel.map(([, , , p]) => (p.ok ? 1 : 0))) };
  }

  const err = {};
  for (const [dd, t, , p] of atts) {
    if (t !== "diktat") continue;
    for (const e of p.errores || []) {
      const [estado, resto = ""] = e.split(": ");
      const ref = resto.split(" → ")[1];
      if (!ref || ref === "∅") continue;
      const k = `${ref.trim()}|${estado}`;
      err[k] = err[k] || { palabra: ref.trim(), tipo: estado, veces: 0, dias: new Set() };
      err[k].veces++;
      err[k].dias.add(dd);
    }
  }
  const erroresDictado = Object.values(err).filter((e) => e.veces >= 2).sort((a, b) => b.veces - a.veces).slice(0, 12)
    .map((e) => ({ palabra: e.palabra, tipo: e.tipo, veces: e.veces, dias: e.dias.size }));

  const palabras = vokabeln.resumen(await db.all("palabras"));

  const perfilEvo = [];
  for (const e of (await db.all("envios")).sort((a, b) => a.id - b.id)) {
    if (e.status !== "ok" || !e.result || !e.result.perfil) continue;
    const pf = e.result.perfil;
    perfilEvo.push({ fecha: (e.finished || "").slice(0, 10), progreso_b1: pf.progreso_b1, patrones: Object.fromEntries((pf.patrones || []).map((x) => [String(x.patron), x.peso])) });
  }

  const nivelesFb = {};
  const fbs = (await db.all("feedback")).sort((a, b) => a.id - b.id);
  const tipoDe = Object.fromEntries(rows.map((r) => [r.id, r.type]));
  for (const f of fbs) { const n = f.payload.nivel_estimado; const t = tipoDe[f.attempt_id]; if (n && t) (nivelesFb[t] = nivelesFb[t] || []).push(n); }
  const produccion = {};
  for (const typ of ["schreiben", "sprechen_frei"]) {
    const sel = atts.filter(([, t]) => t === typ).map((x) => x[3]);
    if (!sel.length) continue;
    produccion[typ] = { intentos: sel.length, palabras: sel.reduce((a, p) => a + (p.palabras || 0), 0),
      minutos: Math.round((sel.reduce((a, p) => a + (p.segundos || 0), 0) / 60) * 10) / 10, niveles_recientes: (nivelesFb[typ] || []).slice(-5),
      dificultad_reciente: sel.filter((p) => p.dificultad_txt).map((p) => `${p.nivel || "?"}: ${p.dificultad_txt}`).slice(-5) };
  }
  const vl = atts.filter(([, t, a]) => t === "vorlesen" && a != null);
  if (vl.length) produccion.vorlesen = { intentos: vl.length, reconocido: mean(vl.map((x) => x[2])), reconocido_7d: mean(vl.filter(([dd]) => rec7.has(dd)).map((x) => x[2])) };

  return {
    fecha: today, nivel_objetivo: await niveles.resumen(), produccion,
    totales: { intentos: atts.length, dias_activos: diasActivos.length, primer_dia: diasActivos[0] || null, racha_dias: racha, ejercicios_7d: ult.length },
    actividad_30_dias: actividad, por_semana: porSemana, comparacion_semanal: comparacion, zahlen_por_tipo: zahlen,
    hoeren_por_nivel: hoerenNivel, errores_dictado_repetidos: erroresDictado, palabras, evolucion_perfil: perfilEvo,
  };
}

/** Costo de la IA: por mes (últimos 12) y totales. */
export async function costosIA() {
  const rows = await db.all("ia_llamadas");
  const meses = {};
  let total = 0;
  for (const r of rows) {
    const m = r.ts.slice(0, 7);
    meses[m] = meses[m] || { mes: m, llamadas: 0, correcciones: 0, envios: 0, otras: 0, costo_usd: 0, tokens_in: 0, tokens_out: 0, errores: 0 };
    const x = meses[m];
    x.llamadas++;
    if (r.tipo === "korrektur") x.correcciones++; else if (String(r.tipo).startsWith("envio")) x.envios++; else x.otras++;
    x.costo_usd += r.costo_usd || 0;
    x.tokens_in += (r.tokens_in || 0) + (r.cache_read || 0) + (r.cache_write || 0);
    x.tokens_out += r.tokens_out || 0;
    if (!r.ok) x.errores++;
    total += r.costo_usd || 0;
  }
  const lista = Object.values(meses).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 12);
  for (const x of lista) x.costo_usd = Math.round(x.costo_usd * 10000) / 10000;
  return { meses: lista, total_usd: Math.round(total * 10000) / 10000, llamadas: rows.length, ultimas: rows.slice(-8).reverse() };
}
