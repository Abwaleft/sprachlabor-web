// Consignas iniciales de Schreiben y Sprechen (hasta que el tutor genere las suyas), estilo Goethe-Zertifikat B1.

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";

export const SCHREIBEN = [
  { titulo: "Wochenende in Berlin", nivel: "A2+", tipo: "E-Mail informell", tema: "Reisen",
    consigna_de: "Sie waren letztes Wochenende in Berlin. Schreiben Sie Ihrem Freund Jonas eine E-Mail.",
    consigna_es: "Estuviste en Berlín el fin de semana pasado. Escribile un mail a tu amigo Jonas.",
    puntos: ["Beschreiben Sie: Was haben Sie gemacht?", "Begründen Sie: Was hat Ihnen am besten gefallen?", "Machen Sie einen Vorschlag für ein Treffen."],
    palabras_min: 60, palabras_max: 90, ayuda: ["Lieber Jonas,", "weil …", "Viele Grüße"] },
  { titulo: "Jeden Tag Sport?", nivel: "B1", tipo: "Forumsbeitrag", tema: "Sport",
    consigna_de: "In einem Forum diskutieren Leute: „Sollte man jeden Tag Sport machen?“ Schreiben Sie Ihre Meinung.",
    consigna_es: "En un foro discuten si hay que hacer deporte todos los días. Escribí tu opinión.",
    puntos: ["Ihre Meinung", "Ein Beispiel aus Ihrem Leben", "Ein Nachteil oder ein Risiko"],
    palabras_min: 60, palabras_max: 90, ayuda: ["Meiner Meinung nach …", "zum Beispiel", "deshalb"] },
  { titulo: "Termin absagen", nivel: "A2+", tipo: "E-Mail formell", tema: "Alltag",
    consigna_de: "Sie haben morgen um 9 Uhr einen Termin bei Frau Dr. Weber, können aber nicht kommen. Schreiben Sie eine E-Mail.",
    consigna_es: "Mañana a las 9 tenés turno con la Dra. Weber pero no podés ir. Escribí un mail formal.",
    puntos: ["Entschuldigen Sie sich.", "Nennen Sie den Grund.", "Bitten Sie um einen neuen Termin."],
    palabras_min: 35, palabras_max: 55, ayuda: ["Sehr geehrte …,", "leider", "Mit freundlichen Grüßen"] },
  { titulo: "Meine Woche", nivel: "A2+", tipo: "Text", tema: "Alltag",
    consigna_de: "Schreiben Sie über Ihre letzte Woche.",
    consigna_es: "Contá cómo fue tu última semana (usá el Perfekt).",
    puntos: ["Was haben Sie gemacht?", "Was war neu oder anders?", "Wie haben Sie sich gefühlt?"],
    palabras_min: 50, palabras_max: 80, ayuda: ["Am Montag …", "danach", "insgesamt"] },
  { titulo: "Neue Windräder", nivel: "B1+", tipo: "Forumsbeitrag", tema: "Energie",
    consigna_de: "In der Nähe eines Dorfes sollen fünf neue Windräder gebaut werden. Was denken Sie darüber?",
    consigna_es: "Cerca de un pueblo van a construir cinco aerogeneradores nuevos. ¿Qué opinás?",
    puntos: ["Ihre Meinung", "Ein Vorteil", "Ein Problem für die Menschen im Dorf"],
    palabras_min: 60, palabras_max: 90, ayuda: ["Ich bin für/gegen …", "allerdings", "trotzdem"] },
  { titulo: "Der Zug hat Verspätung", nivel: "A2", tipo: "Nachricht", tema: "Arbeit",
    consigna_de: "Ihr Zug hat 40 Minuten Verspätung. Schreiben Sie Ihrer Kollegin Sabine eine kurze Nachricht.",
    consigna_es: "Tu tren tiene 40 minutos de demora. Mandale un mensaje corto a tu compañera Sabine.",
    puntos: ["Was ist passiert?", "Wann kommen Sie an?", "Was soll Sabine machen?"],
    palabras_min: 25, palabras_max: 45, ayuda: ["Hallo Sabine,", "leider", "ungefähr um …"] },
];

