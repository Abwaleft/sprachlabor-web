// «Enviar al tutor»: arma el export, llama a la IA en 4 partes y guarda lo que vuelve.
//
// Partes (cada una con su schema chico y SOLO los datos que necesita, para no pagar el export entero 4 veces):
//   a  correcciones + perfil + resumen + nivel de consignas   (intentos de 7 días, estadísticas, textos a corregir)
//   b  palabras nuevas                                         (palabras conocidas, difíciles, temas)
//   c  Hören / Diktat / Vorlesen                               (patrones, errores de dictado, palabras nuevas de b)
//   d  Schreiben / Sprechen                                    (nivel decidido en a, consignas existentes)
// a primero; b después (usa el perfil nuevo); c y d en paralelo. Cada parte que llega se guarda en el registro del
// envío (`envios`), así una parte fallida se reintenta sola sin repetir las otras.

import * as db from "../datos/db.js";
import { ahora, hoy } from "../datos/tiempo.js";
import * as ia from "../ia/ia.js";
import * as schemas from "../ia/schemas.js";
import * as tutor from "../ia/tutor.js";
import { diasConPractica, intentosDesde, todosLosIntentos } from "./intentos.js";
import * as korrektur from "./korrektur.js";
import * as niveles from "./niveles.js";
import * as opciones from "./opciones.js";
import * as perfilMod from "./perfil.js";
import * as stats from "./stats.js";
import * as vokabeln from "./vokabeln.js";

export const TARGET = { palabras: 30, hoeren: 15, diktat: 15, schreiben: 3, sprechen: 3, vorlesen: 8 };
export const MINIMO = { palabras: 10, hoeren: 5, diktat: 5, schreiben: 2, sprechen: 2, vorlesen: 4 };
const LOTE_TIPOS = ["hoeren", "diktat", "schreiben", "sprechen", "vorlesen"];
const DIAS_DETALLE = 7;
const MAX_INTENTOS = 400;
const MAX_TOKENS = { a: 8000, b: 8000, c: 12000, d: 8000 };

