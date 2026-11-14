// Migraciones de DATOS (las de almacenes e índices van en db.js, por versión de IndexedDB).
// Cada una corre una sola vez, en orden; kv["esquema_datos"] guarda la última aplicada.
// Antes de correr migraciones pendientes sobre una base con datos, se guarda una copia completa en
// kv["copia_pre_migracion"] (la pantalla Datos permite bajarla).
//
// Para agregar una: {version: N, nombre, fn: async () => {...}} al final de MIGRACIONES. Nunca editar una ya aplicada.

import { exportar } from "./export.js";
import * as db from "./db.js";
import { ahora } from "./tiempo.js";

export const MIGRACIONES = [
  { version: 1, nombre: "esquema inicial", fn: async () => {} },
];

export const versionActual = () => MIGRACIONES[MIGRACIONES.length - 1].version;

export async function pendientes() {
  const v = (await db.kvGet("esquema_datos", 0)) || 0;
  return MIGRACIONES.filter((m) => m.version > v);
}

async function hayDatos() {
  return (await db.count("palabras")) + (await db.count("intentos")) > 0;
}

/** Aplica las pendientes. Devuelve las aplicadas. */
export async function aplicar() {
  const pend = await pendientes();
  if (!pend.length) return [];
  if (await hayDatos()) {
    const copia = await exportar({ conGrabaciones: false });
    await db.kvSet("copia_pre_migracion", { fecha: ahora(), hasta_version: pend[pend.length - 1].version, datos: copia });
  }
  const aplicadas = [];
  for (const m of pend) {
    await m.fn();
    await db.kvSet("esquema_datos", m.version);
    const hist = (await db.kvGet("migraciones_aplicadas", [])) || [];
    hist.push({ version: m.version, nombre: m.nombre, fecha: ahora() });
    await db.kvSet("migraciones_aplicadas", hist);
    aplicadas.push(m);
  }
  return aplicadas;
}
