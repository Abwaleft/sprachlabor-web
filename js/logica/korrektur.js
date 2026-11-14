// Corrección de Schreiben y Sprechen frei («Corregir ahora» y el feedback del envío). Tabla `feedback`.

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";
import * as ia from "../ia/ia.js";
import * as schemas from "../ia/schemas.js";
import * as tutor from "../ia/tutor.js";
import * as niveles from "./niveles.js";
import * as perfilMod from "./perfil.js";

export const TIPOS = ["schreiben", "sprechen_frei"];

export const textoDe = (a) => (a.type === "schreiben" ? a.payload.texto || "" : a.payload.transkript || "");

export async function guardar(intento, fb, source) {
  return db.add("feedback", { attempt_id: intento.id, ts: ahora(), source, payload: fb });
}

export async function idsCorregidos() {
  return new Set((await db.all("feedback")).map((f) => f.attempt_id));
}

export const deIntento = async (attemptId) => (await db.porIndice("feedback", "attempt_id", attemptId)).sort((a, b) => b.id - a.id)[0] || null;

/** Corrige un intento con la IA y guarda el resultado. Devuelve el feedback (con `original` y `decision_nivel`). */
export async function corregir(attemptId) {
  const a = await db.get("intentos", attemptId);
  if (!a || !TIPOS.includes(a.type)) throw new Error("intento inexistente o que no se corrige");
  if (!textoDe(a).trim()) throw new Error("el intento está vacío");
  const tipo = niveles.TIPO_DE_INTENTO[a.type];
  const perfil = await perfilMod.get();
  const nivelActual = (await niveles.resumen())[tipo];
  const r = await ia.llamar({ tipo: "korrektur", system: await tutor.system(perfil, { cache: true }), usuario: tutor.promptKorrektur(a, nivelActual),
    schema: await schemas.schemaKorrektur(), maxTokens: 8000, effort: "low" });
  const fb = { ...r.salida, original: textoDe(a), costo_usd: r.costo_usd, modelo: r.modelo };
  if (fb.nivel_siguiente) {
    fb.decision_nivel = await niveles.decisionTutor(tipo, fb.nivel_siguiente, fb.motivo_nivel || "", a);
    await db.put("intentos", a);
  }
  await guardar(a, fb, "ahora");
  return fb;
}

/** Lista de correcciones para la Rückmeldung (las últimas n), con datos del intento. */
export async function recientes(n = 30) {
  const fbs = (await db.all("feedback")).sort((a, b) => b.id - a.id).slice(0, n);
  const out = [];
  for (const f of fbs) {
    const a = await db.get("intentos", f.attempt_id);
    if (!a) continue;
    out.push({ attempt_id: f.attempt_id, tipo: a.type, fecha: a.ts, source: f.source, titulo: a.payload.titulo, consigna_de: a.payload.consigna_de, ...f.payload });
  }
  return out;
}
