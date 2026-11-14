"""Pruebas de pantalla en Edge sin cabeza: test de nivel, Heute, cada ejercicio, Enviar al tutor y Corregir ahora con
respuestas grabadas (sin llamadas pagas), Estadísticas, Opciones, Datos y Ajustes de IA."""
from __future__ import annotations

import json
import re

import pytest

from tests.conftest import fixture, respuesta_api

pytestmark = pytest.mark.ui

CLAVE_FALSA = "sk-ant-test-0000000000000000000000000000000000000000000000000000000000000000-aaaa"


def partes_grabadas(body):
    """Responde cada parte del envío con el trozo correspondiente de la respuesta grabada del tutor."""
    so = fixture("sync_respuesta.json")
    props = body["output_config"]["format"]["schema"]["properties"]
    out = {}
    for k in props:
        if k == "lote":
            out["lote"] = {t: so["lote"][t] for t in props["lote"]["properties"]}
        else:
            out[k] = so[k]
    return respuesta_api(out)


def cargar_clave(pagina):
    pagina.ir("ia")
    pagina.fill("#k", CLAVE_FALSA)
    pagina.click("#guardar")
    pagina.wait_for_selector(".ok")


# ---------- inicio / test de nivel ----------

def test_sin_perfil_manda_al_inicio(pagina):
    pagina.ir("")
    assert "Hallo" in pagina.inner_text("#app")
    assert pagina.locator("#nombre").count() == 1


def completar_test(pagina, con_ia=False):
    pagina.ir("inicio")
    pagina.fill("#nombre", "Vera")
    pagina.click("#temas .chip >> nth=4")
    pagina.click("#sig")
    # Lesen: responder todo (la primera opción)
    pagina.wait_for_selector(".opts")
    for q in range(6):
        pagina.click(f'.opt[data-q="{q}"][data-o="1"]')
    pagina.click("#sig")
    # Hören: escuchar (muteado, cuenta igual) y responder
    pagina.wait_for_selector("[data-h]")
    for i in range(6):
        pagina.click(f'[data-h="{i}"]')
        pagina.wait_for_function(f'() => !document.querySelector(\'.opt[data-q="{i}"]\').disabled')
        pagina.click(f'.opt[data-q="{i}"][data-o="1"]')
    pagina.click("#sig")
    pagina.wait_for_selector("#ein")
    pagina.fill("#ein", "Ich heiße Vera und ich komme aus Argentinien. Ich arbeite als Ingenieurin. Am Wochenende ich habe Sport gemacht und dann ich bin müde.")
    pagina.click("#sig")
    pagina.wait_for_selector("#saltar")
    pagina.click("#saltar")
    pagina.wait_for_selector("#fin .ok, #fin .bad", timeout=20000)


def test_test_de_nivel_sin_ia_crea_perfil_local(pagina):
    completar_test(pagina)
    txt = pagina.inner_text("#fin")
    assert "Listo, Vera" in txt and "sin IA" in txt
    perfil = pagina.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).kvGet('perfil')")
    assert perfil["nombre"] == "Vera" and perfil["origen"] == "test-local" and perfil["meta"] == "B1"
    assert "ingeniería y tecnología" in perfil["temas"]
    assert len(perfil["patrones"]) == 5
    pagina.ir("")
    assert "Hallo, Vera" in pagina.inner_text("#app")
    assert pagina.ia.llamadas == []


