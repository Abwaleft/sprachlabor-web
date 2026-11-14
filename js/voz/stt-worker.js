// Reconocimiento de voz en el celular: Whisper base (transformers.js) en un Web Worker, para no trabar la pantalla.
// Medido en el celular de Victor: WASM RTF 0,72 (WebGPU fue más lento: 1,72), ~75 MB una sola vez (caché del navegador).
// Es PROVISORIO: Whisper a veces corrige el orden de las palabras del alumno. La transcripción literal la hace la PC.
//
// Mensajes: {tipo: "cargar"} → {tipo: "progreso", ...} … {tipo: "listo"}
//           {tipo: "transcribir", id, pcm (Float32Array 16 kHz)} → {tipo: "resultado", id, texto, ms}
//           errores: {tipo: "error", id?, mensaje}

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const MODELO = "Xenova/whisper-base";
let pipe = null;
let cargando = null;

async function cargar() {
  if (pipe) return pipe;
  if (cargando) return cargando;
  cargando = (async () => {
    const { pipeline, env } = await import(LIB);
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const p = await pipeline("automatic-speech-recognition", MODELO, {
      dtype: "q8", device: "wasm",
      progress_callback: (x) => {
        if (x.status === "progress") postMessage({ tipo: "progreso", archivo: x.file, cargado: x.loaded, total: x.total, pct: x.progress });
        else if (x.status === "done" || x.status === "ready") postMessage({ tipo: "progreso", archivo: x.file || "", estado: x.status });
      },
    });
    pipe = p;
    return p;
  })();
  try { return await cargando; } finally { cargando = null; }
}

onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.tipo === "cargar") {
      await cargar();
      postMessage({ tipo: "listo" });
    } else if (m.tipo === "transcribir") {
      const p = await cargar();
      const t0 = performance.now();
      const r = await p(m.pcm, { language: "german", task: "transcribe", chunk_length_s: 30, return_timestamps: false });
      postMessage({ tipo: "resultado", id: m.id, texto: (r && r.text ? r.text : "").trim(), ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    postMessage({ tipo: "error", id: m.id, mensaje: String(err && err.message || err) });
  }
};
