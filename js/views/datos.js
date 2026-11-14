// Datos: copia de seguridad (bajar / subir al buzón), importar (reemplaza todo), buzón PC ↔ celular, voz y espacio.

import * as buzon from "../buzon/buzon.js";
import * as db from "../datos/db.js";
import { descargarJSON, exportar, importar, nombreCopia, validar } from "../datos/export.js";
import { ahora } from "../datos/tiempo.js";
import { $, esc, fmtDate } from "../dom.js";
import { avisoHTML } from "../errores.js";
import { frame } from "../session.js";
import { VERSION } from "../version.js";
import * as stt from "../voz/stt.js";
import * as tts from "../voz/tts.js";

const fmtMB = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`);

async function leerArchivo(file) {
  const txt = await file.text();
  try { return JSON.parse(txt); } catch { throw new Error("El archivo no es un JSON válido."); }
}

export async function datos() {
  const uso = await db.uso();
  const audio = await tts.tamanoCache();
  const voz = await tts.vozLista();
  const bz = await buzon.config();
  const bzRes = await buzon.resumen();
  const ultima = await db.kvGet("ultima_copia");
  const ultimaBuzon = await db.kvGet("ultima_copia_buzon");
  const instalada = window.matchMedia("(display-mode: standalone)").matches;
  const n = { palabras: await db.count("palabras"), items: await db.count("items"), intentos: await db.count("intentos"), feedback: await db.count("feedback") };
  const copiaPre = await db.kvGet("copia_pre_import");

  frame("Datos", `
    <section class="card"><h2>Tus datos</h2>
      <p>${n.palabras} palabras · ${n.items} ejercicios · ${n.intentos} intentos · ${n.feedback} correcciones. Todo vive en este celular${instalada ? " (app instalada)" : ""}.</p>
      <p class="muted small">Ocupa ${fmtMB(uso.usado)}${uso.cuota ? ` de ${fmtMB(uso.cuota)} disponibles` : ""} · audios generados: ${audio.n} (${fmtMB(audio.bytes)}) · app ${esc(VERSION)}</p>
      ${instalada ? "" : `<p class="muted small">Para instalarla: en Chrome Android, menú ⋮ → <b>Instalar app</b>; en Firefox Android, ⋮ → <b>Agregar a pantalla de inicio</b>.</p>`}
    </section>

    <section class="card"><h2>Copia de seguridad</h2>
      <p class="muted small">Última copia bajada: ${ultima ? esc(fmtDate(ultima)) : "nunca"}${bz ? ` · última subida al buzón: ${ultimaBuzon ? esc(fmtDate(ultimaBuzon)) : "nunca"}` : ""}.
        La copia incluye palabras, ejercicios, intentos, correcciones, perfil y ajustes (sin la clave de API ni los audios, que se regeneran).</p>
      <div class="plays"><button class="btn primary" id="bajar">⬇ Bajar copia</button>
        ${bz ? `<button class="btn" id="subir">☁ Subir copia al buzón</button>` : ""}
        <label class="btn">⬆ Importar copia… <input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      <p class="muted small">Importar <b>reemplaza todo</b> lo que hay en este celular por lo de la copia (antes guarda una copia interna de lo actual).
        Sirve para cambiar de celular o para traer tus datos de la PC (<code>scripts\\export_celular.py</code> en sprachlabor-2.0).</p>
      <div id="cres"></div>
      ${copiaPre ? `<p class="muted small">Hay una copia interna de antes del último import (${esc(fmtDate(copiaPre.fecha))}): <a href="#" id="restaurar">restaurarla</a>.</p>` : ""}
    </section>

    <section class="card"><h2>Voz alemana (Piper)</h2>
      <p class="muted small">${voz ? "✓ Voz guardada en el celular (thorsten-medium, 63 MB). Los audios se generan acá y quedan en caché." : "La voz todavía no está bajada: se usa la voz alemana del sistema mientras tanto."}
        ${tts.estado.cola ? ` · ${tts.estado.cola} audios en cola` : ""}</p>
      <div class="plays">${voz ? `<button class="btn" id="voz-borrar">Borrar la voz y volver a bajar</button>` : `<button class="btn primary" id="voz-bajar">Bajar la voz (63 MB)</button>`}
        ${audio.n ? `<button class="btn" id="audio-vaciar">Vaciar audios generados (${fmtMB(audio.bytes)})</button>` : ""}
        <button class="btn sm" id="voz-probar">▶ Probar</button></div>
      <div id="vres" class="muted small"></div>
      <p class="muted small">Reconocimiento de voz (Whisper, ~75 MB, para Vorlesen y Sprechen): ${stt.estado.cargado ? "cargado" : "se baja la primera vez que lo usás"}.</p>
    </section>

    <section class="card"><h2>Buzón con la PC (repo privado de GitHub)</h2>
      <p class="muted small">Opcional. Las grabaciones de Sprechen se suben a un repo <b>privado</b> tuyo; la PC (taller) las transcribe literalmente (wav2vec2) y
        devuelve el texto por el mismo buzón. También sirve para guardar copias. Hace falta un token de GitHub <i>fine-grained</i> con permiso
        «Contents» (lectura y escritura) solo sobre ese repo.</p>
      ${bz ? `<p>✓ Configurado: <b>${esc(bz.owner)}/${esc(bz.repo)}</b> · token •••${esc(bz.token.slice(-4))}</p>
        <p class="muted small">Grabaciones: ${bzRes.pendientes} por subir · ${bzRes.subidas} esperando a la PC · ${bzRes.transcritas} transcritas${bzRes.fallidas ? ` · ${bzRes.fallidas} fallidas` : ""}</p>
        <div class="plays"><button class="btn" id="bz-sync">Sincronizar ahora</button><button class="btn" id="bz-quitar">Quitar el buzón</button></div>`
        : `<div class="optrow"><label for="bz-owner">Usuario de GitHub</label><input id="bz-owner" autocomplete="off" spellcheck="false"></div>
           <div class="optrow"><label for="bz-repo">Repo privado</label><input id="bz-repo" autocomplete="off" spellcheck="false" placeholder="sprachlabor-buzon"></div>
           <div class="optrow"><label for="bz-token">Token</label><input id="bz-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></div>
           <div class="plays"><button class="btn primary" id="bz-guardar">Conectar</button></div>`}
      <div id="bres"></div>
    </section>

    <section class="card"><h2>Empezar de cero</h2>
      <p class="muted small">Borra todos los datos de este celular (bajá una copia antes).</p>
      <button class="btn" id="borrar-todo">Borrar todo</button>
    </section>`);

  $("#bajar").onclick = async () => {
    try {
      const d = await exportar({ conGrabaciones: false, appVersion: VERSION });
      const bytes = descargarJSON(d, nombreCopia());
      await db.kvSet("ultima_copia", ahora());
      $("#cres").innerHTML = `<div class="ok">✓ Copia bajada (${fmtMB(bytes)}). Guardala en Drive, un mail o la PC.</div>`;
    } catch (e) { $("#cres").innerHTML = avisoHTML(e); }
  };
  const subir = $("#subir");
  if (subir) subir.onclick = async () => {
    subir.disabled = true;
    try {
      const d = await exportar({ conGrabaciones: false, appVersion: VERSION });
      await buzon.subirCopia(d, nombreCopia("copia"));
      $("#cres").innerHTML = `<div class="ok">✓ Copia subida al buzón (carpeta copias/).</div>`;
    } catch (e) { $("#cres").innerHTML = avisoHTML(e); } finally { subir.disabled = false; }
  };
  $("#imp").onchange = async () => {
    const f = $("#imp").files[0];
    if (!f) return;
    try {
      const d = await leerArchivo(f);
      const r = validar(d);
      if (!confirm(`La copia del ${r.fecha || "?"} tiene ${r.palabras} palabras, ${r.items} ejercicios, ${r.intentos} intentos y ${r.feedback} correcciones.\n\n¿Reemplazar TODO lo que hay en este celular por esa copia?`)) return;
      $("#cres").innerHTML = `<p><span class="spinner"></span>Importando…</p>`;
      await importar(d);
      $("#cres").innerHTML = `<div class="ok">✓ Importado. Recargando…</div>`;
      setTimeout(() => { location.hash = "#/"; location.reload(); }, 800);
    } catch (e) { $("#cres").innerHTML = avisoHTML(e); }
  };
  const rest = $("#restaurar");
  if (rest) rest.onclick = async (e) => {
    e.preventDefault();
    if (!confirm("¿Volver a los datos de antes del último import? Lo que hay ahora se reemplaza.")) return;
    try { await importar(copiaPre.datos, { guardarCopiaPrevia: false }); location.reload(); } catch (err) { $("#cres").innerHTML = avisoHTML(err); }
  };

  const vb = $("#voz-bajar");
  if (vb) vb.onclick = async () => {
    vb.disabled = true;
    try {
      await tts.bajarVoz((mb, tot) => { $("#vres").innerHTML = `<span class="spinner"></span>Bajando la voz… ${mb} / ${tot} MB`; });
      $("#vres").innerHTML = `<div class="ok">✓ Voz lista.</div>`;
      setTimeout(datos, 800);
    } catch (e) { $("#vres").innerHTML = avisoHTML(e); vb.disabled = false; }
  };
  const vbo = $("#voz-borrar");
  if (vbo) vbo.onclick = async () => {
    vbo.disabled = true;
    try { await tts.borrarVoz(); await tts.bajarVoz((mb, tot) => { $("#vres").innerHTML = `<span class="spinner"></span>Bajando la voz… ${mb} / ${tot} MB`; }); datos(); } catch (e) { $("#vres").innerHTML = avisoHTML(e); vbo.disabled = false; }
  };
  const av = $("#audio-vaciar");
  if (av) av.onclick = async () => { if (confirm("¿Borrar todos los audios generados? Se vuelven a generar cuando hagan falta.")) { await tts.vaciarCache(); datos(); } };
  $("#voz-probar").onclick = async () => {
    const { play } = await import("../audio.js");
    $("#vres").innerHTML = `<span class="spinner"></span>Generando…`;
    const t0 = performance.now();
    const ok = await play("Guten Tag! Jetzt lerne ich jeden Tag Deutsch.");
    $("#vres").innerHTML = ok ? `Listo en ${((performance.now() - t0) / 1000).toFixed(1)} s${voz ? " (Piper)" : " (voz del sistema)"}.` : `<span class="down">No pude reproducir.</span>`;
  };

  const bg = $("#bz-guardar");
  if (bg) bg.onclick = async () => {
    bg.disabled = true;
    $("#bres").innerHTML = `<p><span class="spinner"></span>Comprobando el acceso al repo…</p>`;
    try {
      await buzon.guardarConfig({ owner: $("#bz-owner").value, repo: $("#bz-repo").value, token: $("#bz-token").value });
      datos();
    } catch (e) { $("#bres").innerHTML = avisoHTML(e); bg.disabled = false; }
  };
  const bs = $("#bz-sync");
  if (bs) bs.onclick = async () => {
    bs.disabled = true;
    $("#bres").innerHTML = `<p><span class="spinner"></span>Sincronizando…</p>`;
    try {
      const r = await buzon.sincronizar();
      $("#bres").innerHTML = r ? `<div class="ok">✓ Subidas ${r.subidas} · recibidas ${r.recibidas}${r.errores ? ` · ${r.errores} errores: ${esc(buzon.estado.error || "")}` : ""}</div>` : `<div class="note">Sin internet o ya estaba sincronizando.</div>`;
    } catch (e) { $("#bres").innerHTML = avisoHTML(e); } finally { bs.disabled = false; }
  };
  const bq = $("#bz-quitar");
  if (bq) bq.onclick = async () => { if (confirm("¿Quitar la configuración del buzón de este celular? (No borra nada del repo.)")) { await buzon.borrarConfig(); datos(); } };

  $("#borrar-todo").onclick = async () => {
    if (!confirm("¿Borrar TODOS los datos de Sprachlabor en este celular? No se puede deshacer (bajá una copia antes).")) return;
    if (!confirm("¿Seguro? Se borran palabras, intentos, correcciones, perfil y ajustes.")) return;
    await db.vaciar();
    location.hash = "#/";
    location.reload();
  };
}
