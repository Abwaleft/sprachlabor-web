// JSON Schemas de salida del tutor, adaptados a la salida estructurada de la API de Claude.
//
// Lo que acepta `output_config.format` (verificado en la documentación oficial, 13/11/2026): todos los objetos con
// `additionalProperties: false` y `required` con TODAS las propiedades; sin minItems > 1, maxItems, minimum, maximum,
// minLength, maxLength. Esas restricciones se validan acá después (validar()).
// El envío completo con un solo schema supera el límite de tamaño de la gramática ("compiled grammar is too large"),
// así que se parte en 4 llamadas (PARTES_ENVIO). Ojo: cada schema distinto es una entrada de caché distinta.

let base = null;

async function cargarBase() {
  if (base) return base;
  const [k, s] = await Promise.all([
    fetch("./tutor/schemas/korrektur.json").then((r) => r.json()),
    fetch("./tutor/schemas/sync_out.json").then((r) => r.json()),
  ]);
  base = { korrektur: k, sync: s };
  return base;
}

export const PARTES_ENVIO = {
  a: ["resumen", "feedback", "perfil", "nivel_consignas"],
  b: ["palabras_nuevas"],
  c: ["lote:hoeren", "lote:diktat", "lote:vorlesen"],
  d: ["lote:schreiben", "lote:sprechen"],
};

/** Adapta un schema a lo que acepta la API (ver arriba). Devuelve una copia. */
export function soSchema(schema) {
  const s = JSON.parse(JSON.stringify(schema));
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    if (n.type === "object" && n.properties) {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties);
    }
    for (const k of ["minimum", "maximum", "maxItems", "minLength", "maxLength"]) delete n[k];
    if (n.minItems > 1) n.minItems = 1;
    Object.values(n).forEach(walk);
  };
  walk(s);
  return s;
}

export async function schemaKorrektur() {
  return soSchema((await cargarBase()).korrektur);
}

export async function schemaEnvio(parte) {
  const s = (await cargarBase()).sync;
  const props = {};
  for (const c of PARTES_ENVIO[parte]) {
    if (c.startsWith("lote:")) {
      props.lote = props.lote || { type: "object", properties: {} };
      props.lote.properties[c.slice(5)] = s.properties.lote.properties[c.slice(5)];
    } else props[c] = s.properties[c];
  }
  return soSchema({ type: "object", properties: props });
}

/** Schema del test de nivel: el tutor devuelve el perfil inicial. */
export const SCHEMA_TEST_NIVEL = soSchema({
  type: "object",
  properties: {
    niveles: { type: "object", properties: { lesen: { type: "string" }, hoeren: { type: "string" }, schreiben: { type: "string" }, sprechen: { type: "string" } } },
    patrones: { type: "array", items: { type: "object", properties: { patron: { type: "integer" }, peso: { type: "number" }, nota: { type: "string" } } } },
    progreso_b1: { type: "number" },
    comentario: { type: "string", description: "3–5 frases para el alumno: qué mostró el test, por dónde empezar." },
    plan_arranque: { type: "string", description: "1–2 frases: en qué se va a enfocar el primer lote." },
  },
});

// ---------- validación posterior (lo que el schema de la API no puede expresar) ----------

const ENTRE = (v, lo, hi) => typeof v === "number" && v >= lo && v <= hi;

/** Devuelve una lista de problemas (vacía si está bien). No tira: el que llama decide qué hacer. */
export function validar(tipo, out) {
  const p = [];
  if (!out || typeof out !== "object") return ["la respuesta no es un objeto"];
  if (tipo === "korrektur") {
    for (const e of out.errores || []) if (!ENTRE(e.patron, 1, 9)) p.push(`patron fuera de rango: ${e.patron}`);
  }
  if (tipo === "envio-a") {
    if (out.perfil) {
      if (!ENTRE(out.perfil.progreso_b1, 0, 100)) p.push("progreso_b1 fuera de 0–100");
      for (const x of out.perfil.patrones || []) if (!ENTRE(x.peso, 0, 1)) p.push(`peso fuera de 0–1 (patrón ${x.patron})`);
    }
  }
  if (tipo === "envio-c") {
    for (const h of (out.lote && out.lote.hoeren) || []) {
      const n = (h.optionen_es || []).length;
      if (n < 2 || n > 4) p.push("Hören con cantidad rara de opciones");
      if (!Number.isInteger(h.richtig) || h.richtig < 0 || h.richtig >= n) p.push("Hören con richtig inválido");
    }
  }
  if (tipo === "envio-d") {
    for (const s of (out.lote && out.lote.schreiben) || []) {
      if (!ENTRE(s.palabras_min, 10, 200) || !ENTRE(s.palabras_max, 15, 300) || s.palabras_min > s.palabras_max) p.push(`extensión rara en «${s.titulo}»`);
    }
    for (const s of (out.lote && out.lote.sprechen) || []) if (!ENTRE(s.duracion_s, 20, 180)) p.push(`duración rara en «${s.titulo}»`);
  }
  if (tipo === "test") {
    if (!ENTRE(out.progreso_b1, 0, 100)) p.push("progreso_b1 fuera de 0–100");
  }
  return p;
}
