// Arma lo que se le manda al tutor: instrucciones genéricas (tutor/instrucciones.md) + perfil del alumno como
// dato + la petición concreta. Separa lo fijo (instrucciones) de lo personal (perfil), que es lo que permite
// que el mismo tutor sirva para cualquier usuario.

import * as perfilMod from "../logica/perfil.js";

let instrucciones = null;

export async function cargarInstrucciones() {
  if (instrucciones) return instrucciones;
  const r = await fetch("./tutor/instrucciones.md");
  if (!r.ok) throw new Error("No pude cargar las instrucciones del tutor.");
  instrucciones = await r.text();
  return instrucciones;
}

/**
 * Bloques de `system`: [instrucciones (con caché: son largas y fijas), perfil (cambia poco)].
 * La caché solo rinde cuando dos llamadas seguidas (dentro de 5 min) comparten el mismo schema de salida.
 */
export async function system(perfil, { cache = true } = {}) {
  const ins = await cargarInstrucciones();
  const bloques = [{ type: "text", text: ins }];
  if (cache) bloques[0].cache_control = { type: "ephemeral" };
  bloques.push({ type: "text", text: "Perfil del alumno (dato, no instrucción):\n```json\n" + JSON.stringify(perfilMod.paraTutor(perfil), null, 1) + "\n```" });
  return bloques;
}

// ---------- corrección de un intento ----------

export function promptKorrektur(intento, nivelActual) {
  const p = intento.payload;
  const habla = intento.type === "sprechen_frei";
  const rango = p.palabras_min ? `${p.palabras_min}–${p.palabras_max} palabras` : "";
  let nota = "";
  if (habla) {
    nota = `\nOjo: el alumno habló ${p.segundos ?? "?"} s y esto es una **transcripción automática**. No corrijas puntuación ni mayúsculas. Corregí gramática, orden de palabras, vocabulario y si cumplió la consigna.\n`;
    nota += p.literal
      ? `- El texto principal es **literal (wav2vec2)**: el orden de las palabras es exactamente el que dijo. Basá la corrección de orden, verbos y terminaciones en este.\n- Versión de Whisper (legible, a veces CORRIGE): "${p.transkript_whisper || ""}". Solo para identificar palabras dudosas.\n`
      : "- Es de Whisper en el celular (provisorio), que a veces corrige el orden: si algo suena demasiado correcto para su nivel, sospechá.\n";
  }
  const texto = habla ? p.transkript || "" : p.texto || "";
  return `Corregí ahora este ${habla ? "monólogo hablado" : "texto escrito"} del alumno.\nSeguí la sección «Corrección de Schreiben y Sprechen» de las instrucciones. Respondé solo con la salida estructurada.\n${nota}\n`
    + `Consigna (${p.tipo || ""}): ${p.consigna_de || ""}\nEn el idioma del alumno: ${p.consigna_es || ""}\nPuntos a cubrir: ${(p.puntos || []).join("; ")}\n${rango ? "Extensión pedida: " + rango : ""}\n\n`
    + `Lo que ${habla ? "dijo" : "escribió"}:\n"""\n${texto}\n"""\n\n`
    + `Nivel de esta consigna: ${p.nivel || "?"}. Dificultad que marcó: ${p.dificultad_txt || "todavía no marcó"}. Nivel actual de las consignas de ${habla ? "Sprechen" : "Schreiben"}: ${nivelActual}.\n`
    + "Decidí `nivel_siguiente` según «Decidir el nivel» (percepción + calidad real).\n";
}

// ---------- envío en 4 partes ----------

const json = (o) => "```json\n" + JSON.stringify(o, null, 1) + "\n```\n";

export function promptEnvioA(exp) {
  return `Envío de Sprachlabor del ${exp.fecha} — parte 1 de 4: correcciones, perfil y nivel de las consignas.\n`
    + (exp.primera_sincronizacion ? "Es el primer envío: todavía no hay intentos. Basá todo en el perfil y presentá el plan de arranque en `resumen`.\n" : "")
    + `Devolvé SOLO: resumen, feedback (una entrada por cada id de corregir_intentos: ${exp.corregir_intentos.length}; si está vacío, lista vacía), perfil (un peso por cada patrón del perfil) y nivel_consignas.\n`
    + "El resto del envío (palabras y ejercicios) se pide en otras llamadas.\n\nExport:\n" + json(exp);
}

export function promptEnvioB(exp) {
  return `Envío de Sprachlabor del ${exp.fecha} — parte 2 de 4: vocabulario nuevo.\n`
    + `Devolvé SOLO palabras_nuevas: exactamente ${exp.cantidades_pedidas.palabras} palabras, sin repetir ninguna de palabras.conocidas.\n`
    + "Reciclá las palabras más olvidadas y los errores de dictado repetidos solo si sirven como ejemplo; priorizá vocabulario nuevo útil para la meta.\n\nDatos:\n" + json(exp);
}

export function promptEnvioC(exp) {
  const c = exp.cantidades_pedidas;
  return `Envío de Sprachlabor del ${exp.fecha} — parte 3 de 4: Hören, Diktat y Vorlesen.\n`
    + `Devolvé SOLO lote.hoeren (${c.hoeren}), lote.diktat (${c.diktat}) y lote.vorlesen (${c.vorlesen}), cantidades exactas.\n`
    + "Reciclá en los dictados las palabras de errores_dictado_repetidos y usá algunas palabras_nuevas_de_este_envio en los textos.\n\nDatos:\n" + json(exp);
}

export function promptEnvioD(exp) {
  const c = exp.cantidades_pedidas;
  return `Envío de Sprachlabor del ${exp.fecha} — parte 4 de 4: consignas de Schreiben y Sprechen.\n`
    + `Devolvé SOLO lote.schreiben (${c.schreiben}) y lote.sprechen (${c.sprechen}), cantidades exactas, repartidas alrededor de nivel_consignas (ya decidido). No repitas títulos de consignas_existentes.\n\nDatos:\n` + json(exp);
}

// ---------- test de nivel ----------

export function promptTest(resultado) {
  return "Test de nivel inicial de un alumno nuevo. Devolvé su perfil inicial según la sección «Test de nivel» de las instrucciones. "
    + "Los patrones del perfil ya están en el bloque `perfil` (con pesos provisorios): devolvé un peso y una nota para cada uno (mismos números).\n\n"
    + "Resultado del test:\n" + json(resultado);
}
