// Nivel de las consignas de Schreiben y Sprechen.
// Escala: 1 = A2, 2 = A2+, 3 = B1, 4 = B1+, 5 = B2. kv["nivel_objetivo"] guarda un número con decimales por tipo.
// Después de cada Schreiben/Sprechen el usuario marca la dificultad (Muy difícil −1 · Difícil = · Bien +½ · Fácil +1):
// ajuste PROVISORIO. Cuando el tutor corrige, decide el nivel con la dificultad marcada Y la calidad real
// (`decisionTutor`), y esa decisión manda.

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";

export const NIVELES = ["A2", "A2+", "B1", "B1+", "B2"];
export const INICIAL = { schreiben: 1.0, sprechen: 2.0 };
export const AJUSTE = { 1: -1.0, 2: 0.0, 3: 0.5, 4: 1.0 };
export const ETIQUETAS = { 1: "Muy difícil", 2: "Difícil", 3: "Bien", 4: "Fácil" };
export const TIPO_DE_INTENTO = { schreiben: "schreiben", sprechen_frei: "sprechen" };

const clamp = (x) => Math.max(1, Math.min(NIVELES.length, x));
/** Redondeo con el .5 hacia abajo: un «Bien» (+½) solo no sube de nivel; dos seguidos, sí. */
export const nivelEntero = (x) => Math.ceil(clamp(x) - 0.5);
export const etiqueta = (x) => NIVELES[nivelEntero(x) - 1];
export const aNumero = (n) => (NIVELES.includes(n) ? NIVELES.indexOf(n) + 1 : null);

export async function objetivo() {
  const out = { ...INICIAL };
  const g = (await db.kvGet("nivel_objetivo")) || {};
  for (const [k, v] of Object.entries(g)) if (k in out && typeof v === "number") out[k] = clamp(v);
  return out;
}

export async function setObjetivo(tipo, valor) {
  const obj = await objetivo();
  obj[tipo] = clamp(valor);
  await db.kvSet("nivel_objetivo", obj);
  return obj;
}

/** Nivel de una consigna: el que trae, o uno estimado por su extensión (consignas viejas sin nivel). */
export function nivelItem(typ, p) {
  const n = aNumero(p.nivel);
  if (n) return n;
  if (typ === "schreiben") {
    const mx = p.palabras_max || 60;
    return mx <= 45 ? 1 : mx <= 60 ? 2 : mx <= 95 ? 3 : mx <= 125 ? 4 : 5;
  }
  const d = p.duracion_s || 45;
  return d <= 30 ? 1 : d <= 45 ? 2 : d <= 60 ? 3 : d <= 90 ? 4 : 5;
}

/** Elige la consigna: poco usada y cercana al nivel objetivo (costo = 1,5 × veces hecha + distancia). */
export function elegir(items, typ, target) {
  const t = nivelEntero(target);
  const costo = (it) => (it.times_done || 0) * 1.5 + Math.abs(nivelItem(typ, it) - t);
  return [...items].sort((a, b) => costo(a) - costo(b) || (a.last_done || "").localeCompare(b.last_done || "") || a.id - b.id)[0] || null;
}

/** Marca la dificultad de un intento (objeto ya cargado) y ajusta el nivel objetivo. Devuelve {intento, resultado}. */
export async function calificar(intento, valor) {
  if (!(valor in AJUSTE)) throw new Error("dificultad 1–4");
  const tipo = TIPO_DE_INTENTO[intento.type];
  if (!tipo) throw new Error("intento sin dificultad");
  const p = intento.payload;
  const obj = await objetivo();
  if (p.nivel_tutor) {
    p.dificultad = valor;
    p.dificultad_txt = ETIQUETAS[valor];
    const actual = etiqueta(obj[tipo]);
    return { tipo, dificultad: ETIQUETAS[valor], antes: actual, ahora: actual, valor: Math.round(obj[tipo] * 100) / 100, decidido_por_tutor: p.nivel_tutor };
  }
  const antes = clamp(obj[tipo] - (p.ajuste_nivel || 0));
  const ahoraN = clamp(antes + AJUSTE[valor]);
  p.dificultad = valor;
  p.dificultad_txt = ETIQUETAS[valor];
  p.ajuste_nivel = ahoraN - antes;
  await setObjetivo(tipo, ahoraN);
  return { tipo, dificultad: ETIQUETAS[valor], antes: etiqueta(antes), ahora: etiqueta(ahoraN), valor: Math.round(ahoraN * 100) / 100 };
}

/** El tutor fija el nivel. Pisa los ajustes provisorios. Devuelve {antes, ahora, motivo} o null. */
export async function decisionTutor(tipo, nivel, motivo, intento = null) {
  const n = aNumero(nivel);
  if (!(tipo in INICIAL) || !n) return null;
  const antes = etiqueta((await objetivo())[tipo]);
  await setObjetivo(tipo, n);
  const hist = (await db.kvGet("nivel_decisiones")) || [];
  hist.push({ fecha: ahora(), tipo, antes, ahora: nivel, motivo, intento: intento ? intento.id : null });
  await db.kvSet("nivel_decisiones", hist.slice(-50));
  if (intento) {
    intento.payload.nivel_tutor = nivel;
    intento.payload.motivo_nivel = motivo;
  }
  return { antes, ahora: nivel, motivo };
}

export async function resumen() {
  const o = await objetivo();
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, etiqueta(v)]));
}
