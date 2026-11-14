// Router por hash: #/ (Heute), #/vokabeln, #/hoeren, … Limpia atajos, grabación y audio al cambiar de vista.

import { stopAudio } from "./audio.js";
import { $, app } from "./dom.js";
import { errorHTML } from "./errores.js";
import { clearKeys } from "./keys.js";
import * as perfil from "./logica/perfil.js";
import { cancelActiveRecorder } from "./recorder.js";
import { routeChanged } from "./session.js";
import { datos } from "./views/datos.js";
import { diktat } from "./views/diktat.js";
import { enviar, fertig, rueckmeldung } from "./views/envio.js";
import { estadisticas } from "./views/estadisticas.js";
import { heute } from "./views/heute.js";
import { hoeren } from "./views/hoeren.js";
import { ajustesIA } from "./views/ia.js";
import { inicio } from "./views/inicio.js";
import { opcionesView } from "./views/opciones.js";
import { schreiben } from "./views/schreiben.js";
import { sprechen } from "./views/sprechen.js";
import { vokabeln } from "./views/vokabeln.js";
import { vorlesen } from "./views/vorlesen.js";
import { zahlen } from "./views/zahlen.js";

export const routes = { "": heute, heute, vokabeln, hoeren, diktat, zahlen, vorlesen, sprechen, schreiben,
  enviar, rueckmeldung, fertig, estadisticas, opciones: opcionesView, datos, ia: ajustesIA, inicio };

const SIN_PERFIL = ["inicio", "datos", "ia"];

export async function router() {
  clearKeys();
  window.onresize = null;
  cancelActiveRecorder();
  stopAudio();
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  routeChanged(name);
  let view = routes[name] || heute;
  if (!SIN_PERFIL.includes(name) && !(await perfil.existe())) view = inicio;  // sin perfil: primero el test de nivel
  delete document.body.dataset.ruta;  // la pone de nuevo cuando la vista terminó de dibujarse (lo usan las pruebas)
  try {
    await view();
  } catch (err) {
    console.error(err);
    app.innerHTML = errorHTML(err, "No pude cargar esta pantalla");
    $("#retry").onclick = router;
  }
  document.body.dataset.ruta = name || "heute";
}

export function start() {
  window.addEventListener("hashchange", router);
  router();
}