const estado = { running: false, stage: "", started: null, error: null, resultado: null, envio_id: null, partes: {} };
const oyentes = new Set();
export const status = () => ({ ...estado, elapsed: estado.started ? Math.round((Date.now() - estado.started) / 1000) : 0 });
export function onCambio(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function avisar() { for (const fn of oyentes) { try { fn(status()); } catch { /* oyente roto */ } } }
function etapa(s) { estado.stage = s; avisar(); }

// ---------- export ----------

async function base() {
  const perfil = await perfilMod.get();
  const palabras = await vokabeln.todas();
  const items = await db.all("items");
  const envios = (await db.all("envios")).filter((e) => e.status === "ok");
  const frescos = Object.fromEntries(LOTE_TIPOS.map((t) => [t, items.filter((i) => i.type === t && !(i.times_done || 0)).length]));
  const sinVer = palabras.filter((w) => !w.introduced).length;
  const dias = (await opciones.get()).dias_lote || 3;
  const meta = (k) => Math.round((TARGET[k] * dias) / 3);  // TARGET está pensado para 3 días
  const cantidades = { palabras: Math.max(MINIMO.palabras, meta("palabras") - sinVer) };
  for (const t of LOTE_TIPOS) cantidades[t] = Math.max(MINIMO[t], meta(t) - frescos[t]);
  return { perfil, palabras, items, frescos, cantidades, primera: envios.length === 0, estadisticas: await stats.compute() };
}

async function intentosDetalle() {
  const lista = await diasConPractica();
  const desde = lista.slice(-DIAS_DETALLE)[0] || hoy();
  const rows = (await intentosDesde(desde)).concat((await todosLosIntentos()).filter((a) => !a.enviado && a.ts < desde));
  const unicos = [...new Map(rows.map((r) => [r.id, r])).values()].sort((a, b) => a.id - b.id).slice(-MAX_INTENTOS);
  const corregidos = await korrektur.idsCorregidos();
  const out = [];
  for (const r of unicos) {
    const p = { ...r.payload };
    if ("tipo" in p) { p.tipo_consigna = p.tipo; delete p.tipo; }
    delete p.audio_file;
    const it = { id: r.id, ts: r.ts, tipo: r.type, score: r.score, nuevo: !r.enviado, ...p };
    if (korrektur.TIPOS.includes(r.type)) it.ya_corregido = corregidos.has(r.id);
    out.push(it);
  }
  return { intentos: out, max_id: Math.max(0, ...unicos.filter((r) => !r.enviado).map((r) => r.id)), sin_corregir: out.filter((i) => i.ya_corregido === false && (i.texto || i.transkript)).map((i) => i.id) };
}

export async function exportA() {
  const b = await base();
  const d = await intentosDetalle();
  const resumen = {};
  for (const i of d.intentos.filter((x) => x.nuevo)) {
    const r = (resumen[i.tipo] = resumen[i.tipo] || { intentos: 0, suma: 0, n: 0 });
    r.intentos++;
    if (i.score != null) { r.suma += i.score; r.n++; }
  }
  for (const r of Object.values(resumen)) { r.promedio = r.n ? Math.round((r.suma / r.n) * 100) / 100 : null; delete r.suma; delete r.n; }
  const e = b.estadisticas;
  return {
    fecha: hoy(), primera_sincronizacion: b.primera, perfil_actual: perfilMod.paraTutor(b.perfil),
    nivel_objetivo: await niveles.resumen(), decisiones_de_nivel_anteriores: ((await db.kvGet("nivel_decisiones")) || []).slice(-6),
    corregir_intentos: d.sin_corregir, resumen_intentos_nuevos: resumen,
    estadisticas: { totales: e.totales, comparacion_semanal: e.comparacion_semanal, por_semana: e.por_semana.slice(-6), zahlen_por_tipo: e.zahlen_por_tipo,
      hoeren_por_nivel: e.hoeren_por_nivel, errores_dictado_repetidos: e.errores_dictado_repetidos, palabras: e.palabras,
      evolucion_perfil: e.evolucion_perfil.slice(-5), produccion: e.produccion },
    intentos_ultimos_7_dias_practicados: d.intentos,
    _max_id: d.max_id,
  };
}

export async function exportB(perfilNuevo) {
  const b = await base();
  return {
    fecha: hoy(), perfil: perfilMod.paraTutor(perfilNuevo || b.perfil), cantidades_pedidas: { palabras: b.cantidades.palabras },
    palabras: { total: b.palabras.length, sin_ver: b.palabras.filter((w) => !w.introduced).length,
      conocidas: b.palabras.map(vokabeln.textoCompleto),
      dificiles: b.palabras.filter((w) => (w.lapses || 0) >= 2 || ((w.reps || 0) > 0 && (w.ease || 2.5) < 2)).map(vokabeln.textoCompleto) },
    errores_dictado_repetidos: b.estadisticas.errores_dictado_repetidos.slice(0, 8),
  };
}

export async function exportC(perfilNuevo, palabrasNuevas) {
  const b = await base();
  const e = b.estadisticas;
  return {
    fecha: hoy(), perfil: perfilMod.paraTutor(perfilNuevo || b.perfil),
    cantidades_pedidas: { hoeren: b.cantidades.hoeren, diktat: b.cantidades.diktat, vorlesen: b.cantidades.vorlesen },
    hoeren_por_nivel: e.hoeren_por_nivel, hoeren_7d: e.comparacion_semanal.ultimos_7_dias_practicados.hoeren || null,
    zahlen_por_tipo: e.zahlen_por_tipo, errores_dictado_repetidos: e.errores_dictado_repetidos,
    vorlesen: e.produccion.vorlesen || null, palabras_mas_olvidadas: e.palabras.mas_olvidadas,
    palabras_nuevas_de_este_envio: (palabrasNuevas || []).map((w) => `${w.artikel || ""} ${w.wort}`.trim()),
    contenido_sin_usar: { hoeren: b.frescos.hoeren, diktat: b.frescos.diktat, vorlesen: b.frescos.vorlesen },
  };
}

export async function exportD(perfilNuevo, nivelConsignas, palabrasNuevas) {
  const b = await base();
  const e = b.estadisticas;
  return {
    fecha: hoy(), perfil: perfilMod.paraTutor(perfilNuevo || b.perfil),
    cantidades_pedidas: { schreiben: b.cantidades.schreiben, sprechen: b.cantidades.sprechen },
    nivel_consignas: nivelConsignas || Object.fromEntries(Object.entries(await niveles.resumen()).map(([k, v]) => [k, { nivel: v, motivo: "sin cambios" }])),
    consignas_existentes: { schreiben: b.items.filter((i) => i.type === "schreiben").map((i) => i.titulo), sprechen: b.items.filter((i) => i.type === "sprechen").map((i) => i.titulo) },
    produccion: { schreiben: e.produccion.schreiben || null, sprechen_frei: e.produccion.sprechen_frei || null },
    palabras_nuevas_de_este_envio: (palabrasNuevas || []).map((w) => `${w.artikel || ""} ${w.wort}`.trim()),
  };
}

// ---------- import ----------

const esc = (s) => String(s || "").trim();

export async function importarParteA(so, envioId, maxId) {
  const out = { feedback: 0, niveles: {} };
  const corregidos = await korrektur.idsCorregidos();
  const intentosCorregidos = [];
  for (const fb of so.feedback || []) {
    const a = Number.isInteger(fb.intento_id) ? await db.get("intentos", fb.intento_id) : null;
    if (!a || !korrektur.TIPOS.includes(a.type) || corregidos.has(a.id)) continue;
    await korrektur.guardar(a, { ...fb, original: korrektur.textoDe(a) }, "envio");
    out.feedback++;
    intentosCorregidos.push(a);
  }
  for (const [tipo, d] of Object.entries(so.nivel_consignas || {})) {
    if (!d || typeof d !== "object") continue;
    const r = await niveles.decisionTutor(tipo, d.nivel, d.motivo || "");
    if (r) out.niveles[tipo] = r.ahora;
  }
  for (const a of intentosCorregidos) {
    const tipo = niveles.TIPO_DE_INTENTO[a.type];
    if (out.niveles[tipo]) { a.payload.nivel_tutor = out.niveles[tipo]; a.payload.motivo_nivel = (so.nivel_consignas[tipo] || {}).motivo || ""; await db.put("intentos", a); }
  }
  if (so.perfil) await perfilMod.actualizarDesdeTutor(so.perfil);
  if (maxId) {
    await db.tx("intentos", "readwrite", (t) => t.each("intentos", (r, c) => { if (!r.enviado && r.id <= maxId) { r.enviado = 1; c.update(r); } }));
  }
  return out;
}

export async function importarParteB(so, envioId) {
  return { palabras: await vokabeln.agregar(so.palabras_nuevas || [], envioId) };
}

export async function importarLote(lote, envioId) {
  const ts = ahora();
  const n = { hoeren: 0, diktat: 0, vorlesen: 0, schreiben: 0, sprechen: 0 };
  await db.tx("items", "readwrite", async (t) => {
    for (const it of lote.hoeren || []) {
      const opts = [...(it.optionen_es || [])];
      const k = it.richtig;
      if (!esc(it.text_de) || !Number.isInteger(k) || k < 0 || k >= opts.length || opts.length < 2) continue;
      const correcta = opts[k];
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      await t.add("items", { type: "hoeren", ...it, optionen_es: opts, richtig: opts.indexOf(correcta), created: ts, envio_id: envioId, times_done: 0, last_done: null });
      n.hoeren++;
    }
    for (const [typ, campo] of [["diktat", "text_de"], ["vorlesen", "text_de"], ["schreiben", "consigna_de"], ["sprechen", "consigna_de"]]) {
      for (const it of lote[typ] || []) {
        if (!esc(it[campo])) continue;
        await t.add("items", { type: typ, ...it, created: ts, envio_id: envioId, times_done: 0, last_done: null });
        n[typ]++;
      }
    }
  });
  return n;
}

// ---------- la corrida ----------

async function llamarParte(parte, exp, perfil) {
  const prompts = { a: tutor.promptEnvioA, b: tutor.promptEnvioB, c: tutor.promptEnvioC, d: tutor.promptEnvioD };
  const { _max_id, ...limpio } = exp;
  const r = await ia.llamar({ tipo: `envio-${parte}`, system: await tutor.system(perfil, { cache: false }), usuario: prompts[parte](limpio),
    schema: await schemas.schemaEnvio(parte), maxTokens: MAX_TOKENS[parte], effort: "medium" });
  const problemas = schemas.validar(`envio-${parte}`, r.salida);
  if (problemas.length) console.warn(`envío parte ${parte}: ${problemas.join("; ")}`);
  return r;
}

async function guardarParte(envioId, parte, r) {
  const e = await db.get("envios", envioId);
  e.partes = e.partes || {};
  e.partes[parte] = { salida: r.salida, uso: r.uso, costo_usd: r.costo_usd, segundos: r.segundos, modelo: r.modelo, ts: ahora() };
  e.costo_usd = Object.values(e.partes).reduce((a, p) => a + (p.costo_usd || 0), 0);
  await db.put("envios", e);
  estado.partes[parte] = "ok";
  avisar();
  return e;
}

/** Empieza un envío (o reintenta las partes que faltan de `envioId`). Devuelve false si ya hay uno corriendo. */
export function iniciar(envioId = null) {
  if (estado.running) return false;
  Object.assign(estado, { running: true, stage: "Preparando el export", started: Date.now(), error: null, resultado: null, envio_id: envioId, partes: {} });
  avisar();
  correr(envioId).catch(() => {});
  return true;
}

async function correr(envioId) {
  try {
    if (!(await ia.listo())) throw new Error("No hay clave de API: cargala en Ajustes de IA.");
    let e;
    if (envioId) {
      e = await db.get("envios", envioId);
      if (!e) throw new Error("envío inexistente");
      for (const p of Object.keys(e.partes || {})) estado.partes[p] = "ok";
    } else {
      e = { started: ahora(), status: "running", partes: {}, resultado: {}, costo_usd: 0 };
      e.id = await db.add("envios", e);
    }
    estado.envio_id = e.id;
    let perfil = await perfilMod.get();
    const res = e.resultado || {};

    if (!e.partes.a) {
      etapa("1/4 · El tutor corrige y actualiza tu perfil");
      const exp = await exportA();
      const r = await llamarParte("a", exp, perfil);
      e = await guardarParte(e.id, "a", r);
      Object.assign(res, await importarParteA(r.salida, e.id, exp._max_id));
      res.resumen = r.salida.resumen;
      e.resultado = res;
      await db.put("envios", e);
      perfil = await perfilMod.get();
    }
    const a = e.partes.a.salida;
    if (!e.partes.b) {
      etapa("2/4 · Palabras nuevas");
      const r = await llamarParte("b", await exportB(perfil), perfil);
      e = await guardarParte(e.id, "b", r);
      Object.assign(res, await importarParteB(r.salida, e.id));
      e.resultado = res;
      await db.put("envios", e);
    }
    const nuevas = e.partes.b.salida.palabras_nuevas || [];
    const faltan = ["c", "d"].filter((p) => !e.partes[p]);
    if (faltan.length) {
      etapa("3/4 · Ejercicios nuevos (Hören, Diktat, Vorlesen, Schreiben, Sprechen)");
      // c y d en paralelo: cada una arma su export y llama
      const llamadas = await Promise.allSettled(faltan.map(async (p) => {
        const exp = p === "c" ? await exportC(perfil, nuevas) : await exportD(perfil, a.nivel_consignas, nuevas);
        return [p, await llamarParte(p, exp, perfil)];
      }));
      let fallo = null;
      for (const l of llamadas) {
        if (l.status === "rejected") { fallo = l.reason; continue; }
        const [p, r] = l.value;
        e = await guardarParte(e.id, p, r);
        const n = await importarLote(r.salida.lote || {}, e.id);
        for (const [k, v] of Object.entries(n)) if (v) res[k] = (res[k] || 0) + v;
        e.resultado = res;
        await db.put("envios", e);
      }
      if (fallo) throw fallo;
    }
    etapa("4/4 · Guardando");
    e.status = "ok";
    e.finished = ahora();
    e.result = { resumen: a.resumen, perfil: a.perfil, nivel_consignas: a.nivel_consignas, feedback: a.feedback || [],
      palabras_nuevas: nuevas, lote: Object.fromEntries(["c", "d"].flatMap((p) => Object.entries((e.partes[p].salida.lote) || {}))) };
    e.resultado = res;
    await db.put("envios", e);
    estado.resultado = { ...res, costo_usd: e.costo_usd, envio_id: e.id };
    etapa("Listo");
    window.dispatchEvent(new CustomEvent("sl:envio", { detail: { ok: true, envio_id: e.id } }));
  } catch (err) {
    estado.error = err && err.message ? err.message : String(err);
    etapa("Error");
    if (estado.envio_id) {
      const e = await db.get("envios", estado.envio_id);
      if (e && e.status !== "ok") { e.status = "error"; e.error = estado.error; e.finished = ahora(); await db.put("envios", e); }
    }
  } finally {
    estado.running = false;
    avisar();
  }
}

/** El último envío OK (para la Rückmeldung) y los que quedaron a medias (para reintentar). */
export async function ultimos() {
  const todos = (await db.all("envios")).sort((a, b) => b.id - a.id);
  return { ok: todos.find((e) => e.status === "ok") || null, incompletos: todos.filter((e) => e.status !== "ok" && Object.keys(e.partes || {}).length).slice(0, 3), total: todos.length };
}
