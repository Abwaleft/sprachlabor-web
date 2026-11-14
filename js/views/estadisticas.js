// Estadísticas: racha, actividad, aciertos por semana, camino a B1, Zahlen, producción, palabras, patrones y costo de la IA.

import { barChart, fmtDia, legend, lineChart, pct, tabla } from "../charts.js";
import { $, emptyCard, esc, fmtDate } from "../dom.js";
import { fmtUSD } from "../ia/costos.js";
import { nombrePatron } from "../labels.js";
import * as perfilMod from "../logica/perfil.js";
import * as stats from "../logica/stats.js";
import { frame } from "../session.js";

const TIPO_SERIES = [
  { key: "vokabeln", name: "Vokabeln", color: "var(--s1)" }, { key: "hoeren", name: "Hören", color: "var(--s2)" },
  { key: "diktat", name: "Diktat", color: "var(--s3)" }, { key: "zahlen", name: "Zahlen", color: "var(--s4)" }, { key: "vorlesen", name: "Vorlesen", color: "var(--s5)" },
];
const ZAHL_ART = { zahl: "Números", preis: "Precios", uhrzeit: "Horas", datum: "Fechas" };
const ERR_TIPO = { mal: "mal escrita", falta: "faltó", mayuscula: "mayúscula", umlaut: "diéresis/ß", orden: "orden" };
const TIPO_IA = { korrektur: "corrección", "envio-a": "envío 1/4", "envio-b": "envío 2/4", "envio-c": "envío 3/4", "envio-d": "envío 4/4", test: "test de nivel", prueba: "prueba de clave" };

export function costosHTML(c) {
  if (!c.llamadas) return `<p class="muted">Todavía no hubo llamadas a la IA.</p>`;
  const mesActual = c.meses[0];
  return `<div class="stats">
      <div class="stat"><div class="l">Este mes</div><div class="v">${fmtUSD(mesActual ? mesActual.costo_usd : 0)}</div><div class="d">${mesActual ? `${mesActual.llamadas} llamadas · ${mesActual.correcciones} correcciones · ${mesActual.envios} partes de envío` : ""}</div></div>
      <div class="stat"><div class="l">Total</div><div class="v">${fmtUSD(c.total_usd)}</div><div class="d">${c.llamadas} llamadas desde el principio</div></div>
    </div>
    <table class="tbl"><tr><th>Mes</th><th>Llamadas</th><th>Tokens entrada</th><th>Tokens salida</th><th>Costo</th></tr>
    ${c.meses.map((m) => `<tr><td>${m.mes}</td><td>${m.llamadas}${m.errores ? ` <span class="small down">(${m.errores} con error)</span>` : ""}</td><td>${m.tokens_in.toLocaleString("es-AR")}</td><td>${m.tokens_out.toLocaleString("es-AR")}</td><td>${fmtUSD(m.costo_usd)}</td></tr>`).join("")}</table>
    <details class="tabla"><summary>Últimas llamadas</summary><table class="tbl"><tr><th>Cuándo</th><th>Qué</th><th>Modelo</th><th>Tokens</th><th>Costo</th><th>Tiempo</th></tr>
    ${c.ultimas.map((r) => `<tr><td>${esc(fmtDate(r.ts))}</td><td>${TIPO_IA[r.tipo] || esc(r.tipo)}${r.ok ? "" : ` <span class="down">✗ ${esc(r.error || "error")}</span>`}</td><td>${esc((r.modelo || "").replace("claude-", ""))}</td>
      <td>${(r.tokens_in + (r.cache_read || 0) + (r.cache_write || 0)).toLocaleString("es-AR")} → ${(r.tokens_out || 0).toLocaleString("es-AR")}</td><td>${fmtUSD(r.costo_usd)}</td><td>${r.segundos != null ? r.segundos + " s" : "—"}</td></tr>`).join("")}</table></details>
    <p class="muted small" style="margin-top:8px">Una corrección cuesta ~1–2 centavos de dólar; un envío completo (4 partes) ~15–45 centavos según cuánto haya que mandar. Con una corrección por día y un envío cada 3 días: ≈ US$ 2 por mes.</p>`;
}

