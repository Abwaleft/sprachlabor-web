// Proveedor «Claude directo»: el celular llama a la API de Claude con la clave del usuario.
//
// Verificado en la documentación oficial (13/11/2026):
// - POST https://api.anthropic.com/v1/messages con `x-api-key`, `anthropic-version: 2026-10-21` y, desde un
//   navegador, `anthropic-dangerous-direct-browser-access: true` (la API rechaza llamadas de navegador sin ese header).
// - Salida estructurada: `output_config.format = {type: "json_schema", schema}`; la respuesta trae el JSON como texto
//   en `content[0].text`. `output_config.effort` ("low" | "medium" | "high") controla cuánto razona el modelo;
//   el razonamiento cuenta como tokens de salida (`usage.output_tokens`).
// - `stop_reason`: "end_turn" (bien), "max_tokens" (cortado), "refusal" (rechazo: HTTP 200 y se cobra igual).
// - Caché del prompt: `cache_control: {type: "ephemeral"}` en un bloque de `system`; mínimo 512 tokens;
//   el formato de salida se renderiza ANTES del sistema, así que cada schema distinto es una caché distinta.
//
// La clave nunca se escribe en logs ni en mensajes de error: los errores de la API se devuelven sin la petición.

export const URL_API = "https://api.anthropic.com/v1/messages";
export const VERSION_API = "2026-10-21";

export class ErrorIA extends Error {
  constructor(msg, { status = 0, tipo = "", detalle = null, uso = null, stop_reason = null } = {}) {
    super(msg);
    this.name = "ErrorIA";
    this.status = status;
    this.tipo = tipo;
    this.detalle = detalle;
    this.uso = uso;
    this.stop_reason = stop_reason;
  }
}

function mensajeHTTP(status, cuerpo) {
  const d = (cuerpo && cuerpo.error) || {};
  const tipo = d.type || "";
  const txt = d.message || "";
  if (status === 401) return ["La clave de API no es válida (401). Revisala en Ajustes de IA.", "auth"];
  if (status === 403) return ["La clave no tiene permiso para esto (403).", "auth"];
  if (status === 429) return ["La API está limitando las llamadas (429). Esperá un minuto y probá de nuevo.", "rate"];
  if (status === 400 && /credit|balance|billing/i.test(txt)) return ["La cuenta de la API no tiene crédito. Cargá saldo en console.anthropic.com.", "credito"];
  if (status === 400) return [`La API rechazó la petición (400): ${txt}`, tipo || "peticion"];
  if (status === 529 || status === 503) return ["La API está sobrecargada. Probá en unos minutos.", "sobrecarga"];
  if (status >= 500) return [`Falló el servidor de la API (${status}). Probá de nuevo.`, "servidor"];
  return [`Error ${status} de la API: ${txt || "sin detalle"}`, tipo || "http"];
}

/**
 * Una llamada. `req` = {modelo, system: [bloques] | string, usuario: string | [bloques], schema, maxTokens, effort, timeoutMs}.
 * Devuelve {texto, salida (JSON parseado o null), uso, stop_reason, modelo, segundos}. Lanza ErrorIA.
 */
export async function llamar(apiKey, req, fetchImpl = fetch) {
  if (!apiKey) throw new ErrorIA("No hay clave de API cargada. Ponela en Ajustes de IA.", { tipo: "sin_clave" });
  const body = {
    model: req.modelo,
    max_tokens: req.maxTokens || 8000,
    messages: [{ role: "user", content: req.usuario }],
  };
  if (req.system) body.system = req.system;
  if (req.schema || req.effort) {
    body.output_config = {};
    if (req.schema) body.output_config.format = { type: "json_schema", schema: req.schema };
    if (req.effort) body.output_config.effort = req.effort;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), req.timeoutMs || 240000);
  const t0 = performance.now();
  let r;
  try {
    r = await fetchImpl(URL_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": VERSION_API,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === "AbortError") throw new ErrorIA("La IA tardó demasiado (más de 4 minutos) y se cortó la espera.", { tipo: "timeout" });
    throw new ErrorIA("No llego a la API de Claude. ¿Hay internet?", { tipo: "red", detalle: e && e.message });
  }
  clearTimeout(timer);
  const segundos = Math.round((performance.now() - t0) / 100) / 10;
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { cuerpo = null; }
  if (!r.ok) {
    const [msg, tipo] = mensajeHTTP(r.status, cuerpo);
    throw new ErrorIA(msg, { status: r.status, tipo, detalle: cuerpo && cuerpo.error });
  }
  const uso = cuerpo.usage || {};
  const texto = (cuerpo.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const out = { texto, salida: null, uso, stop_reason: cuerpo.stop_reason, modelo: cuerpo.model || req.modelo, segundos };
  if (cuerpo.stop_reason === "refusal") {
    throw new ErrorIA("La IA se negó a responder esta petición (refusal). Se cobró igual; revisá el contenido y probá de nuevo.", { tipo: "refusal", uso, stop_reason: "refusal" });
  }
  if (cuerpo.stop_reason === "max_tokens") {
    throw new ErrorIA("La respuesta de la IA quedó cortada (max_tokens). Probá de nuevo; si se repite, pedí menos contenido.", { tipo: "max_tokens", uso, stop_reason: "max_tokens" });
  }
  if (req.schema) {
    try { out.salida = JSON.parse(texto); } catch {
      throw new ErrorIA("La IA devolvió algo que no es JSON válido.", { tipo: "json", uso, detalle: texto.slice(0, 300) });
    }
  }
  return out;
}

/** Comprueba la clave con la llamada más chica posible (Haiku, 5 tokens). Devuelve {ok, modelo, costo} o lanza ErrorIA. */
export async function probarClave(apiKey, fetchImpl = fetch) {
  const r = await llamar(apiKey, { modelo: "claude-haiku-5-5", maxTokens: 5, usuario: "Antworte nur: ok" }, fetchImpl);
  return { ok: true, uso: r.uso, segundos: r.segundos };
}
