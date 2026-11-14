// Comparación de dictado palabra por palabra (LCS). Mayúsculas: no bajan el puntaje pero se marcan fuera del inicio
// de oración. Variantes sin diéresis (u por ü, ss por ß) y palabras fuera de orden valen medio punto.

// Ojo: en JavaScript \w es solo ASCII (también con la bandera u): hay que usar \p{L} para que ü, ä, ö y ß cuenten como letra.
export const TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function tokens(s) {
  const out = [];
  for (const m of s.matchAll(TOKEN)) {
    const before = s.slice(0, m.index).replace(/[ \t\r\n"„“”'«»(]+$/, "");
    out.push([m[0], !before || ".!?:".includes(before.at(-1))]);
  }
  return out;
}

function fold(w) {
  w = w.toLowerCase();
  for (const [a, b] of [["ä", "a"], ["ö", "o"], ["ü", "u"], ["ß", "ss"], ["ae", "a"], ["oe", "o"], ["ue", "u"]]) w = w.split(a).join(b);
  return w;
}

function classify(ref, start, hyp) {
  if (ref.toLowerCase() === hyp.toLowerCase()) {
    const up = (c) => c !== c.toLowerCase();
    if (!start && up(ref[0]) !== up(hyp[0])) return ["mayuscula", 1];
    return ["ok", 1];
  }
  return ["umlaut", 0.5];
}

export function compare(referenz, eingabe) {
  const R = tokens(referenz);
  const H = tokens(eingabe).map(([w]) => w);
  const n = R.length;
  const m = H.length;
  const rf = R.map(([w]) => fold(w));
  const hf = H.map(fold);
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) L[i][j] = rf[i] === hf[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const palabras = [];
  let total = 0;
  const dels = [];
  const ins = [];
  const flush = () => {
    for (let k = 0; k < Math.max(dels.length, ins.length); k++) {
      if (k < dels.length && k < ins.length) palabras.push({ ref: R[dels[k]][0], hyp: H[ins[k]], estado: "mal" });
      else if (k < dels.length) palabras.push({ ref: R[dels[k]][0], hyp: null, estado: "falta" });
      else palabras.push({ ref: null, hyp: H[ins[k]], estado: "sobra" });
    }
    dels.length = 0;
    ins.length = 0;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && rf[i] === hf[j]) {
      flush();
      const [estado, pts] = classify(R[i][0], R[i][1], H[j]);
      total += pts;
      palabras.push({ ref: R[i][0], hyp: H[j], estado });
      i++;
      j++;
    } else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) {
      dels.push(i);
      i++;
    } else {
      ins.push(j);
      j++;
    }
  }
  flush();
  for (const p of palabras) {
    if (p.estado !== "falta") continue;
    for (const q of palabras) {
      if (q.estado === "sobra" && fold(q.hyp) === fold(p.ref)) {
        p.hyp = q.hyp;
        p.estado = "orden";
        q.estado = "_borrar";
        total += 0.5;
        break;
      }
    }
  }
  const limpias = palabras.filter((p) => p.estado !== "_borrar");
  const extras = limpias.filter((p) => p.estado === "sobra").length;
  const score = n ? total / Math.max(n + extras, 1) : 0;
  return { score: Math.round(score * 1000) / 1000, palabras: limpias, errores: limpias.filter((p) => p.estado !== "ok") };
}

/** Cantidad de palabras de un texto (misma regla que el tutor usa para contar). */
export const contarPalabras = (s) => (String(s || "").match(TOKEN) || []).length;
