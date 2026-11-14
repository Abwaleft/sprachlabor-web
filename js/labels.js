// Etiquetas compartidas. Los nombres de los patrones de error salen del perfil (son datos del alumno).

import { PATRONES_BASE } from "./logica/perfil.js";

export const HABILIDADES = { lesen: "Lesen", hoeren: "Hören", schreiben: "Schreiben", sprechen: "Sprechen" };
export const NIVEL_TXT = { A1: "A1", A2: "A2", B1: "B1", B2: "B2" };
export const MODS = { vokabeln: "Vokabeln", hoeren: "Hören", diktat: "Diktat", zahlen: "Zahlen", vorlesen: "Vorlesen", sprechen: "Sprechen", schreiben: "Schreiben" };

let patrones = Object.fromEntries(PATRONES_BASE.map((p) => [p.patron, p.nombre]));

/** Actualiza los nombres de patrón desde el perfil cargado. */
export function usarPerfil(perfil) {
  if (perfil && Array.isArray(perfil.patrones) && perfil.patrones.length) {
    patrones = Object.fromEntries(perfil.patrones.map((p) => [p.patron, p.nombre]));
  }
}

export const nombrePatron = (n) => patrones[n] || `Patrón ${n}`;
export const PATRONES = new Proxy({}, { get: (_, k) => (k in patrones ? patrones[k] : undefined), ownKeys: () => Object.keys(patrones), getOwnPropertyDescriptor: (_, k) => (k in patrones ? { enumerable: true, configurable: true, value: patrones[k] } : undefined) });
