// Atajos de teclado de la vista actual. Una sola función activa a la vez; el router la limpia al navegar.

export function setKeys(fn) {
  window.onkeydown = fn;
}

export function clearKeys() {
  window.onkeydown = null;
}

/** true si el foco está en un campo de texto (los atajos de una tecla no deben disparar ahí). */
export function typing() {
  const el = document.activeElement;
  return !!el && ["INPUT", "TEXTAREA"].includes(el.tagName);
}
