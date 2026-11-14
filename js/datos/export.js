// Exportar e importar TODOS los datos del usuario (copia de seguridad, cambio de celular, migración desde la PC).
//
// Formato: {formato: "sprachlabor-datos", version, fecha, app, almacenes: {kv, palabras, items, intentos, feedback,
// envios, sesiones, ia_llamadas, grabaciones?}}. Los audios de Piper no se exportan (se regeneran).
// Las grabaciones (Blob) van en base64 solo si se pide (son pesadas).
//
// Importar reemplaza todo; antes guarda una copia en kv["copia_pre_import"] por si algo sale mal.
// La PC (sprachlabor-2.0, scripts/export_celular.py) produce este mismo formato a partir de la base SQLite.

import * as db from "./db.js";
import { ahora } from "./tiempo.js";

export const FORMATO = "sprachlabor-datos";
export const VERSION_FORMATO = 1;
const SIN_BLOBS = ["kv", "palabras", "items", "intentos", "feedback", "envios", "sesiones", "ia_llamadas"];

function blobABase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ABlob(b64, tipo) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo || "application/octet-stream" });
}

export async function exportar({ conGrabaciones = true, appVersion = "" } = {}) {
  const almacenes = {};
  await db.tx(SIN_BLOBS, "readonly", async (t) => {
    for (const n of SIN_BLOBS) {
      if (n === "kv") {
        const keys = await t.allKeys("kv");
        const vals = await t.all("kv");
        almacenes.kv = Object.fromEntries(keys.map((k, i) => [k, vals[i]]).filter(([k]) => !String(k).startsWith("copia_pre_")));
      } else {
        almacenes[n] = await t.all(n);
      }
    }
  });
  if (conGrabaciones) {
    const gs = await db.all("grabaciones");
    almacenes.grabaciones = [];
    for (const g of gs) {
      const { blob, ...resto } = g;
      almacenes.grabaciones.push({ ...resto, blob_b64: blob ? await blobABase64(blob) : null, blob_tipo: blob ? blob.type : null });
    }
  }
  return { formato: FORMATO, version: VERSION_FORMATO, fecha: ahora(), app: appVersion, almacenes };
}

export function validar(datos) {
  if (!datos || datos.formato !== FORMATO) throw new Error("Este archivo no es una copia de Sprachlabor.");
  if (!datos.almacenes || typeof datos.almacenes !== "object") throw new Error("La copia no tiene datos.");
  if ((datos.version || 1) > VERSION_FORMATO) throw new Error(`La copia es de una versión más nueva de la app (formato ${datos.version}). Actualizá la app primero.`);
  for (const n of ["palabras", "items", "intentos"]) {
    if (datos.almacenes[n] && !Array.isArray(datos.almacenes[n])) throw new Error(`«${n}» tiene un formato raro.`);
  }
  return {
    palabras: (datos.almacenes.palabras || []).length, items: (datos.almacenes.items || []).length,
    intentos: (datos.almacenes.intentos || []).length, feedback: (datos.almacenes.feedback || []).length,
    envios: (datos.almacenes.envios || []).length, grabaciones: (datos.almacenes.grabaciones || []).length,
    fecha: datos.fecha, origen: datos.origen || datos.app || "",
  };
}

/** Reemplaza todos los datos por los de la copia. Guarda antes una copia de lo actual en kv["copia_pre_import"]. */
export async function importar(datos, { guardarCopiaPrevia = true } = {}) {
  const resumen = validar(datos);
  const previa = guardarCopiaPrevia ? await exportar({ conGrabaciones: false }) : null;
  const A = datos.almacenes;
  const grabaciones = (A.grabaciones || []).map(({ blob_b64, blob_tipo, ...g }) => ({ ...g, blob: blob_b64 ? base64ABlob(blob_b64, blob_tipo) : null }));
  const conAudio = [...SIN_BLOBS, "grabaciones", "audio"];
  await db.tx(conAudio, "readwrite", async (t) => {
    for (const n of conAudio) await t.clear(n);
    for (const [k, v] of Object.entries(A.kv || {})) if (!String(k).startsWith("copia_pre_")) await t.put("kv", v, k);
    for (const n of ["palabras", "items", "intentos", "feedback", "envios", "sesiones", "ia_llamadas"]) {
      for (const fila of A[n] || []) await t.put(n, fila);
    }
    for (const g of grabaciones) await t.put("grabaciones", g);
    if (previa) await t.put("kv", { fecha: ahora(), datos: previa }, "copia_pre_import");
    await t.put("kv", ahora(), "ultimo_import");
  });
  return resumen;
}

/** Descarga un JSON como archivo (copia de seguridad). */
export function descargarJSON(obj, nombre) {
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return blob.size;
}

export const nombreCopia = (prefijo = "sprachlabor") => `${prefijo}_${ahora().replace(/[:T]/g, "-").slice(0, 16)}.json`;
