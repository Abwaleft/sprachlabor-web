"""Importar una copia exportada desde la PC (sprachlabor-2.0/scripts/export_celular.py).

Corre solo si existe el archivo que indica SPRACHLABOR_EXPORT_PC (son datos reales de un usuario: nunca van al repo).
Comprueba que la app abre con esos datos: Heute arma planes, Estadísticas calcula, las correcciones aparecen en la
Rückmeldung y el export al tutor se arma sin errores."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

pytestmark = pytest.mark.ui
RUTA = os.environ.get("SPRACHLABOR_EXPORT_PC", "")


@pytest.mark.skipif(not RUTA or not Path(RUTA).exists(), reason="sin SPRACHLABOR_EXPORT_PC")
def test_importar_copia_de_la_pc(pagina):
    datos = json.loads(Path(RUTA).read_text(encoding="utf-8"))
    r = pagina.evaluate("""async (d) => {
      const ex = await import(location.origin + "/js/datos/export.js");
      const resumen = ex.validar(d);
      await ex.importar(d, {guardarCopiaPrevia: false});
      return resumen; }""", datos)
    assert r["palabras"] > 0 and r["intentos"] > 0
    pagina.reload()
    pagina.wait_for_selector('body[data-ruta]')
    pagina.ir("")
    txt = pagina.inner_text("#app")
    assert "Hallo," in txt and "Racha" in txt
    s = pagina.evaluate("async () => (await import(location.origin + '/js/logica/stats.js')).compute()")
    assert s["totales"]["intentos"] == r["intentos"] and s["palabras"]["total"] == r["palabras"]
    assert len(s["evolucion_perfil"]) == r["envios"]
    pagina.ir("rueckmeldung")
    assert "Correcciones de Schreiben y Sprechen" in pagina.inner_text("#app")
    pagina.ir("estadisticas")
    assert pagina.locator("#c-sem svg").count() == 1
    exp = pagina.evaluate("async () => { const e = await import(location.origin + '/js/logica/envio.js'); const a = await e.exportA(); return {n: a.intentos_ultimos_7_dias_practicados.length, corregir: a.corregir_intentos, primera: a.primera_sincronizacion, chars: JSON.stringify(a).length}; }")
    assert exp["primera"] is False and exp["n"] > 0 and exp["chars"] < 200000
    print("export parte a:", exp)
