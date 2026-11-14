// Audio crudo: WAV (leer, escribir, rellenar con silencio) y remuestreo. Sin decodeAudioData: Chrome Android no
// decodifica ni sus propios webm ni algunos archivos; con PCM crudo no dependemos de ningún códec.

/** Float32 [-1, 1] → WAV 16 bits mono. */
export function wavDesdeFloat32(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: "audio/wav" });
}

/** Lee un WAV PCM (8/16/32 bits o float32, mono o estéreo) → {sampleRate, samples: Float32Array mono}. */
export function leerWav(buf) {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("no es un WAV");
  let o = 12;
  let fmt = null;
  let data = null;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const len = v.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === "data") { data = { off: o + 8, len: Math.min(len, buf.byteLength - o - 8) }; break; }
    o += 8 + len + (len % 2);
  }
  if (!fmt || !data) throw new Error("WAV incompleto");
  const { channels, bits, sampleRate, format } = fmt;
  const bytes = bits / 8;
  const n = Math.floor(data.len / bytes / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const p = data.off + (i * channels + c) * bytes;
      let s;
      if (format === 3) s = v.getFloat32(p, true);
      else if (bits === 16) s = v.getInt16(p, true) / 32768;
      else if (bits === 8) s = (v.getUint8(p) - 128) / 128;
      else if (bits === 32) s = v.getInt32(p, true) / 2147483648;
      else if (bits === 24) s = ((v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 8388608);
      else s = 0;
      acc += s;
    }
    out[i] = acc / channels;
  }
  return { sampleRate, samples: out };
}

/** Remuestreo lineal (suficiente para voz a 16 kHz). */
export function remuestrear(samples, deSR, aSR) {
  if (deSR === aSR) return samples;
  const n = Math.round((samples.length * aSR) / deSR);
  const out = new Float32Array(n);
  const r = deSR / aSR;
  for (let i = 0; i < n; i++) {
    const x = i * r;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (samples[j] || 0) * (1 - f) + (samples[j + 1] || 0) * f;
  }
  return out;
}

/** Agrega `segundos` de silencio al principio y al final (pedido del usuario: que no suene cortado). */
export function rellenarSilencio(samples, sampleRate, segundos = 1) {
  const pad = Math.round(sampleRate * segundos);
  const out = new Float32Array(samples.length + 2 * pad);
  out.set(samples, pad);
  return out;
}

export const duracion = (samples, sampleRate) => samples.length / sampleRate;
export const pico = (samples) => { let p = 0; for (let i = 0; i < samples.length; i++) p = Math.max(p, Math.abs(samples[i])); return p; };

/** Concatena Float32Array. */
export function concatenar(partes) {
  let n = 0;
  for (const p of partes) n += p.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
