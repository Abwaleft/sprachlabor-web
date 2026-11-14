"""Lógica (módulos ES) probada dentro de la página: repetición espaciada, dictado, Zahlen, niveles, plan del día,
export/import, schemas y costos. Sin IA, sin red."""
from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.ui


def js(pagina, codigo: str):
    """Ejecuta `codigo` (async, con `imp(ruta)` para importar módulos de la app) y devuelve el resultado."""
    return pagina.evaluate(f"""async () => {{
      const imp = (r) => import(new URL(r, location.href).href);
      {codigo}
    }}""")


def test_srs_intervalos(pagina):
    pagina.ir("datos")
    r = js(pagina, """
      const srs = await imp("js/logica/srs.js");
      const c = srs.nuevaTarjeta();
      const bien = srs.review(c, 3, new Date(2026, 10, 14, 10));
      const facil = srs.review(bien, 4, new Date(2026, 10, 15, 10));
      const otra = srs.review(facil, 1, new Date(2026, 10, 16, 10));
      return {bien, facil, otra};""")
    assert r["bien"]["interval"] == 1 and r["bien"]["reps"] == 1 and r["bien"]["due"].endswith("T04:00:00")
    assert r["facil"]["interval"] == 6 and r["facil"]["reps"] == 2
    assert r["otra"]["reps"] == 0 and r["otra"]["lapses"] == 1 and r["otra"]["interval"] == 0


def test_diktat_marca_mayuscula_dieresis_y_orden(pagina):
    pagina.ir("datos")
    r = js(pagina, """
      const d = await imp("js/logica/diktat.js");
      return d.compare("Jetzt lerne ich jeden Tag Deutsch in München.", "jetzt ich lerne jeden tag deutsch in Munchen");""")
    estados = {p["ref"]: p["estado"] for p in r["palabras"] if p["ref"]}
    assert estados["Tag"] == "mayuscula" and estados["Deutsch"] == "mayuscula"
    assert estados["München"] == "umlaut"
    assert "orden" in estados.values()
    assert 0.5 < r["score"] < 1


def test_zahlen_generacion_y_verificacion(pagina):
    pagina.ir("datos")
    r = js(pagina, """
      const z = await imp("js/logica/zahlen.js");
      const out = {palabras: [z.zahl(0), z.zahl(21), z.zahl(1999), z.zahl(1000000), z.jahr(1984), z.ordinal(3)], ok: [], tipos: new Set()};
      for (let i = 0; i < 200; i++) { const a = z.generate("mix"); out.tipos.add(a.art); out.ok.push(z.check(a, a.loesung.replace(/ \\(o .*\\)$/, "").replace(" €", ""))); }
      out.tipos = [...out.tipos];
      out.zeit = z.checkFromSpec({tipo: "zeit", h: 5, m: 30, ambiguo: true})("17:30");
      out.preis = z.checkFromSpec({tipo: "preis", e: 3, c: 50})("3,5");
      return out;""")
    assert r["palabras"] == ["null", "einundzwanzig", "eintausendneunhundertneunundneunzig", "eine Million", "neunzehnhundertvierundachtzig", "dritt"]
    assert all(r["ok"]) and sorted(r["tipos"]) == ["datum", "preis", "uhrzeit", "zahl"]
    assert r["zeit"] is True and r["preis"] is True


