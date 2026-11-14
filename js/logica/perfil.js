// Perfil del alumno: es un DATO (kv["perfil"]), no parte del tutor. Lo crea el test de nivel inicial
// (o se importa de una copia) y lo actualiza el tutor en cada envío.
//
// {
//   nombre, idiomas: {nativo, otros: [..]}, idioma_explicaciones, meta: "B1" | "B2", temas: [..],
//   niveles: {lesen, hoeren, schreiben, sprechen},          ← texto corto por habilidad
//   patrones: [{patron: 1..N, nombre, descripcion, peso: 0–1, nota}],   ← errores prioritarios
//   progreso_b1: 0–100, fecha, origen: "test" | "import" | "tutor"
// }

import * as db from "../datos/db.js";
import { hoy } from "../datos/tiempo.js";

/** Patrones de error típicos de quien aprende alemán desde el español/portugués. El tutor ajusta los pesos. */
export const PATRONES_BASE = [
  { patron: 1, nombre: "Verbo en 2.ª posición (V2) y al final en subordinadas", descripcion: "El verbo conjugado va en segundo lugar en la oración principal (Jetzt lerne ich) y al final con weil/dass/wenn." },
  { patron: 2, nombre: "Conjugación y pasado (Perfekt)", descripcion: "Terminaciones del presente y Perfekt con haben/sein + participio (bin gefahren, habe besucht)." },
  { patron: 3, nombre: "Sustantivos: mayúscula, artículo, caso y preposición", descripcion: "Género y caso del artículo, preposición correcta (an der Universität, ins/im Kino, zur Arbeit)." },
  { patron: 4, nombre: "Números al escuchar y vocabulario frecuente", descripcion: "Entender números, horas y precios; vocabulario de alta frecuencia." },
  { patron: 5, nombre: "Sonido → letra e interferencia de otros idiomas", descripcion: "z = /ts/, ä/ö/ü, sch, ie/ei, j; palabras calcadas del inglés o del español." },
];

export const HABILIDADES = { lesen: "Lesen", hoeren: "Hören", schreiben: "Schreiben", sprechen: "Sprechen" };

export const TEMAS_SUGERIDOS = ["vida diaria", "viajes por Alemania", "trabajo y oficina", "deporte y entrenamiento", "ingeniería y tecnología",
  "energía y medio ambiente", "ciencia", "finanzas", "cocina y comida", "música y cine", "salud", "familia y amigos", "estudios y universidad"];

export function perfilVacio() {
  return {
    nombre: "", idiomas: { nativo: "español", otros: [] }, idioma_explicaciones: "español rioplatense", meta: "B1",
    temas: ["vida diaria", "viajes por Alemania"],
    niveles: { lesen: "A1", hoeren: "A1", schreiben: "A1", sprechen: "A1" },
    patrones: PATRONES_BASE.map((p) => ({ ...p, peso: 0.7, nota: "" })),
    progreso_b1: 0, fecha: hoy(), origen: "vacio",
  };
}

export const get = async () => (await db.kvGet("perfil")) || null;
export const set = (p) => db.kvSet("perfil", p);
export const existe = async () => !!(await get());

/** Mezcla lo que devuelve el tutor (niveles, patrones con peso/nota, progreso_b1) con los datos fijos del perfil. */
export async function actualizarDesdeTutor(nuevo) {
  const p = (await get()) || perfilVacio();
  if (nuevo.niveles) p.niveles = { ...p.niveles, ...nuevo.niveles };
  if (Array.isArray(nuevo.patrones)) {
    const base = Object.fromEntries(p.patrones.map((x) => [x.patron, x]));
    for (const x of nuevo.patrones) {
      if (!base[x.patron]) continue;
      base[x.patron].peso = typeof x.peso === "number" ? Math.max(0, Math.min(1, x.peso)) : base[x.patron].peso;
      if (x.nota) base[x.patron].nota = x.nota;
    }
  }
  if (typeof nuevo.progreso_b1 === "number") p.progreso_b1 = Math.max(0, Math.min(100, nuevo.progreso_b1));
  p.fecha = hoy();
  p.origen = "tutor";
  await set(p);
  return p;
}

/** Perfil como lo ve el tutor (sin nombre: el tutor no necesita datos personales más allá de los idiomas). */
export function paraTutor(p) {
  if (!p) return null;
  return {
    idiomas: p.idiomas, idioma_explicaciones: p.idioma_explicaciones, meta: p.meta, temas: p.temas,
    niveles: p.niveles, progreso_b1: p.progreso_b1, fecha: p.fecha,
    patrones: p.patrones.map(({ patron, nombre, descripcion, peso, nota }) => ({ patron, nombre, descripcion, peso, nota })),
  };
}

export const nombrePila = (p) => (p && p.nombre ? p.nombre.trim().split(/\s+/)[0] : "");