export const SPRECHEN = [
  { titulo: "Mein letztes Wochenende", nivel: "A2+", tema: "Alltag", duracion_s: 45,
    consigna_de: "Erzählen Sie von Ihrem letzten Wochenende.", consigna_es: "Contá qué hiciste el fin de semana pasado (Perfekt).",
    puntos: ["Wo waren Sie?", "Was haben Sie gemacht?", "Wie war es?"], ayuda: ["Am Samstag bin ich …", "Danach habe ich …", "Am Sonntag …", "Es war …"] },
  { titulo: "Stellen Sie sich vor", nivel: "A2", tema: "Ich", duracion_s: 45,
    consigna_de: "Stellen Sie sich vor.", consigna_es: "Presentate: quién sos, qué hacés y por qué aprendés alemán.",
    puntos: ["Name und Herkunft", "Arbeit oder Studium", "Hobbys", "Warum lernen Sie Deutsch?"],
    ayuda: ["Ich heiße … und komme aus …", "Ich arbeite als …", "In meiner Freizeit …", "Ich lerne Deutsch, weil …"] },
  { titulo: "Mein typischer Tag", nivel: "A2", tema: "Alltag", duracion_s: 45,
    consigna_de: "Beschreiben Sie einen typischen Tag.", consigna_es: "Describí un día típico. Empezá frases con Zuerst, Dann, Danach… (¡verbo en 2.º lugar!).",
    puntos: ["Morgens", "Bei der Arbeit", "Abends"], ayuda: ["Zuerst stehe ich um … auf.", "Dann fahre ich …", "Danach …", "Am Abend …"] },
  { titulo: "Mein Hobby", nivel: "A2+", tema: "Freizeit", duracion_s: 45,
    consigna_de: "Beschreiben Sie Ihr Lieblingshobby.", consigna_es: "Describí tu hobby favorito.",
    puntos: ["Was machen Sie?", "Wann und wie oft?", "Warum gefällt es Ihnen?"], ayuda: ["Am liebsten …", "Normalerweise …", "Es gefällt mir, weil …"] },
  { titulo: "Pro und Contra: Homeoffice", nivel: "B1+", tema: "Arbeit", duracion_s: 60,
    consigna_de: "Sprechen Sie über Homeoffice: Vorteile, Nachteile und Ihre Meinung.",
    consigna_es: "Hablá sobre el trabajo desde casa: ventajas, desventajas y tu opinión (como en el B1, Teil 2).",
    puntos: ["Ein Vorteil", "Ein Nachteil", "Wie ist es in Ihrem Land?", "Ihre Meinung"],
    ayuda: ["Ein Vorteil ist, dass …", "Ein Nachteil ist …", "In meinem Land …", "Ich persönlich finde …"] },
  { titulo: "Eine Reise", nivel: "B1", tema: "Reisen", duracion_s: 60,
    consigna_de: "Erzählen Sie von einer Reise, die Sie gemacht haben.", consigna_es: "Contá un viaje que hiciste.",
    puntos: ["Wohin und wann?", "Mit wem?", "Was haben Sie erlebt?", "Was war das Beste?"],
    ayuda: ["Vor zwei Jahren bin ich nach … gefahren.", "Wir haben … besucht.", "Das Beste war …"] },
];

/** Inserta las consignas iniciales de un tipo si no hay ninguna de ese tipo. */
export async function asegurar() {
  const ts = ahora();
  let n = 0;
  await db.tx("items", "readwrite", async (t) => {
    for (const [typ, seeds] of [["schreiben", SCHREIBEN], ["sprechen", SPRECHEN]]) {
      if (await t.indexCount("items", "type", typ)) continue;
      for (const s of seeds) { await t.add("items", { type: typ, ...s, created: ts, envio_id: null, times_done: 0, last_done: null }); n++; }
    }
  });
  return n;
}