def test_niveles_redondeo_y_calificacion(con_datos):
    r = js(con_datos, """
      const n = await imp("js/logica/niveles.js");
      const db = await imp("js/datos/db.js");
      const prod = await imp("js/logica/produktion.js");
      const c = await prod.siguienteConsigna("schreiben");
      const it = await prod.schreibenGuardar(c.id, "Hallo Jonas, ich war am Wochenende in Berlin.");
      const a = await db.get("intentos", it.id);
      const r1 = await n.calificar(a, 3); await db.put("intentos", a);
      const r2 = await n.calificar(a, 3); await db.put("intentos", a);   // recalificar deshace el ajuste anterior
      const r3 = await n.calificar(a, 4); await db.put("intentos", a);
      const dec = await n.decisionTutor("schreiben", "B1", "prueba", a); await db.put("intentos", a);
      const r4 = await n.calificar(a, 1);
      return {r1, r2, r3, dec, r4, etiquetas: [n.etiqueta(1.5), n.etiqueta(2.5), n.etiqueta(2.6)], consigna: c.nivel};""")
    assert r["r1"]["antes"] == "A2" and r["r1"]["ahora"] == "A2"        # +0,5 solo no sube
    assert r["r2"]["ahora"] == "A2" and r["r3"]["ahora"] == "A2+"       # Fácil +1 sube
    assert r["dec"]["ahora"] == "B1" and r["r4"]["decidido_por_tutor"] == "B1" and r["r4"]["ahora"] == "B1"
    assert r["etiquetas"] == ["A2", "A2+", "B1"]


def test_plan_del_dia_y_sesion(con_datos):
    r = js(con_datos, """
      const h = await imp("js/logica/heute.js");
      const res = await h.resumen();
      const s = await h.crearSesion(10);
      const s2 = await h.actualizarSesion(s.id, {paso: 1, hechos: 2});
      const act = await h.sesionActiva();
      return {planes: Object.fromEntries(Object.entries(res.planes).map(([k, p]) => [k, p.pasos.map((x) => x.mod)])), s: s.pasos.length, s2: s2.paso, act: act && act.id === s.id};""")
    assert r["planes"]["5"][0] == "vokabeln" and "hoeren" in r["planes"]["10"]
    assert "schreiben" not in r["planes"]["5"] and "sprechen" not in r["planes"]["5"]
    assert r["s"] >= 2 and r["s2"] == 1 and r["act"] is True


def test_vokabeln_cola_y_presupuesto(con_datos):
    r = js(con_datos, """
      const v = await imp("js/logica/vokabeln.js");
      const q = await v.queue();
      const r1 = await v.review(q.nuevas[0].id, 4);
      const r2 = await v.review(q.nuevas[1].id, 1);
      const q2 = await v.queue();
      return {nuevas: q.nuevas.length, repasos: q.repasos.length, quedan: q.presupuesto.quedan, r1: r1.fase, r2: r2.fase, quedan2: q2.presupuesto.quedan, aprendiendo: q2.nuevas.filter((c) => !c.neu).length};""")
    assert r["nuevas"] == 10 and r["repasos"] == 0 and r["quedan"] == 10
    assert r["r1"] == "nueva" and r["r2"] == "nueva"
    assert r["quedan2"] == 8          # dos vistas hoy
    assert r["aprendiendo"] == 0       # la que falló vuelve en 10 min: todavía no está vencida


def test_hoeren_diktat_registran_intentos(con_datos):
    r = js(con_datos, """
      const u = await imp("js/logica/uebungen.js");
      const db = await imp("js/datos/db.js");
      const h = await u.hoerenNext([]);
      const rh = await u.hoerenAnswer(h.id, 0, 1);
      const d = await u.diktatNext([]);
      const rd = await u.diktatAnswer(d.id, d.text_de, 1);
      const z = u.zahlenNext("preis");
      const rz = await u.zahlenAnswer(z, z.loesung.replace(" €", ""), 1);
      const ints = await db.all("intentos");
      return {rh: "ok" in rh, rd: rd.score, rz: rz.ok, n: ints.length, tipos: ints.map((i) => i.type).sort(), enviados: ints.filter((i) => i.enviado).length};""")
    assert r["rh"] and r["rd"] == 1 and r["rz"] is True
    assert r["n"] == 3 and r["tipos"] == ["diktat", "hoeren", "zahlen"] and r["enviados"] == 0


