// Precios de los modelos (US$ por millón de tokens) y cálculo del costo de una llamada a partir de `usage`.
// Fuente: documentación oficial de precios de la API de Claude, verificada el 13/11/2026.
// Orden: entrada, salida, escritura de caché (5 min, 1,25×), lectura de caché.

export const MODELOS = {
  "claude-sonnet-5-5": { nombre: "Sonnet 5.5", precios: [2.0, 10.0, 2.5, 0.1], nota: "Elegido para todo: calidad a la par de Opus en lo que importa, por menos de la mitad." },
  "claude-haiku-5-5": { nombre: "Haiku 5.5", precios: [0.1, 0.5, 0.125, 0.01], nota: "Modo económico para correcciones (20× más barato; a veces propone presente donde iba pasado)." },
  "claude-opus-5-5": { nombre: "Opus 5.5", precios: [4.0, 20.0, 5.0, 0.2], nota: "El más fino y el más caro y lento; no hace falta." },
};
export const MODELO_DEFECTO = "claude-sonnet-5-5";

export function costo(modelo, uso) {
  const m = MODELOS[modelo];
  if (!m || !uso) return 0;
  const [pin, pout, pw, pr] = m.precios;
  const c = ((uso.input_tokens || 0) * pin + (uso.output_tokens || 0) * pout
    + (uso.cache_creation_input_tokens || 0) * pw + (uso.cache_read_input_tokens || 0) * pr) / 1e6;
  return Math.round(c * 1e6) / 1e6;
}

export const fmtUSD = (x) => (x == null ? "—" : x < 0.01 ? `US$ ${x.toFixed(4)}` : `US$ ${x.toFixed(2)}`);

/** Estimación grosera antes de llamar (para avisar): tokens ≈ caracteres / 3,5. */
export function estimar(modelo, caracteresEntrada, tokensSalida) {
  const m = MODELOS[modelo] || MODELOS[MODELO_DEFECTO];
  return ((caracteresEntrada / 3.5) * m.precios[0] + tokensSalida * m.precios[1]) / 1e6;
}