export async function estadisticas() {
  const s = await stats.compute();
  const costos = await stats.costosIA();
  const T = s.totales;
  if (!T.intentos) {
    frame("Estadísticas", `${emptyCard("Todavía no hay ejercicios hechos. Empezá una sesión y volvé.")}<section class="card"><h2>Costo de la IA</h2>${costosHTML(costos)}</section>`);
    return;
  }
  const cmp = s.comparacion_semanal;
  const U = cmp.ultimos_7_dias_practicados;
  const A = cmp["7_dias_practicados_anteriores"];
  const n7 = Object.values(U).reduce((a, x) => a + x.intentos, 0);
  const nAnt = Object.values(A).reduce((a, x) => a + x.intentos, 0);
  const evo = s.evolucion_perfil.filter((e) => e.progreso_b1 != null);
  const perfil = await perfilMod.get();
  const b1 = perfil && perfil.progreso_b1 != null ? perfil.progreso_b1 : evo.length ? evo[evo.length - 1].progreso_b1 : null;
  const b1Start = evo.length ? evo[0].progreso_b1 : null;
  const P = s.palabras;
  const delta = (a, b) => (b ? `${a >= b ? "+" : ""}${a - b} vs. los 7 anteriores` : "primeros días");
  const semanas = s.por_semana;
  const semSeries = TIPO_SERIES.map((t) => ({ ...t, values: semanas.map((w) => (w[t.key] ? w[t.key].acierto : null)) }));
  const cmpRows = TIPO_SERIES.map((t) => { const a = U[t.key]; const b = A[t.key]; return [t.name, a ? `${pct(a.acierto)} (${a.intentos})` : "—", b ? `${pct(b.acierto)} (${b.intentos})` : "—"]; });
  const zahlen = Object.entries(s.zahlen_por_tipo);
  const pats = (() => {
    if (!s.evolucion_perfil.length) return [];
    const first = s.evolucion_perfil[0].patrones;
    const last = s.evolucion_perfil[s.evolucion_perfil.length - 1].patrones;
    return Object.keys(last).map((k) => ({ k, first: first[k], last: last[k] })).filter((p) => p.last != null).sort((a, b) => b.last - a.last);
  })();

  frame("Estadísticas", `
    <div class="stats">
      <div class="stat"><div class="l">Racha</div><div class="v">${T.racha_dias} ${T.racha_dias === 1 ? "día" : "días"}</div><div class="d">${T.dias_activos} días activos en total</div></div>
      <div class="stat"><div class="l">Últimos 7 días de práctica</div><div class="v">${n7}</div><div class="d">ejercicios · ${delta(n7, nAnt)}</div></div>
      <div class="stat"><div class="l">Palabras</div><div class="v">${P.total - P.sin_ver}</div><div class="d">vistas de ${P.total} · ${P.consolidadas} consolidadas</div></div>
      <div class="stat"><div class="l">Camino a ${esc((perfil && perfil.meta) || "B1")}</div><div class="v">${b1 != null ? Math.round(b1) + " %" : "—"}</div><div class="d">${b1Start != null ? `empezaste en ${Math.round(b1Start)} %` : ""}</div></div>
    </div>
    <section class="card"><h2>Actividad · últimos 30 días</h2><p class="muted small">Ejercicios por día.</p><div class="chart-wrap" id="c-act"></div>
      ${tabla(["Día", "Ejercicios"], s.actividad_30_dias.filter((d) => d.ejercicios).map((d) => [fmtDia(d.fecha), d.ejercicios]))}</section>
    <section class="card"><h2>Aciertos por semana</h2><p class="muted small">Vokabeln = tarjetas que sabías (Bien/Fácil). Diktat = puntaje promedio.</p>
      ${legend(semSeries)}<div class="chart-wrap" id="c-sem"></div>${tabla(["Tipo", "Últimos 7 días de práctica", "Los 7 anteriores"], cmpRows)}</section>
    ${evo.length > 1 ? `<section class="card"><h2>Camino a B1 por envío al tutor</h2><p class="muted small">Estimación del tutor en cada envío.</p><div class="chart-wrap" id="c-b1"></div>
      ${tabla(["Envío", "Progreso"], evo.map((e, i) => [`${i + 1} · ${fmtDia(e.fecha)}`, `${e.progreso_b1} %`]))}</section>` : ""}
    ${zahlen.length ? `<section class="card"><h2>Zahlen por tipo</h2><p class="muted small">Acierto en todo el historial (entre paréntesis, últimos 7 días de práctica).</p>
      ${zahlen.map(([art, z]) => `<div class="hbar"><span>${ZAHL_ART[art] || art}</span><span class="track"><i style="width:${Math.round(z.acierto * 100)}%"></i></span><span class="val">${pct(z.acierto)} · ${z.intentos} (${pct(z.acierto_7d)})</span></div>`).join("")}</section>` : ""}
    ${Object.keys(s.produccion || {}).length ? `<section class="card"><h2>Producción</h2>
      <table class="tbl"><tr><th></th><th>Intentos</th><th>Volumen</th><th>Niveles recientes (tutor)</th></tr>
      ${s.produccion.schreiben ? `<tr><td>Schreiben</td><td>${s.produccion.schreiben.intentos}</td><td>${s.produccion.schreiben.palabras} palabras</td><td>${s.produccion.schreiben.niveles_recientes.join(" · ") || "—"}</td></tr>` : ""}
      ${s.produccion.sprechen_frei ? `<tr><td>Sprechen</td><td>${s.produccion.sprechen_frei.intentos}</td><td>${s.produccion.sprechen_frei.minutos} min</td><td>${s.produccion.sprechen_frei.niveles_recientes.join(" · ") || "—"}</td></tr>` : ""}
      ${s.produccion.vorlesen ? `<tr><td>Vorlesen</td><td>${s.produccion.vorlesen.intentos}</td><td>${pct(s.produccion.vorlesen.reconocido)} reconocido (${pct(s.produccion.vorlesen.reconocido_7d)} últimos 7 días)</td><td>—</td></tr>` : ""}
      </table>
      <p class="small" style="margin-top:10px">Nivel actual de las consignas: <b>Schreiben ${esc(s.nivel_objetivo.schreiben)}</b> · <b>Sprechen ${esc(s.nivel_objetivo.sprechen)}</b></p>
      ${["schreiben", "sprechen_frei"].filter((t) => (s.produccion[t] || {}).dificultad_reciente?.length).map((t) => `<p class="muted small">Dificultad marcada en ${t === "schreiben" ? "Schreiben" : "Sprechen"} (últimas): ${s.produccion[t].dificultad_reciente.map(esc).join(" · ")}</p>`).join("")}
    </section>` : ""}
    <section class="card"><h2>Palabras</h2>
      <div class="stack">${[["sin_ver", "var(--ord1)"], ["aprendiendo", "var(--ord2)"], ["consolidadas", "var(--ord3)"]].filter(([k]) => P[k] > 0).map(([k, c]) => `<i style="flex:${P[k]};background:${c}"></i>`).join("")}</div>
      <div class="legend-row"><span><span class="sw" style="background:var(--ord1)"></span>Sin ver ${P.sin_ver}</span><span><span class="sw" style="background:var(--ord2)"></span>Aprendiendo ${P.aprendiendo}</span>
        <span><span class="sw" style="background:var(--ord3)"></span>Consolidadas ${P.consolidadas} <span class="small">(repaso cada 3+ semanas)</span></span></div>
      ${P.mas_olvidadas.length ? `<p class="small">Las que más se te olvidan: ${P.mas_olvidadas.map(esc).join(", ")}</p>` : ""}
    </section>
    ${s.errores_dictado_repetidos.length ? `<section class="card"><h2>Errores que se repiten en Diktat</h2><table class="tbl"><tr><th>Palabra</th><th>Error</th><th>Veces</th><th>Días</th></tr>
      ${s.errores_dictado_repetidos.map((e) => `<tr><td><b>${esc(e.palabra)}</b></td><td>${ERR_TIPO[e.tipo] || esc(e.tipo)}</td><td>${e.veces}</td><td>${e.dias}</td></tr>`).join("")}</table></section>` : ""}
    ${pats.length ? `<section class="card"><h2>Patrones de error</h2><p class="muted small">Peso que les da el tutor (más alto = más urgente), desde el primer envío hasta hoy.</p>
      <table class="tbl"><tr><th>Patrón</th><th>Inicio</th><th>Hoy</th></tr>
      ${pats.map((p) => { const d = p.first != null ? p.last - p.first : 0; const cls = d < -0.001 ? "up" : d > 0.001 ? "down" : ""; const arrow = d < -0.001 ? "↓ mejor" : d > 0.001 ? "↑ más urgente" : "=";
        return `<tr><td>${p.k}. ${esc(nombrePatron(+p.k))}</td><td>${p.first != null ? Math.round(p.first * 100) : "—"}</td><td>${Math.round(p.last * 100)} <span class="small ${cls}">${arrow}</span></td></tr>`; }).join("")}</table></section>` : ""}
    <section class="card"><h2>Costo de la IA</h2>${costosHTML(costos)}</section>
  `);

  const draw = () => {
    barChart($("#c-act"), s.actividad_30_dias.map((d) => ({ label: fmtDia(d.fecha), value: d.ejercicios, tip: `<b>${fmtDia(d.fecha)}</b>${d.ejercicios} ejercicio${d.ejercicios === 1 ? "" : "s"}` })));
    lineChart($("#c-sem"), semanas.map((w) => w.etiqueta), semSeries);
    if (evo.length > 1) {
      const vals = evo.map((e) => e.progreso_b1);
      const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10);
      const hi = Math.min(100, Math.max(lo + 20, Math.ceil((Math.max(...vals) + 5) / 10) * 10));
      lineChart($("#c-b1"), evo.map((e, i) => `${i + 1} · ${fmtDia(e.fecha)}`), [{ name: "Progreso", color: "var(--s1)", values: vals.map((v) => (v - lo) / (hi - lo)) }],
        { height: 170, ticks: [0, 0.5, 1], fmt: (v) => (v == null ? "—" : `${Math.round(lo + v * (hi - lo))} %`) });
    }
  };
  draw();
  let t;
  window.onresize = () => { clearTimeout(t); t = setTimeout(draw, 150); };
}