def test_export_import_ida_y_vuelta(con_datos):
    r = js(con_datos, """
      const ex = await imp("js/datos/export.js");
      const db = await imp("js/datos/db.js");
      const u = await imp("js/logica/uebungen.js");
      const h = await u.hoerenNext([]); await u.hoerenAnswer(h.id, 1, 2);
      const copia = await ex.exportar({conGrabaciones: true, appVersion: "test"});
      const antes = {p: await db.count("palabras"), i: await db.count("items"), a: await db.count("intentos")};
      await db.vaciar();
      const vacio = await db.count("palabras");
      const res = await ex.importar(copia);
      const despues = {p: await db.count("palabras"), i: await db.count("items"), a: await db.count("intentos")};
      const perfil = await db.kvGet("perfil");
      return {antes, vacio, despues, res, perfil: perfil && perfil.nombre, formato: copia.formato};""")
    assert r["vacio"] == 0 and r["antes"] == r["despues"] and r["antes"]["a"] == 1
    assert r["perfil"] == "Prueba" and r["formato"] == "sprachlabor-datos"


def test_import_rechaza_archivos_raros(pagina):
    pagina.ir("datos")
    r = js(pagina, """
      const ex = await imp("js/datos/export.js");
      const out = [];
      for (const d of [null, {}, {formato: "otro"}, {formato: "sprachlabor-datos", version: 99, almacenes: {}}]) {
        try { ex.validar(d); out.push("ok"); } catch (e) { out.push(e.message); }
      }
      return out;""")
    assert all(x != "ok" for x in r) and "versión más nueva" in r[3]


def test_schemas_adaptados_para_la_api(pagina):
    pagina.ir("datos")
    r = js(pagina, """
      const s = await imp("js/ia/schemas.js");
      const k = await s.schemaKorrektur();
      const a = await s.schemaEnvio("a");
      const c = await s.schemaEnvio("c");
      const texto = JSON.stringify([k, a, c, s.SCHEMA_TEST_NIVEL]);
      return {kProps: Object.keys(k.properties), kReq: k.required, aProps: Object.keys(a.properties), cLote: Object.keys(c.properties.lote.properties),
              prohibido: /"(minimum|maximum|maxItems|minLength|maxLength)"/.test(texto), minItems: (texto.match(/"minItems":(\\d+)/g) || []).every((m) => m.endsWith(":1")),
              addl: (texto.match(/"additionalProperties":false/g) || []).length, objetos: (texto.match(/"type":"object"/g) || []).length,
              val: s.validar("envio-c", {lote: {hoeren: [{optionen_es: ["a"], richtig: 3}]}})};""")
    assert r["kProps"] == r["kReq"] and "nivel_siguiente" in r["kProps"]
    assert r["aProps"] == ["resumen", "feedback", "perfil", "nivel_consignas"] and r["cLote"] == ["hoeren", "diktat", "vorlesen"]
    assert r["prohibido"] is False and r["minItems"] is True and r["addl"] == r["objetos"]
    assert len(r["val"]) == 2


def test_costos(pagina):
    pagina.ir("datos")
    r = js(pagina, """
      const c = await imp("js/ia/costos.js");
      return [c.costo("claude-sonnet-5-5", {input_tokens: 1000000, output_tokens: 0}), c.costo("claude-sonnet-5-5", {input_tokens: 0, output_tokens: 100000}),
              c.costo("claude-haiku-5-5", {input_tokens: 10000, output_tokens: 2000, cache_read_input_tokens: 5000}), c.costo("desconocido", {input_tokens: 5})];""")
    assert r[0] == 2.0 and r[1] == 1.0 and abs(r[2] - (0.001 + 0.001 + 0.00005)) < 1e-9 and r[3] == 0


def test_stats_con_historial(con_datos):
    r = js(con_datos, """
      const u = await imp("js/logica/uebungen.js");
      const st = await imp("js/logica/stats.js");
      for (let i = 0; i < 3; i++) { const z = u.zahlenNext("zahl"); await u.zahlenAnswer(z, i ? z.loesung : "0", 1); }
      const s = await st.compute();
      return {intentos: s.totales.intentos, racha: s.totales.racha_dias, zahl: s.zahlen_por_tipo.zahl, dias: s.actividad_30_dias.length, palabras: s.palabras.total};""")
    assert r["intentos"] == 3 and r["racha"] == 1 and r["zahl"]["intentos"] == 3 and r["dias"] == 30 and r["palabras"] == 12
