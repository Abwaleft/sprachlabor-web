// Test de nivel inicial: crea el perfil del alumno (un dato) a partir de lo que contesta.
//
// Partes: datos (nombre, idiomas, meta, temas) → Lesen (2 textos con preguntas) → Hören (6 frases con pregunta,
// voz del celular) → Schreiben (un texto corto) → Sprechen (opcional, 30–45 s) → el tutor (IA) estima el perfil.
// Sin clave de API, el perfil sale de una estimación local (aciertos por nivel) y el tutor lo afina en el primer envío.

import { hoy } from "../datos/tiempo.js";
import * as ia from "../ia/ia.js";
import { SCHEMA_TEST_NIVEL, validar } from "../ia/schemas.js";
import * as tutor from "../ia/tutor.js";
import * as perfilMod from "./perfil.js";

export const LESEN = [
  { niveau: "A2", titulo: "Eine Nachricht",
    text: "Hallo Mira, ich komme heute später nach Hause, weil der Zug Verspätung hat. Kannst du bitte das Brot kaufen? Ich bin um halb acht da. Bis später, Tom",
    fragen: [
      { frage: "¿Por qué Tom llega más tarde?", optionen: ["Porque trabaja hasta tarde", "Porque el tren está demorado", "Porque va a comprar pan"], richtig: 1 },
      { frage: "¿Qué le pide a Mira?", optionen: ["Que compre pan", "Que cocine", "Que lo busque en la estación"], richtig: 0 },
      { frage: "¿A qué hora llega?", optionen: ["A las 8:30", "A las 7:30", "A las 8:00"], richtig: 1 },
    ] },
  { niveau: "B1", titulo: "Aus einer Zeitung",
    text: "Immer mehr Menschen in Deutschland fahren mit dem Fahrrad zur Arbeit. Eine Umfrage zeigt: Vor allem in großen Städten lassen viele das Auto stehen, weil sie im Stau zu viel Zeit verlieren. Allerdings fehlen oft sichere Radwege. Die Stadt Münster gilt als Vorbild: Dort gibt es mehr Fahrräder als Einwohner, und fast vierzig Prozent aller Wege werden mit dem Rad gemacht.",
    fragen: [
      { frage: "¿Por qué muchos dejan el auto en las ciudades grandes?", optionen: ["Porque es caro", "Porque pierden tiempo en los embotellamientos", "Porque no hay estacionamiento"], richtig: 1 },
      { frage: "¿Cuál es el problema que menciona el texto?", optionen: ["Faltan bicisendas seguras", "Las bicicletas son caras", "Llueve mucho"], richtig: 0 },
      { frage: "¿Qué dice de Münster?", optionen: ["Casi el 40 % de los trayectos se hacen en bici", "Tiene 40 000 bicicletas", "Prohibió los autos"], richtig: 0 },
    ] },
];

export const HOEREN = [
  { niveau: "A2", text: "Der Zug nach Hamburg fährt heute um vierzehn Uhr zwanzig von Gleis drei.", frage: "¿A qué hora sale el tren?", optionen: ["14:20", "4:20", "14:02"], richtig: 0 },
  { niveau: "A2", text: "Das Brot kostet zwei Euro neunzig und die Milch einen Euro zehn.", frage: "¿Cuánto cuesta el pan?", optionen: ["2,19 €", "2,90 €", "9,20 €"], richtig: 1 },
  { niveau: "A2", text: "Ich arbeite von Montag bis Donnerstag im Büro und am Freitag zu Hause.", frage: "¿Qué día trabaja desde casa?", optionen: ["El jueves", "El viernes", "El lunes"], richtig: 1 },
  { niveau: "B1", text: "Liebe Fahrgäste, wegen einer Störung hält dieser Zug nicht in Köln Süd. Bitte steigen Sie am Hauptbahnhof in die Linie sechzehn um.", frage: "¿Qué tiene que hacer el pasajero?", optionen: ["Bajarse en Köln Süd", "Cambiar a la línea 16 en la estación central", "Esperar el próximo tren"], richtig: 1 },
  { niveau: "B1", text: "Das Training am Samstag beginnt eine Stunde früher als sonst, also um acht, weil es nachmittags sehr heiß wird.", frage: "¿A qué hora empieza el entrenamiento el sábado?", optionen: ["A las 9", "A las 8", "A las 7"], richtig: 1 },
  { niveau: "B1", text: "Die neue Windkraftanlage liefert Strom für ungefähr dreitausend Haushalte, obwohl sie kleiner ist als die alten.", frage: "¿Para cuántos hogares alcanza la electricidad?", optionen: ["Unos 300", "Unos 3000", "Unos 30 000"], richtig: 1 },
];

export const SCHREIBEN = {
  titulo: "Über mich", consigna_de: "Schreiben Sie einen kurzen Text über sich: Wer sind Sie, was machen Sie, und was haben Sie letztes Wochenende gemacht?",
  consigna_es: "Escribí un texto corto sobre vos: quién sos, qué hacés y qué hiciste el fin de semana pasado. Sin diccionario: queremos ver tu nivel real.",
  palabras_min: 40, palabras_max: 80,
};

