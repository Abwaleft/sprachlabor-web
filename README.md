# Sprachlabor

App para aprender alemán todos los días desde el celular, sin instalar nada y sin servidor propio: una PWA
servida por GitHub Pages. Los datos del alumno viven en su dispositivo (IndexedDB) y la IA (el tutor) es la
API de Claude, llamada directo desde el celular con la clave de API del propio usuario.

**App:** https://abwaleft.github.io/sprachlabor-web/ · En Chrome Android: menú ⋮ → *Instalar app*.

Este repo no contiene datos de nadie: ni perfiles, ni claves, ni grabaciones.

## Qué hace

| Ejercicio | Cómo funciona en el celular | Necesita internet |
|---|---|---|
| **Vokabeln** | Repetición espaciada (SM-2, 4 botones). Repasos vencidos primero, nuevas según el cupo del día. | no |
| **Hören** | Audio de 1–3 frases, pregunta de detalle, máximo 2 escuchas. | no |
| **Diktat** | Escribir lo que se oye; comparación palabra por palabra (mayúsculas, diéresis, orden ↔). | no |
| **Zahlen** | Números, precios, horas y fechas generados en el celular, infinitos. | no |
| **Vorlesen** | Leer una frase en voz alta; Whisper (en el celular, ~75 MB una vez) marca qué se entendió. | no |
| **Schreiben** | Consigna estilo Goethe B1, contador de palabras, «Corregir ahora». | para corregir |
| **Sprechen** | Monólogo de 30–90 s; transcripción provisoria en el celular; literal desde la PC (buzón, opcional). | para corregir |
| **Enviar al tutor** | 4 llamadas a la IA: corrige lo pendiente, actualiza el perfil, genera palabras y ejercicios para ~3 días. | sí |

Además: **Heute** (plan de 5/10/20 min según lo que hay que repasar), racha, **Estadísticas** (con tokens y costo
de la IA por mes), **Opciones**, **Datos** (copia de seguridad, importar, buzón, voz) y **Ajustes de IA**.

La voz alemana es **Piper** (`de_DE-thorsten-medium`) corriendo en el navegador: 63 MB una sola vez, después
todo offline. Mientras no esté bajada, se usa la voz alemana del sistema. Los audios de los ejercicios se
generan en segundo plano y quedan en caché.

## Cómo empezar (usuario)

1. Abrir la app e instalarla (opcional pero recomendado).
2. Completar el **test de nivel** (10 min): datos, lectura, escucha, un texto corto y un monólogo opcional.
   Con eso se crea tu perfil. Sin clave de API el perfil se estima en el celular; con clave, lo arma el tutor.
3. En **Ajustes de IA**, pegar tu clave de la API de Claude (console.anthropic.com → API keys; hace falta saldo).
   La clave queda solo en tu celular y viaja únicamente a `api.anthropic.com`.
4. **Enviar al tutor**: genera el primer lote. Después, practicar todos los días y enviar cada ~3 días.
5. En **Datos**, bajar la voz (63 MB) y hacer una copia de seguridad cada tanto (Heute avisa).

**Costo**: una corrección ≈ US$ 0,01–0,02; un envío completo ≈ US$ 0,15–0,45. Con una corrección por día y un
envío cada 3 días: **≈ US$ 2 por mes** (modelo Sonnet 5.5; Haiku como modo económico para correcciones). Todo
queda registrado en Estadísticas → *Costo de la IA*.

## Cómo está hecha

Sin frameworks ni bundler: HTML + CSS + módulos ES nativos. Carpetas:

```
index.html, style.css, manifest.webmanifest, icons/
sw.js                 service worker (generado por scripts/publicar.py desde scripts/sw.template.js)
tutor/instrucciones.md  instrucciones GENÉRICAS del tutor (lo personal va en el perfil, que es un dato)
tutor/schemas/         JSON Schemas de la salida del tutor
js/
  datos/     db.js (IndexedDB, almacenes e índices) · migraciones.js (migraciones de datos) · export.js (copia/importar) · tiempo.js
  logica/    srs, diktat, zahlen, vokabeln, uebungen, produktion, heute, niveles, opciones, stats, estado, perfil,
             intentos, seeds, envio (4 partes), korrektur, testnivel
  ia/        ia.js (ÚNICO punto de acceso a la IA) · claude.js (proveedor: API directa) · schemas.js · tutor.js (prompts) · costos.js
  voz/       tts.js (Piper + voz del sistema, caché de WAV) · stt.js + stt-worker.js (Whisper en un Web Worker) · pcm.js
  buzon/     github.js (API de contenidos) · buzon.js (grabaciones ↔ PC, copias)
  views/     una pantalla por archivo
  main.js, router.js, session.js, audio.js, recorder.js, feedback.js, charts.js, dom.js, keys.js, help.js, labels.js, errores.js
```

