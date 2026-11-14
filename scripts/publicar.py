"""Genera los archivos versionados de la app y, si se pide, publica en GitHub Pages.

  python scripts/publicar.py            genera sw.js y js/version.js (hash del contenido) — para probar en local
  python scripts/publicar.py --push     además hace commit y push (GitHub Pages publica en ~1 min)

sw.js sale de scripts/sw.template.js con __VERSION__ (hash corto de todos los archivos de la app) y __ARCHIVOS__
(la lista a precachear). js/version.js lleva la misma versión y la fecha. Cada cambio de contenido = versión nueva =
el service worker vuelve a bajar el cascarón y la app recarga sola en el celular.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
EXCLUIR_DIRS = {".git", "scripts", "tests", "proto", "__pycache__", "node_modules"}
EXTENSIONES = {".html", ".css", ".js", ".webmanifest", ".json", ".md", ".png", ".svg"}
GENERADOS = {"sw.js", "js/version.js"}


def archivos_app() -> list[str]:
    out = []
    for p in sorted(RAIZ.rglob("*")):
        if not p.is_file() or p.suffix not in EXTENSIONES:
            continue
        rel = p.relative_to(RAIZ).as_posix()
        if any(part in EXCLUIR_DIRS for part in p.relative_to(RAIZ).parts):
            continue
        if rel in GENERADOS or rel in ("README.md", "requirements-dev.txt", "LICENSE.md"):
            continue
        out.append(rel)
    return out


def version_de(archivos: list[str]) -> str:
    h = hashlib.sha1()
    for a in archivos:
        h.update(a.encode())
        h.update((RAIZ / a).read_bytes())
    return h.hexdigest()[:10]


def generar() -> tuple[str, list[str]]:
    archivos = archivos_app()
    version = version_de(archivos)
    precache = [a for a in archivos if a != "index.html"] + ["index.html"]  # el índice al final, por legibilidad
    plantilla = (RAIZ / "scripts" / "sw.template.js").read_text(encoding="utf-8")
    sw = plantilla.replace("__VERSION__", version).replace("__ARCHIVOS__", json.dumps(precache, ensure_ascii=False))
    (RAIZ / "sw.js").write_text(sw, encoding="utf-8", newline="\n")
    fecha = datetime.now().strftime("%Y-%m-%d %H:%M")
    (RAIZ / "js" / "version.js").write_text(
        "// Versión de la app (la genera scripts/publicar.py).\n"
        f'export const VERSION = "{version}";\nexport const FECHA = "{fecha}";\n', encoding="utf-8", newline="\n")
    return version, precache


def main(argv: list[str]) -> int:
    version, precache = generar()
    print(f"Versión {version}: {len(precache)} archivos en el cascarón.")
    if "--push" in argv:
        msg = next((a for a in argv if not a.startswith("--")), None) or f"Publicar {version}"
        subprocess.run(["git", "add", "-A"], cwd=RAIZ, check=True)
        r = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=RAIZ)
        if r.returncode == 0:
            print("Nada para publicar.")
            return 0
        subprocess.run(["git", "commit", "-q", "-m", msg + "\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"], cwd=RAIZ, check=True)
        subprocess.run(["git", "push", "-q", "origin", "main"], cwd=RAIZ, check=True)
        print("Publicado. GitHub Pages lo sirve en ~1 minuto.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
