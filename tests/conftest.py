"""Pruebas de la app autocontenida: la app servida en local (scripts/servir.py) y Edge sin cabeza con Playwright.

- Nunca se llama a la API de Claude ni a GitHub: `page.route` intercepta api.anthropic.com y api.github.com y
  responde con las respuestas grabadas de tests/fixtures/. Si algo intenta salir a esas APIs sin interceptar, falla.
- Audio silenciado (?mute=1 y --mute-audio) y micrófono falso (un WAV generado). Piper y Whisper no se bajan:
  el cascarón se prueba con la voz del sistema (ninguna en el Edge de prueba → play() devuelve true igual por mute).
- Cada prueba arranca con la base vacía (IndexedDB se borra entre pruebas) salvo que use la fixture `con_datos`.

Edge es el único navegador que Playwright puede manejar en la PC de desarrollo (Smart App Control bloquea los
navegadores sin firma que trae Playwright).
"""
from __future__ import annotations

import json
import math
import struct
import sys
import wave
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import publicar  # noqa: E402
import servir  # noqa: E402

PUERTO = 8779
BASE = f"http://127.0.0.1:{PUERTO}"
FIXTURES = Path(__file__).parent / "fixtures"


def fixture(nombre: str) -> dict:
    return json.loads((FIXTURES / nombre).read_text(encoding="utf-8"))


def _wav_tono(path, segundos=3.0, sr=16000, hz=440.0):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(12000 * math.sin(2 * math.pi * hz * i / sr))) for i in range(int(sr * segundos))))
    return path


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args, tmp_path_factory):
    wav = _wav_tono(tmp_path_factory.mktemp("mic") / "voz.wav")
    return {**browser_type_launch_args, "channel": "msedge", "headless": True,
            "args": ["--mute-audio", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                     f"--use-file-for-fake-audio-capture={wav}", "--autoplay-policy=no-user-gesture-required"]}


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "permissions": ["microphone"], "base_url": BASE, "viewport": {"width": 420, "height": 860}}


@pytest.fixture(scope="session")
def servidor():
    publicar.generar()
    s = servir.en_hilo(PUERTO)
    yield BASE
    s.shutdown()


def respuesta_api(so: dict, modelo="claude-sonnet-5-5", stop="end_turn", uso=None) -> dict:
    """Arma una respuesta de /v1/messages con salida estructurada como la devuelve la API (JSON en content[0].text)."""
    return {"id": "msg_test", "type": "message", "role": "assistant", "model": modelo, "stop_reason": stop,
            "content": [{"type": "text", "text": json.dumps(so, ensure_ascii=False)}],
            "usage": uso or {"input_tokens": 5000, "output_tokens": 1200, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}}


class IAGrabada:
    """Intercepta api.anthropic.com. `programar(fn)` decide la respuesta según el cuerpo de la petición."""

    def __init__(self, page):
        self.page = page
        self.llamadas: list[dict] = []
        self._fn = None
        page.route("https://api.anthropic.com/**", self._manejar)
        page.route("https://api.github.com/**", lambda route: route.fulfill(status=500, body="github no se usa en pruebas"))

    def programar(self, fn):
        self._fn = fn

    def _manejar(self, route):
        req = route.request
        cuerpo = json.loads(req.post_data or "{}")
        self.llamadas.append({"headers": req.headers, "body": cuerpo})
        if "x-api-key" not in req.headers or req.headers.get("anthropic-dangerous-direct-browser-access") != "true":
            route.fulfill(status=401, content_type="application/json", body=json.dumps({"error": {"type": "authentication_error", "message": "falta header"}}))
            return
        if not self._fn:
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": {"type": "test", "message": "llamada no esperada"}}))
            return
        r = self._fn(cuerpo)
        if isinstance(r, tuple):
            status, body = r
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
        else:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(r, ensure_ascii=False))


@pytest.fixture
def pagina(page, servidor):
    """Página con audio silenciado, base vacía y consola vigilada (falla si hay errores)."""
    errores = []
    page.on("pageerror", lambda e: errores.append(f"pageerror: {e}"))
    page.on("console", lambda m: errores.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.set_default_timeout(10000)
    page.ia = IAGrabada(page)
    # base limpia
    page.goto(f"{servidor}/?mute=1#/datos")
    page.wait_for_selector('body[data-ruta]')
    page.evaluate("async () => { const dbs = await indexedDB.databases(); for (const d of dbs) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); }")
    page.reload()  # la app arranca de cero sobre la base vacía
    page.wait_for_selector('body[data-ruta]')

    def ir(ruta=""):
        """Navega como lo haría un enlace de la app (cambio de hash) y espera a que la vista termine de dibujarse."""
        destino = f"{servidor}/?mute=1#/{ruta}"
        if page.url.split("#")[0] == destino.split("#")[0]:
            page.evaluate("(h) => { if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; }", f"#/{ruta}")
        else:
            page.goto(destino)
        nombre = ruta.split("?")[0] or "heute"
        page.wait_for_selector(f'body[data-ruta="{nombre}"]')
        return page

    def modulo(ruta):
        """Importa un módulo de la app dentro de la página (para probar la lógica directamente)."""
        return f"import('{servidor}/{ruta}')"

    page.ir = ir
    page.modulo = modulo
    yield page
    errores = [e for e in errores if "favicon" not in e and "Failed to load resource" not in e and "service worker" not in e.lower()]
    assert not errores, errores


PERFIL_PRUEBA = {
    "nombre": "Prueba", "idiomas": {"nativo": "español", "otros": ["inglés"]}, "idioma_explicaciones": "español rioplatense", "meta": "B1",
    "temas": ["vida diaria", "energía"], "niveles": {"lesen": "A2", "hoeren": "A2", "schreiben": "A1+", "sprechen": "A2"},
    "patrones": [{"patron": i, "nombre": f"Patrón {i}", "descripcion": "", "peso": 0.8, "nota": ""} for i in range(1, 6)],
    "progreso_b1": 35, "fecha": "2026-11-14", "origen": "test",
}


@pytest.fixture
def con_datos(pagina):
    """Perfil de prueba + el lote grabado (palabras, Hören, Diktat, Vorlesen, consignas) importados directo en la base."""
    so = fixture("sync_respuesta.json")
    pagina.evaluate(f"""async () => {{
      const db = await {pagina.modulo('js/datos/db.js')};
      const vok = await {pagina.modulo('js/logica/vokabeln.js')};
      const envio = await {pagina.modulo('js/logica/envio.js')};
      const seeds = await {pagina.modulo('js/logica/seeds.js')};
      await db.kvSet("perfil", {json.dumps(PERFIL_PRUEBA, ensure_ascii=False)});
      const so = {json.dumps(so, ensure_ascii=False)};
      await vok.agregar(so.palabras_nuevas, 1);
      await envio.importarLote(so.lote, 1);
      await seeds.asegurar();
    }}""")
    return pagina
