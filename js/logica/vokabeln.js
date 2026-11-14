// Vokabeln: presupuesto de palabras nuevas, cola y repaso.
// Cola en dos partes: primero TODOS los repasos vencidos (palabras empezadas un día anterior), después las
// nuevas: las que empezó hoy y le tocan de nuevo + nuevas hasta el presupuesto del día.
// Presupuesto = base por día − nuevas ya vistas hoy − N por cada «Otra vez» en un repaso de hoy (⚙ Opciones).

import * as db from "../datos/db.js";
import { ahora, hoy } from "../datos/tiempo.js";
import * as opciones from "./opciones.js";
import * as srs from "./srs.js";
import { NoExiste, registrar } from "./intentos.js";

export const todas = () => db.all("palabras");

export async function presupuesto(palabras = null, op = null) {
  op = op || (await opciones.get());
  palabras = palabras || (await todas());
  const h = hoy();
  const vistas = palabras.filter((w) => w.introduced && w.introduced >= h).length;
  const deHoy = await db.porIndice("intentos", "ts", IDBKeyRange.lowerBound(h));
  const otraVez = deHoy.filter((i) => i.type === "vokabeln" && i.payload.fase === "repaso" && i.payload.grade === 1).length;
  return { base: op.nuevas_por_dia, resta: op.restar_por_otra_vez, vistas_hoy: vistas, otra_vez_repaso_hoy: otraVez,
    lugar_reinsercion: op.lugar_reinsercion, quedan: Math.max(0, op.nuevas_por_dia - vistas - op.restar_por_otra_vez * otraVez) };
}

export const textoCompleto = (w) => `${w.artikel || ""} ${w.wort}`.trim();

export function card(w) {
  return { id: w.id, wort: w.wort, artikel: w.artikel, formen: w.formen, wortart: w.wortart, es: w.es, beispiel_de: w.beispiel_de,
    beispiel_es: w.beispiel_es, tema: w.tema, neu: !w.introduced, texto: textoCompleto(w) };
}

export function colas(palabras, t = ahora(), h = hoy()) {
  const repasos = palabras.filter((w) => w.introduced && w.introduced < h && w.due && w.due <= t).sort((a, b) => a.due.localeCompare(b.due));
  const aprendiendo = palabras.filter((w) => w.introduced && w.introduced >= h && w.due && w.due <= t).sort((a, b) => a.due.localeCompare(b.due));
  const sinVer = palabras.filter((w) => !w.introduced).sort((a, b) => a.id - b.id);
  return { repasos, aprendiendo, sinVer };
}

export async function queue() {
  const palabras = await todas();
  const { repasos, aprendiendo, sinVer } = colas(palabras);
  const b = await presupuesto(palabras);
  return { repasos: repasos.map(card), nuevas: [...aprendiendo, ...sinVer.slice(0, b.quedan)].map(card), presupuesto: b };
}

export async function review(id, grade, eingabe = null, korrekt = null) {
  if (!srs.GRADOS.includes(grade)) throw new Error("grade 1–4");
  const w = await db.get("palabras", id);
  if (!w) throw new NoExiste("palabra inexistente");
  const now = new Date();
  const t = ahora();
  const upd = srs.review(w, grade, now);
  const fase = w.introduced && w.introduced < hoy() ? "repaso" : "nueva";
  const nueva = !w.introduced;
  Object.assign(w, upd, { introduced: w.introduced || t, last_review: t });
  await db.tx(["palabras", "intentos"], "readwrite", async (h) => {
    await h.put("palabras", w);
    await registrar("vokabeln", id, { wort: textoCompleto(w), es: w.es, grade, eingabe, korrekt, nueva, fase }, (grade - 1) / 3, { ts: t, t: h });
  });
  return { ...upd, fase, presupuesto: await presupuesto() };
}

const ARTIKEL = new Set(["der", "die", "das", ""]);

/** Agrega palabras nuevas del tutor (ignora repetidas y mal formadas). Devuelve cuántas entraron. */
export async function agregar(lista, envioId = null, t = null) {
  const ts = ahora();
  const f = async (h) => {
    let n = 0;
    for (const w of lista) {
      const artikel = String(w.artikel || "").trim().toLowerCase();
      const wort = String(w.wort || "").trim();
      if (!ARTIKEL.has(artikel) || !wort || !w.es || !w.beispiel_de) continue;
      if (await h.indexGet("palabras", "clave", [wort, artikel])) continue;
      await h.add("palabras", { wort, artikel, formen: w.formen || "", wortart: w.wortart || "", es: w.es, beispiel_de: w.beispiel_de,
        beispiel_es: w.beispiel_es || "", tema: w.tema || "", created: ts, envio_id: envioId, ...srs.nuevaTarjeta() });
      n++;
    }
    return n;
  };
  return t ? f(t) : db.tx("palabras", "readwrite", f);
}

/** Resumen del estado de las palabras (para Estadísticas y el export al tutor). */
export function resumen(palabras) {
  return {
    total: palabras.length,
    sin_ver: palabras.filter((w) => !w.introduced).length,
    aprendiendo: palabras.filter((w) => w.introduced && (w.interval || 0) < 21).length,
    consolidadas: palabras.filter((w) => (w.interval || 0) >= 21).length,
    mas_olvidadas: [...palabras].filter((w) => (w.lapses || 0) >= 2).sort((a, b) => b.lapses - a.lapses).slice(0, 10).map(textoCompleto),
  };
}