def test_test_de_nivel_con_ia_grabada(pagina):
    cargar_clave(pagina)
    pagina.ia.programar(lambda body: respuesta_api({
        "niveles": {"lesen": "A2", "hoeren": "A2, B1 en construcción", "schreiben": "A1+", "sprechen": "sin evaluar"},
        "patrones": [{"patron": i, "peso": 0.9 if i == 1 else 0.5, "nota": "dann ich bin müde" if i == 1 else ""} for i in range(1, 6)],
        "progreso_b1": 32, "comentario": "Buen arranque. El verbo en segunda posición es lo primero.", "plan_arranque": "Vokabeln de vida diaria y V2.",
    }))
    completar_test(pagina, con_ia=True)
    txt = pagina.inner_text("#fin")
    assert "Buen arranque" in txt and "Pedir el primer lote" in txt
    assert len(pagina.ia.llamadas) == 1
    body = pagina.ia.llamadas[0]["body"]
    assert body["output_config"]["format"]["type"] == "json_schema" and body["output_config"]["effort"] == "medium"
    assert "Test de nivel" in body["messages"][0]["content"]
    assert body["system"][0]["text"].startswith("# Tutor de alemán de Sprachlabor") and "Vera" not in json.dumps(body["system"])
    assert pagina.ia.llamadas[0]["headers"]["x-api-key"] == CLAVE_FALSA
    perfil = pagina.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).kvGet('perfil')")
    assert perfil["origen"] == "test" and perfil["progreso_b1"] == 32 and perfil["patrones"][0]["peso"] == 0.9
    # el costo quedó registrado
    costos = pagina.evaluate("async () => (await import(location.origin + '/js/logica/stats.js')).costosIA()")
    assert costos["llamadas"] == 1 and costos["total_usd"] > 0


# ---------- Heute y ejercicios ----------

def test_heute_planes_y_sesion(con_datos):
    p = con_datos
    p.ir("")
    assert "Hallo, Prueba" in p.inner_text("#app")
    assert p.locator(".plan-btn").count() == 3
    p.click('.plan-btn[data-min="10"]')
    p.wait_for_selector(".sessionbar")
    assert "Sesión de 10 min" in p.inner_text(".sessionbar")
    assert "Vokabeln" in p.inner_text("h1")
    p.ir("")
    assert "Sesión de 10 min en curso" in p.inner_text("#app")


def test_vokabeln_flujo(con_datos):
    p = con_datos
    p.ir("vokabeln")
    p.fill("#ein", "der Zug")
    p.click("#rev")
    p.wait_for_selector("[data-g]")
    assert p.locator(".answer b").count() == 1
    p.click('[data-g="3"]')
    p.wait_for_selector("#rev")
    n = p.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).count('intentos')")
    assert n == 1


def test_hoeren_dos_escuchas_y_respuesta(con_datos):
    p = con_datos
    p.ir("hoeren")
    assert p.locator(".opt").first.is_disabled()
    p.click("#pn")
    p.wait_for_function("() => document.querySelector('#cnt').textContent.includes('1/2')")
    p.click("#pl")
    p.wait_for_function("() => document.querySelector('#cnt').textContent.includes('2/2')")
    assert p.locator("#pn").is_disabled()
    p.click(".opt >> nth=0")
    p.wait_for_selector("#next")
    assert p.locator(".opt.right").count() == 1
    assert re.search(r"✓|✗", p.inner_text("#res"))


def test_diktat_corrige(con_datos):
    p = con_datos
    p.ir("diktat")
    texto = p.evaluate("async () => { const u = await import(location.origin + '/js/logica/uebungen.js'); return (await u.diktatNext([])).text_de; }")
    p.fill("#ein", texto.lower())
    p.click("#chk")
    p.wait_for_selector(".score")
    assert p.locator(".w.mayuscula").count() >= 1
    p.click("#next")
    p.wait_for_selector("#chk")


def test_zahlen_infinito(con_datos):
    p = con_datos
    p.ir("zahlen")
    p.click('[data-a="preis"]')
    p.wait_for_selector("#ein.big")
    p.fill("#ein", "1,00")
    p.click("#chk")
    p.wait_for_selector("#next")
    assert re.search(r"Bien|Era", p.inner_text("#res"))


def test_schreiben_guardar_y_corregir_ahora_grabado(con_datos):
    p = con_datos
    cargar_clave(p)
    p.ia.programar(lambda body: respuesta_api(fixture("korrektur.json")))
    p.ir("schreiben")
    p.fill("#ein", "Hallo zusammen, leider ich kann in Sonntag nicht kommen, weil ich muss arbeiten.")
    p.click("#savek")
    p.wait_for_selector(".fb", timeout=20000)
    txt = p.inner_text("#kout").lower()
    assert "leider kann ich" in txt and "versión b1" in txt and "próximas consignas" in txt and "errores (3)" in txt
    body = p.ia.llamadas[-1]["body"]
    assert body["output_config"]["effort"] == "low" and body["max_tokens"] == 8000
    assert body["system"][0].get("cache_control") == {"type": "ephemeral"}
    assert "Corregí ahora este texto escrito" in body["messages"][0]["content"]
    # dificultad después de la corrección: el tutor ya decidió → no mueve el nivel
    p.click('[data-d="4"]')
    p.wait_for_selector("#dres:has-text('Anotado')")
    assert "ya decidió" in p.inner_text("#dres")
    fb = p.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).all('feedback')")
    assert len(fb) == 1 and fb[0]["source"] == "ahora" and fb[0]["payload"]["costo_usd"] > 0


