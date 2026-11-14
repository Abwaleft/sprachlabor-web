// El ÚNICO punto por donde la app habla con la IA.
//
// Interfaz estable para el resto de la app:
//   ajustes() / guardarAjustes({api_key, modelo, modelo_correcciones, proveedor})
//   listo()                       → true si hay con qué llamar
//   llamar({tipo, system, usuario, schema, maxTokens, effort, modelo})  → {salida, uso, costo_usd, segundos, modelo}
//   probarClave()
//   historial()                   → últimas llamadas (tokens y costo)
//
// Hoy el proveedor es "claude-directo" (js/ia/claude.js): el celular llama a la API con la clave del usuario.
// Mañana, al vender, un proveedor "servidor" implementa la misma función `llamar(cfg, req)` contra un servidor
// propio (login, clave del servidor, límites por usuario) y nada más cambia.
//
// Cada llamada queda registrada en el almacén `ia_llamadas` (tokens, costo, tiempo, ok/error) para Estadísticas.
// La clave vive en kv["ia_ajustes"] (IndexedDB del celular) y nunca sale de acá salvo hacia la API.

import * as db from "../datos/db.js";
import { ahora } from "../datos/tiempo.js";
import * as claude from "./claude.js";
import { costo, MODELO_DEFECTO, MODELOS } from "./costos.js";

export { ErrorIA } from "./claude.js";

const DEFAULTS = { proveedor: "claude-directo", api_key: "", modelo: MODELO_DEFECTO, modelo_correcciones: MODELO_DEFECTO };
let cache = null;
let fetchImpl = null;  // pruebas: respuestas grabadas

export function usarFetch(f) { fetchImpl = f; }

export async function ajustes() {
  if (!cache) cache = { ...DEFAULTS, ...((await db.kvGet("ia_ajustes")) || {}) };
  return cache;
}

export async function guardarAjustes(nuevos) {
  const a = { ...(await ajustes()) };
  for (const k of Object.keys(DEFAULTS)) if (k in nuevos) a[k] = nuevos[k];
  if (!MODELOS[a.modelo]) a.modelo = MODELO_DEFECTO;
  if (!MODELOS[a.modelo_correcciones]) a.modelo_correcciones = MODELO_DEFECTO;
  a.api_key = String(a.api_key || "").trim();
  await db.kvSet("ia_ajustes", a);
  cache = a;
  return { ...a, api_key: a.api_key ? "•••" + a.api_key.slice(-4) : "" };
}

export async function listo() {
  const a = await ajustes();
  return a.proveedor === "claude-directo" ? !!a.api_key : false;
}

const PROVEEDORES = {
  "claude-directo": {
    llamar: (a, req) => claude.llamar(a.api_key, req, fetchImpl || fetch),
    probar: (a) => claude.probarClave(a.api_key, fetchImpl || fetch),
  },
};

async function registrar(fila) {
  try { await db.add("ia_llamadas", fila); } catch { /* el registro no debe romper la llamada */ }
}

/**
 * req = {tipo ("korrektur" | "envio-a" | … | "test" | "prueba"), system, usuario, schema, maxTokens, effort, modelo?}.
 * Devuelve {salida, texto, uso, costo_usd, segundos, modelo, stop_reason}. Lanza ErrorIA (ya registrada).
 */
export async function llamar(req) {
  const a = await ajustes();
  const prov = PROVEEDORES[a.proveedor];
  if (!prov) throw new claude.ErrorIA(`Proveedor de IA desconocido: ${a.proveedor}`, { tipo: "config" });
  const modelo = req.modelo || (req.tipo === "korrektur" ? a.modelo_correcciones : a.modelo);
  const ts = ahora();
  try {
    const r = await prov.llamar(a, { ...req, modelo });
    const c = costo(r.modelo, r.uso);
    await registrar({ ts, tipo: req.tipo, modelo: r.modelo, ok: true, segundos: r.segundos, costo_usd: c,
      tokens_in: r.uso.input_tokens || 0, tokens_out: r.uso.output_tokens || 0,
      cache_read: r.uso.cache_read_input_tokens || 0, cache_write: r.uso.cache_creation_input_tokens || 0, stop_reason: r.stop_reason });
    return { ...r, costo_usd: c };
  } catch (e) {
    const uso = (e && e.uso) || null;
    await registrar({ ts, tipo: req.tipo, modelo, ok: false, segundos: null, costo_usd: uso ? costo(modelo, uso) : 0,
      tokens_in: uso ? uso.input_tokens || 0 : 0, tokens_out: uso ? uso.output_tokens || 0 : 0,
      cache_read: uso ? uso.cache_read_input_tokens || 0 : 0, cache_write: uso ? uso.cache_creation_input_tokens || 0 : 0,
      error: e && e.tipo ? e.tipo : "error", mensaje: e && e.message ? String(e.message).slice(0, 200) : "" });
    throw e;
  }
}

export async function probarClave() {
  const a = await ajustes();
  const r = await PROVEEDORES[a.proveedor].probar(a);
  await registrar({ ts: ahora(), tipo: "prueba", modelo: "claude-haiku-5-5", ok: true, segundos: r.segundos, costo_usd: costo("claude-haiku-5-5", r.uso),
    tokens_in: r.uso.input_tokens || 0, tokens_out: r.uso.output_tokens || 0, cache_read: 0, cache_write: 0 });
  return r;
}

export const historial = (n = 20) => db.all("ia_llamadas").then((rows) => rows.slice(-n).reverse());
