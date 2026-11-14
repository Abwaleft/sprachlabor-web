"""Sirve la app en local para probarla (http://localhost:8769), sin caché HTTP y con los tipos MIME correctos.

  python scripts/servir.py [puerto]

Genera primero sw.js y js/version.js (scripts/publicar.py). Para el micrófono y el service worker alcanza con
localhost (está exento de https). Lo usan también las pruebas (tests/).
"""
from __future__ import annotations

import mimetypes
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/markdown", ".md")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # silencio
        pass


def servidor(puerto: int, raiz: Path = RAIZ) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", puerto), partial(Handler, directory=str(raiz)))


def en_hilo(puerto: int) -> ThreadingHTTPServer:
    s = servidor(puerto)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


if __name__ == "__main__":
    import publicar
    publicar.generar()
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8769
    print(f"Sprachlabor en http://localhost:{puerto}  (Ctrl+C para parar)")
    try:
        servidor(puerto).serve_forever()
    except KeyboardInterrupt:
        pass
