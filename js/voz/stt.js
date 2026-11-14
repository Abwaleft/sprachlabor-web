// Cliente del reconocedor (Whisper en un Web Worker). Carga perezosa: la primera vez baja ~75 MB.

export const estado = { cargado: false, cargando: false, progreso: 0, archivo: "", error: null, soportado: typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" };
const oyentes = new Set();
let worker = null;
let seq = 0;
const pendientes = new Map();
let cargaPromesa = null;

export function onCambio(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
const avisar = () => { for (const fn of oyentes) { try { fn({ ...estado }); } catch { /* */ } } };

function crear() {
  if (worker) return worker;
  worker = new Worker(new URL("./stt-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.tipo === "progreso") {
      if (m.total) estado.progreso = m.cargado / m.total;
      estado.archivo = m.archivo || estado.archivo;
      avisar();
    } else if (m.tipo === "listo") {
      estado.cargado = true; estado.cargando = false; estado.progreso = 1; avisar();
      const p = pendientes.get("cargar"); if (p) { p.res(); pendientes.delete("cargar"); }
    } else if (m.tipo === "resultado") {
      const p = pendientes.get(m.id); if (p) { p.res(m); pendientes.delete(m.id); }
    } else if (m.tipo === "error") {
      estado.error = m.mensaje;
      if (!estado.cargado) estado.cargando = false;
      avisar();
      const p = pendientes.get(m.id || "cargar"); if (p) { p.rej(new Error(m.mensaje)); pendientes.delete(m.id || "cargar"); }
    }
  };
  worker.onerror = (e) => { estado.error = e.message || "falló el reconocedor"; estado.cargando = false; avisar(); };
  return worker;
}

/** Carga el modelo (idempotente). */
export function cargar() {
  if (estado.cargado) return Promise.resolve();
  if (cargaPromesa) return cargaPromesa;
  estado.cargando = true;
  estado.error = null;
  avisar();
  cargaPromesa = new Promise((res, rej) => {
    pendientes.set("cargar", { res, rej });
    crear().postMessage({ tipo: "cargar" });
  }).finally(() => { cargaPromesa = null; });
  return cargaPromesa;
}

/** Transcribe PCM 16 kHz. Devuelve {texto, ms}. */
export async function transcribir(pcm) {
  await cargar();
  const id = `t${++seq}`;
  return new Promise((res, rej) => {
    pendientes.set(id, { res, rej });
    const copia = new Float32Array(pcm);
    crear().postMessage({ tipo: "transcribir", id, pcm: copia }, [copia.buffer]);
  });
}

export function descartar() {
  if (worker) { worker.terminate(); worker = null; }
  estado.cargado = false;
  estado.cargando = false;
  avisar();
}