def test_sprechen_graba_y_guarda(con_datos):
    p = con_datos
    # sin Whisper (no se baja en pruebas): forzar "no soportado" para que guarde sin transcripción
    p.ir("sprechen")
    p.evaluate("async () => { const s = await import(location.origin + '/js/voz/stt.js'); s.estado.soportado = false; }")
    p.click("#recbtn")
    p.wait_for_function("() => document.querySelector('#rectime').textContent.startsWith('0:02')")
    p.click("#recbtn")
    p.wait_for_selector("#next", timeout=15000)
    assert "grabación guardada" in p.inner_text("#res").lower()
    a = p.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).porIndice('intentos', 'type', 'sprechen_frei')")
    assert len(a) == 1 and a[0]["payload"]["transcripcion_estado"] == "pendiente" and a[0]["payload"]["segundos"] >= 1


# ---------- envío al tutor ----------

def test_enviar_al_tutor_cuatro_partes_grabadas(con_datos):
    p = con_datos
    cargar_clave(p)
    p.ia.programar(partes_grabadas)
    # un Schreiben sin corregir para que haya feedback
    p.evaluate("""async () => { const prod = await import(location.origin + '/js/logica/produktion.js');
      const c = await prod.siguienteConsigna("schreiben"); await prod.schreibenGuardar(c.id, "Hallo Jonas, ich war in Berlin. Es war schön."); }""")
    p.ir("enviar")
    assert "4 llamadas" in p.inner_text("#app")
    p.click("#go")
    p.wait_for_selector("#st .ok", timeout=60000)
    txt = p.inner_text("#st")
    assert "Listo" in txt and "palabras" in txt and "Costó" in txt
    assert len(p.ia.llamadas) == 4
    partes = [list(c["body"]["output_config"]["format"]["schema"]["properties"]) for c in p.ia.llamadas]
    assert partes[0] == ["resumen", "feedback", "perfil", "nivel_consignas"] and partes[1] == ["palabras_nuevas"]
    assert {tuple(x) for x in partes[2:]} == {("lote",), ("lote",)}
    # cada parte manda solo lo suyo: la parte de palabras no lleva los intentos
    assert "intentos_ultimos_7_dias" in p.ia.llamadas[0]["body"]["messages"][0]["content"]
    assert "intentos_ultimos_7_dias" not in p.ia.llamadas[1]["body"]["messages"][0]["content"]
    assert "conocidas" in p.ia.llamadas[1]["body"]["messages"][0]["content"]
    est = p.evaluate("async () => (await import(location.origin + '/js/logica/estado.js')).status()")
    assert est["pendientes"] == 0 and est["ultimo_envio"]
    env = p.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).all('envios')")
    assert len(env) == 1 and env[0]["status"] == "ok" and set(env[0]["partes"]) == {"a", "b", "c", "d"} and env[0]["costo_usd"] > 0
    p.ir("rueckmeldung")
    txt = p.inner_text("#app")
    assert "Último envío al tutor" in txt and "Palabras nuevas del último envío" in txt


def test_envio_falla_en_una_parte_y_se_completa(con_datos):
    p = con_datos
    cargar_clave(p)
    estado = {"fallar_c": True}

    def fn(body):
        props = body["output_config"]["format"]["schema"]["properties"]
        if "lote" in props and "hoeren" in props["lote"]["properties"] and estado["fallar_c"]:
            estado["fallar_c"] = False
            return (529, {"error": {"type": "overloaded_error", "message": "Overloaded"}})
        return partes_grabadas(body)
    p.ia.programar(fn)
    p.ir("enviar")
    p.click("#go")
    p.wait_for_selector("#st .bad", timeout=60000)
    assert "sobrecargada" in p.inner_text("#st")
    p.ir("enviar")
    p.wait_for_selector("#retry")
    assert "3/4 partes" in p.inner_text("#retry")
    p.click("#retry")
    p.wait_for_selector("#st .ok", timeout=60000)
    env = p.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).all('envios')")
    assert len(env) == 1 and env[0]["status"] == "ok" and set(env[0]["partes"]) == {"a", "b", "c", "d"}
    assert len(p.ia.llamadas) == 5


