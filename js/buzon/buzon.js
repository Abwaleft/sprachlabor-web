// Buzón PC ↔ celular en un repo privado de GitHub (plan B de Victor para el reconocimiento literal).
//
// Carpetas del repo:   entrada/<id>.<ext> + entrada/<id>.json   (el celular sube la grabación y sus datos)
//                      salida/<id>.json                          (la PC deja la transcripción literal wav2vec2 + Whisper)
//                      copias/<fecha>.json                       (copias de seguridad de los datos, opcional)
// El taller de la PC (sprachlabor-2.0/scripts/taller.py) procesa `entrada/`, escribe en `salida/` y borra la entrada.
// El celular, cuando tiene internet, sube lo pendiente y recoge lo que haya en `salida/`, actualizando el intento.
// Configuración en kv["buzon"] = {owner, repo, token, copias_auto}.

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";
import * as produktion from "../logica/produktion.js";
import * as gh from "./github.js";

export const estado = { configurado: false, sincronizando: false, ultimo: null, error: null, pendientes: 0 };
const oyentes = new Set();
export function onCambio(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
const avisar = () => { for (const fn of oyentes) { try { fn({ ...estado }); } catch { /* */ } } };

export async function config() {
  const c = (await db.kvGet("buzon")) || null;
  estado.configurado = !!(c && c.owner && c.repo && c.token);
  return c;
}

export async function guardarConfig(c) {
  const limpio = { owner: String(c.owner || "").trim(), repo: String(c.repo || "").trim(), token: String(c.token || "").trim(), copias_auto: !!c.copias_auto };
  if (!limpio.owner || !limpio.repo || !limpio.token) throw new Error("Faltan usuario, repo o token.");
  await gh.probar(limpio);
  await db.kvSet("buzon", limpio);
  estado.configurado = true;
  estado.error = null;
  avisar();
  return { ...limpio, token: "•••" + limpio.token.slice(-4) };
}

export async function borrarConfig() {
  await db.kvDel("buzon");
  estado.configurado = false;
  avisar();
}

/** Guarda una grabación para mandar al taller (y la deja ligada al intento). */
export async function encolarGrabacion({ attempt_id, blob, mime, segundos, tipo = "sprechen", texto = null }) {
  const g = { attempt_id, blob, mime: mime || blob.type || "audio/wav", segundos, tipo, texto, estado: "pendiente", creado: ahora(), subido: null, id_buzon: null };
  g.id = await db.add("grabaciones", g);
  estado.pendientes = await db.tx("grabaciones", "readonly", (t) => t.indexCount("grabaciones", "estado", "pendiente"));
  avisar();
  return g;
}

export const pendientes = () => db.porIndice("grabaciones", "estado", "pendiente");
export const subidas = () => db.porIndice("grabaciones", "estado", "subida");

const ext = (mime) => ({ "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" }[String(mime).split(";")[0]] || "bin");

/** Sube lo pendiente y recoge lo transcripto. Devuelve {subidas, recibidas} o null si no hay buzón / ya corría. */
export async function sincronizar() {
  const c = await config();
  if (!c || estado.sincronizando || !navigator.onLine) return null;
  estado.sincronizando = true;
  estado.error = null;
  avisar();
  const res = { subidas: 0, recibidas: 0, errores: 0 };
  try {
    for (const g of await pendientes()) {
      try {
        const id = `${g.creado.replace(/[:T]/g, "-")}_${g.id}`;
        const a = await db.get("intentos", g.attempt_id);
        await gh.escribir(c, `entrada/${id}.${ext(g.mime)}`, g.blob, `grabación ${id}`);
        await gh.escribir(c, `entrada/${id}.json`, JSON.stringify({ id, attempt_id: g.attempt_id, tipo: g.tipo, segundos: g.segundos, mime: g.mime, texto: g.texto,
          consigna: a ? a.payload.consigna_de : null, creado: g.creado, app: "sprachlabor-web" }, null, 1), `datos ${id}`);
        g.estado = "subida";
        g.subido = ahora();
        g.id_buzon = id;
        g.blob = null;  // ya está en el buzón: liberar espacio en el celular
        await db.put("grabaciones", g);
        res.subidas++;
      } catch (e) { res.errores++; estado.error = e.message; if (e.status === 401 || e.status === 403 || e.status === 0) break; }
    }
    for (const s of await subidas()) {
      try {
        const salida = await gh.leerJSON(c, `salida/${s.id_buzon}.json`);
        if (!salida) continue;
        if (salida.error) { s.estado = "fallida"; s.error = salida.error; await db.put("grabaciones", s); await gh.borrar(c, `salida/${s.id_buzon}.json`); continue; }
        await produktion.sprechenActualizarTranscripcion(s.attempt_id, salida);
        s.estado = "transcrita";
        s.recibido = ahora();
        await db.put("grabaciones", s);
        await gh.borrar(c, `salida/${s.id_buzon}.json`);
        res.recibidas++;
      } catch (e) { res.errores++; estado.error = e.message; }
    }
    estado.ultimo = { cuando: ahora(), ...res };
    estado.pendientes = (await pendientes()).length;
    if (res.recibidas) window.dispatchEvent(new CustomEvent("sl:buzon", { detail: res }));
    return res;
  } finally {
    estado.sincronizando = false;
    avisar();
  }
}

/** Sube una copia de seguridad (JSON) a copias/. */
export async function subirCopia(datos, nombre) {
  const c = await config();
  if (!c) throw new Error("No hay buzón configurado.");
  await gh.escribir(c, `copias/${nombre}`, JSON.stringify(datos), `copia ${nombre}`);
  await db.kvSet("ultima_copia_buzon", ahora());
  return true;
}

export async function listarCopias() {
  const c = await config();
  if (!c) return [];
  return (await gh.listar(c, "copias")).sort((a, b) => b.name.localeCompare(a.name));
}

export async function bajarCopia(nombre) {
  const c = await config();
  return gh.leerJSON(c, `copias/${nombre}`);
}

export async function resumen() {
  const todas = await db.all("grabaciones");
  const n = (e) => todas.filter((g) => g.estado === e).length;
  return { pendientes: n("pendiente"), subidas: n("subida"), transcritas: n("transcrita"), fallidas: n("fallida"), total: todas.length };
}