**IA.** Todo pasa por `js/ia/ia.js`. El proveedor actual (`claude.js`) llama a `POST /v1/messages` con
`x-api-key`, `anthropic-version: 2026-10-21` y `anthropic-dangerous-direct-browser-access: true`, salida
estructurada (`output_config.format = json_schema`), `effort` bajo para corregir y medio para el envío, y maneja
`stop_reason` `refusal` / `max_tokens`. Cada llamada registra tokens y costo en el almacén `ia_llamadas`. Para
vender la app con un servidor propio (login, clave del lado del servidor, límites por usuario) se agrega otro
proveedor con la misma función `llamar(cfg, req)` y no cambia nada más.

**Envío en 4 partes.** El schema completo del envío supera el límite de la gramática de salida estructurada, así
que se pide en cuatro llamadas con schemas chicos, cada una con solo los datos que necesita (correcciones y
perfil · palabras · Hören/Diktat/Vorlesen · Schreiben/Sprechen). Cada parte que llega se guarda; si una falla,
«Completar el envío a medias» reintenta solo esa.

**Buzón con la PC (opcional).** Whisper en el celular a veces corrige el orden de las palabras del alumno. Para
una transcripción literal, la app sube las grabaciones de Sprechen a un repo **privado** de GitHub del usuario
(token *fine-grained* con permiso «Contents» solo en ese repo) y un script en la PC (`taller.py`, en el repo
privado sprachlabor-2.0) las transcribe con wav2vec2 + Whisper y devuelve el texto por el mismo buzón. El mismo
buzón guarda copias de seguridad.

**Datos.** IndexedDB con almacenes `kv, palabras, items, intentos, feedback, envios, sesiones, audio,
ia_llamadas, grabaciones`. Esquema versionado (`db.js`) y migraciones de datos (`migraciones.js`) con copia previa
en `kv`. Exportar/importar en JSON (`export.js`); la PC exporta al mismo formato con `scripts/export_celular.py`.

## Desarrollo

```
python scripts/servir.py          # http://localhost:8769 (genera sw.js y js/version.js primero)
python scripts/publicar.py        # solo generar sw.js / version.js
python scripts/publicar.py --push # generar + commit + push → GitHub Pages
```

Pruebas (pytest + Playwright sobre Edge sin cabeza; nunca llaman a la IA ni a GitHub: respuestas grabadas en
`tests/fixtures/`):

```
pip install -r requirements-dev.txt
python -m playwright install msedge   # o usar el Edge del sistema
python -m pytest tests
```

`scripts/test.bat` usa el entorno Python de la carpeta hermana `sprachlabor-2.0` si existe. La prueba
`tests/test_import_pc.py` corre solo con `SPRACHLABOR_EXPORT_PC=<copia exportada desde la PC>`.

## Privacidad y licencias

- Los textos, audios y resultados del alumno viven en su dispositivo. Lo que se manda a la API de Claude
  (textos, transcripciones, estadísticas resumidas) va con la clave del propio usuario; no hay servidor
  intermedio. Las grabaciones solo salen del celular si el usuario configura el buzón (su repo privado).
- Librerías: `@mintplex-labs/piper-tts-web` (MIT), onnxruntime-web (MIT), `@huggingface/transformers` (Apache 2.0).
  Modelos: Piper y la voz `de_DE-thorsten-medium` (MIT; dataset Thorsten-Voice CC0), `Xenova/whisper-base` (MIT).
  Antes de venderla: revisar licencias y agregar un aviso de privacidad (ver docs/ROADMAP.md en sprachlabor-2.0).
