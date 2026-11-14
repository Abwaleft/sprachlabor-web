// Estado general (lo que muestran Heute y la pantalla Datos).

import * as db from "../datos/db.js";
import { ahora, hoy } from "../datos/tiempo.js";
import { itemsDeTipo } from "./intentos.js";
import * as perfil from "./perfil.js";
import * as vokabeln from "./vokabeln.js";

export async function status() {
  const t = ahora();
  const palabras = await vokabeln.todas();
  const b = await vokabeln.presupuesto(palabras);
  const nuevas = palabras.filter((w) => !w.introduced).length;
  const items = {};
  for (const typ of ["hoeren", "diktat", "schreiben", "sprechen", "vorlesen"]) {
    const rows = await itemsDeTipo(typ);
    items[typ] = { frescos: rows.filter((r) => !(r.times_done || 0)).length, total: rows.length };
  }
  const envios = (await db.all("envios")).filter((e) => e.status === "ok").sort((a, b) => b.id - a.id);
  const corregidos = new Set((await db.all("feedback")).map((f) => f.attempt_id));
  const intentos = await db.all("intentos");
  return {
    vokabeln: { faellig: palabras.filter((w) => w.introduced && w.due && w.due <= t).length, neu_hoy: Math.min(nuevas, b.quedan), sin_ver: nuevas, total: palabras.length },
    ...items,
    pendientes: intentos.filter((a) => !a.enviado).length,
    sin_corregir: intentos.filter((a) => ["schreiben", "sprechen_frei"].includes(a.type) && !corregidos.has(a.id)).length,
    hoy: intentos.filter((a) => a.ts >= hoy()).length,
    ultimo_envio: envios[0] ? envios[0].finished : null,
    perfil: await perfil.get(),
  };
}