export const SPRECHEN = {
  titulo: "Mein Tag", consigna_de: "Beschreiben Sie einen typischen Tag: Was machen Sie morgens, mittags und abends?",
  consigna_es: "Describí un día típico: mañana, mediodía y noche. Hablá 30–45 segundos.", duracion_s: 40,
};

const nivelDeAciertos = (a2, b1) => (b1 >= 0.67 ? "B1" : a2 >= 0.67 ? (b1 >= 0.34 ? "A2, B1 en construcción" : "A2") : a2 >= 0.34 ? "A1+/A2" : "A1");

function acierto(items, respuestas, niveau) {
  const sel = items.map((it, i) => [it, respuestas[i]]).filter(([it]) => it.niveau === niveau);
  if (!sel.length) return 0;
  return sel.filter(([it, r]) => r === it.richtig).length / sel.length;
}

/** Arma el resumen del test (para el tutor y para la estimación local). */
export function resumir(datos) {
  const lesenItems = LESEN.flatMap((t) => t.fragen.map((f) => ({ ...f, niveau: t.niveau })));
  const lesen = { A2: acierto(lesenItems, datos.lesen, "A2"), B1: acierto(lesenItems, datos.lesen, "B1") };
  const hoeren = { A2: acierto(HOEREN, datos.hoeren, "A2"), B1: acierto(HOEREN, datos.hoeren, "B1") };
  return {
    datos: { anios_estudio: datos.anios || "", meta: datos.meta, idiomas: datos.idiomas, autoevaluacion: datos.autoevaluacion || "" },
    lesen: { acierto_por_nivel: lesen, respuestas: lesenItems.map((f, i) => ({ niveau: f.niveau, ok: datos.lesen[i] === f.richtig })) },
    hoeren: { acierto_por_nivel: hoeren, escuchas: datos.hoeren_escuchas || [], respuestas: HOEREN.map((f, i) => ({ niveau: f.niveau, ok: datos.hoeren[i] === f.richtig, texto: f.text })) },
    schreiben: { consigna: SCHREIBEN.consigna_de, texto: datos.texto || "", palabras: (String(datos.texto || "").match(/[\p{L}\p{N}]+/gu) || []).length },
    sprechen: datos.transkript ? { consigna: SPRECHEN.consigna_de, transkript: datos.transkript, segundos: datos.segundos, literal: false, nota: "transcripción provisoria de Whisper en el celular: puede haber corregido el orden" } : null,
  };
}

/** Perfil estimado sin IA (cuando no hay clave todavía). */
export function perfilLocal(datos, resumen) {
  const p = perfilMod.perfilVacio();
  Object.assign(p, { nombre: datos.nombre || "", idiomas: datos.idiomas, meta: datos.meta || "B1", temas: datos.temas && datos.temas.length ? datos.temas : p.temas,
    idioma_explicaciones: datos.idioma_explicaciones || p.idioma_explicaciones });
  const L = resumen.lesen.acierto_por_nivel;
  const H = resumen.hoeren.acierto_por_nivel;
  p.niveles.lesen = nivelDeAciertos(L.A2, L.B1);
  p.niveles.hoeren = nivelDeAciertos(H.A2, H.B1);
  const n = resumen.schreiben.palabras;
  p.niveles.schreiben = n >= 60 ? "A2 (estimado por extensión; el tutor lo afina)" : n >= 30 ? "A1+/A2 (estimado)" : "A1 (estimado)";
  p.niveles.sprechen = resumen.sprechen ? "A2 (estimado)" : "sin evaluar";
  const puntos = (L.A2 + L.B1 + H.A2 + H.B1) / 4;
  p.progreso_b1 = Math.round(10 + puntos * 40);
  p.fecha = hoy();
  p.origen = "test-local";
  return p;
}

/** Corre el test por la IA (si hay clave) o local, y guarda el perfil. Devuelve {perfil, comentario, plan_arranque, costo_usd}. */
export async function evaluar(datos) {
  const resumen = resumir(datos);
  const local = perfilLocal(datos, resumen);
  if (!(await ia.listo())) {
    await perfilMod.set(local);
    return { perfil: local, comentario: "Perfil estimado en el celular (sin IA). Cuando cargues la clave de API, el tutor lo afina en el primer envío.", plan_arranque: "", costo_usd: 0, local: true };
  }
  const r = await ia.llamar({ tipo: "test", system: await tutor.system(local, { cache: false }), usuario: tutor.promptTest(resumen),
    schema: SCHEMA_TEST_NIVEL, maxTokens: 6000, effort: "medium" });
  const problemas = validar("test", r.salida);
  if (problemas.length) console.warn("test de nivel:", problemas.join("; "));
  await perfilMod.set(local);  // primero los datos fijos
  const p = await perfilMod.actualizarDesdeTutor(r.salida);
  p.origen = "test";
  await perfilMod.set(p);
  return { perfil: p, comentario: r.salida.comentario, plan_arranque: r.salida.plan_arranque, costo_usd: r.costo_usd, local: false };
}