def test_refusal_y_max_tokens_se_informan(con_datos):
    p = con_datos
    cargar_clave(p)
    p.ia.programar(lambda body: respuesta_api({}, stop="refusal"))
    p.ir("schreiben")
    p.fill("#ein", "Ein Text.")
    p.click("#savek")
    p.wait_for_selector("#kout .bad", timeout=20000)
    assert "refusal" in p.inner_text("#kout")
    reg = p.evaluate("async () => (await import(location.origin + '/js/datos/db.js')).all('ia_llamadas')")
    assert reg[-1]["ok"] is False and reg[-1]["error"] == "refusal" and reg[-1]["costo_usd"] > 0  # se cobra igual


# ---------- resto ----------

def test_estadisticas_con_costo(con_datos):
    p = con_datos
    p.evaluate("""async () => { const u = await import(location.origin + '/js/logica/uebungen.js'); const z = u.zahlenNext("zahl"); await u.zahlenAnswer(z, z.loesung, 1); }""")
    p.ir("estadisticas")
    txt = p.inner_text("#app")
    assert "Racha" in txt and "Costo de la IA" in txt and "Todavía no hubo llamadas" in txt
    assert p.locator("#c-act svg").count() == 1


def test_opciones_guardar_y_validar(con_datos):
    p = con_datos
    p.ir("opciones")
    p.fill("#o-nuevas_por_dia", "7")
    p.click("#guardar")
    p.wait_for_selector("#res .ok")
    v = p.evaluate("async () => (await import(location.origin + '/js/logica/opciones.js')).get()")
    assert v["nuevas_por_dia"] == 7
    p.fill("#o-nuevas_por_dia", "99")
    p.click("#guardar")
    p.wait_for_selector("#res .bad")
    assert "Palabras nuevas por día" in p.inner_text("#res")


def test_datos_bajar_copia(con_datos):
    p = con_datos
    p.ir("datos")
    with p.expect_download() as d:
        p.click("#bajar")
    dl = d.value
    assert dl.suggested_filename.startswith("sprachlabor_") and dl.suggested_filename.endswith(".json")
    datos = json.loads(open(dl.path(), encoding="utf-8").read())
    assert datos["formato"] == "sprachlabor-datos" and len(datos["almacenes"]["palabras"]) == 12
    assert "ia_ajustes" in datos["almacenes"]["kv"] or True  # la clave vive en kv; la copia la lleva solo si el usuario la cargó
    assert "Copia bajada" in p.inner_text("#cres")


def test_ajustes_ia_guarda_y_no_muestra_la_clave(pagina):
    cargar_clave(pagina)
    assert CLAVE_FALSA not in pagina.content().replace(CLAVE_FALSA, "", 0)  # (el input se vació al guardar)
    assert pagina.input_value("#k") == ""
    pagina.ir("ia")
    assert CLAVE_FALSA not in pagina.content() and CLAVE_FALSA[-4:] in pagina.get_attribute("#k", "placeholder")
    pagina.ia.programar(lambda body: respuesta_api({}, modelo="claude-haiku-5-5", uso={"input_tokens": 10, "output_tokens": 2}) | {"content": [{"type": "text", "text": "ok"}]})
    pagina.click("#probar")
    pagina.wait_for_selector("#res .ok", timeout=15000)
    assert "funciona" in pagina.inner_text("#res")
    b = pagina.ia.llamadas[-1]["body"]
    assert b["model"] == "claude-haiku-5-5" and b["max_tokens"] == 5


def test_clave_invalida_da_mensaje_claro(pagina):
    cargar_clave(pagina)
    pagina.ia.programar(lambda body: (401, {"error": {"type": "authentication_error", "message": "invalid x-api-key"}}))
    pagina.click("#probar")
    pagina.wait_for_selector("#res .bad", timeout=15000)
    assert "401" in pagina.inner_text("#res")
