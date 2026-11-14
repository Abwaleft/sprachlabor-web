// Punto de entrada: base de datos (migraciones), service worker, buzón, barra de estado, ayuda y router.

import { $, esc } from "./dom.js";
import * as buzon from "./buzon/buzon.js";
import * as db from "./datos/db.js";
import * as migraciones from "./datos/migraciones.js";
import { initHelp } from "./help.js";
import { usarPerfil } from "./labels.js";
import * as envio from "./logica/envio.js";
import * as perfil from "./logica/perfil.js";
import * as seeds from "./logica/seeds.js";
import { start } from "./router.js";
import { resumeSession } from "./session.js";
import * as tts from "./voz/tts.js";

// ---------- service worker (instalable; funciona sin internet) ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const habiaSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("service worker:", e));
  let recargado = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (habiaSW && !recargado) { recargado = true; location.reload(); }
  });
}

// ---------- barra de estado (envío en curso, buzón, audios en cola) ----------
const banner = $("#conexion");

function actualizarBanner() {
  if (!banner) return;
  const partes = [];
  const e = envio.status();
  if (e.running) partes.push(`<span class="spinner"></span>Enviando al tutor: ${esc(e.stage)}… <a href="#/enviar">ver</a>`);
  if (tts.estado.cola) partes.push(`🔊 generando audios: ${tts.estado.cola} en cola`);
  if (buzon.estado.sincronizando) partes.push(`<span class="spinner"></span>buzón: subiendo grabaciones…`);
  else if (buzon.estado.pendientes) partes.push(`📮 ${buzon.estado.pendientes} ${buzon.estado.pendientes === 1 ? "grabación" : "grabaciones"} por mandar a la PC`);
  if (!navigator.onLine) partes.push("sin internet: todo lo local funciona; el tutor y el buzón esperan");
  banner.hidden = !partes.length;
  banner.className = "banner " + (navigator.onLine ? "on" : "off");
  banner.innerHTML = partes.join(" · ");
}

envio.onCambio(actualizarBanner);
tts.onCambio(actualizarBanner);
buzon.onCambio(actualizarBanner);
window.addEventListener("online", () => { actualizarBanner(); buzon.sincronizar().catch(() => {}); });
window.addEventListener("offline", actualizarBanner);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buzon.sincronizar().catch(() => {}); });

async function arrancar() {
  try {
    await db.abrir();
    const aplicadas = await migraciones.aplicar();
    if (aplicadas.length) console.info("migraciones de datos aplicadas:", aplicadas.map((m) => m.version));
    if (await perfil.existe()) {
      await seeds.asegurar();
      usarPerfil(await perfil.get());
    }
    db.persistir().catch(() => {});
    buzon.config().then(() => { buzon.resumen().then((r) => { buzon.estado.pendientes = r.pendientes; actualizarBanner(); }); buzon.sincronizar().catch(() => {}); });
    tts.vozLista().then((v) => { if (v) setTimeout(() => tts.pregenerarFaltantes().catch(() => {}), 4000); });
    window.addEventListener("sl:envio", () => tts.pregenerarFaltantes().catch(() => {}));
  } catch (e) {
    console.error(e);
    $("#app").innerHTML = `<div class="card error"><div class="bad">No pude abrir la base de datos local</div><p>${esc(e.message || e)}</p>
      <p class="muted small">Si estás en modo incógnito o el navegador bloquea el almacenamiento, la app no puede guardar nada.</p></div>`;
    return;
  }
  initHelp();
  actualizarBanner();
  resumeSession().finally(start);
}

arrancar();
