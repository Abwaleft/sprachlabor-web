// Cliente mínimo de la API de contenidos de GitHub (REST, verificado en la documentación oficial el 14/11/2026):
//   GET    /repos/{owner}/{repo}/contents/{path}   lista una carpeta o trae un archivo (raw con Accept vnd.github.raw+json)
//   PUT    /repos/{owner}/{repo}/contents/{path}   {message, content (base64), sha?, branch?} → 201/200 con content.sha
//   DELETE /repos/{owner}/{repo}/contents/{path}   {message, sha}
// Permiso necesario del token (fine-grained): «Contents» lectura y escritura sobre ESE repo privado, nada más.
// El token vive en kv["buzon"] del celular; nunca se registra ni se muestra entero.

export class ErrorGitHub extends Error {
  constructor(msg, status = 0) { super(msg); this.name = "ErrorGitHub"; this.status = status; }
}

const API = "https://api.github.com";

function cabeceras(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...extra };
}

async function pedir(cfg, metodo, ruta, { body = null, accept = null, raw = false } = {}) {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${ruta}`;
  let r;
  try {
    r = await fetch(url, { method: metodo, headers: cabeceras(cfg.token, { ...(accept ? { Accept: accept } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }), body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new ErrorGitHub("No llego a GitHub. ¿Hay internet?", 0);
  }
  if (r.status === 404) return null;
  if (!r.ok) {
    let d = "";
    try { d = (await r.json()).message || ""; } catch { /* */ }
    if (r.status === 401) throw new ErrorGitHub("El token de GitHub no es válido o venció (401).", 401);
    if (r.status === 403) throw new ErrorGitHub(`GitHub no deja hacer esto (403): ${d || "¿el token tiene permiso «Contents» en ese repo?"}`, 403);
    if (r.status === 409) throw new ErrorGitHub("Conflicto en GitHub (409): alguien escribió el mismo archivo. Probá de nuevo.", 409);
    if (r.status === 422) throw new ErrorGitHub(`GitHub rechazó el archivo (422): ${d}`, 422);
    throw new ErrorGitHub(`GitHub respondió ${r.status}: ${d}`, r.status);
  }
  if (raw) return r;
  return r.json();
}

function aBase64(bytes) {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** Lista una carpeta: [{name, path, sha, size}] (vacío si no existe). */
export async function listar(cfg, carpeta) {
  const r = await pedir(cfg, "GET", carpeta);
  return Array.isArray(r) ? r.map(({ name, path, sha, size }) => ({ name, path, sha, size })) : [];
}

/** Trae un archivo como texto (raw). null si no existe. */
export async function leerTexto(cfg, ruta) {
  const r = await pedir(cfg, "GET", ruta, { accept: "application/vnd.github.raw+json", raw: true });
  return r ? r.text() : null;
}

export async function leerJSON(cfg, ruta) {
  const t = await leerTexto(cfg, ruta);
  return t == null ? null : JSON.parse(t);
}

/** Sube (crea o reemplaza) un archivo. `contenido` = string | Blob | Uint8Array. Devuelve {sha}. */
export async function escribir(cfg, ruta, contenido, mensaje = "sprachlabor") {
  let b64;
  if (typeof contenido === "string") b64 = aBase64(new TextEncoder().encode(contenido));
  else if (contenido instanceof Blob) b64 = aBase64(new Uint8Array(await contenido.arrayBuffer()));
  else b64 = aBase64(contenido);
  const body = { message: mensaje, content: b64 };
  const existente = await pedir(cfg, "GET", ruta).catch(() => null);
  if (existente && existente.sha) body.sha = existente.sha;
  const r = await pedir(cfg, "PUT", ruta, { body });
  return { sha: r && r.content ? r.content.sha : null };
}

export async function borrar(cfg, ruta, sha = null) {
  if (!sha) {
    const e = await pedir(cfg, "GET", ruta);
    if (!e) return false;
    sha = e.sha;
  }
  await pedir(cfg, "DELETE", ruta, { body: { message: "sprachlabor: procesado", sha } });
  return true;
}

/** Comprueba acceso: lista la raíz del repo. */
export async function probar(cfg) {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}`;
  let r;
  try { r = await fetch(url, { headers: cabeceras(cfg.token) }); } catch { throw new ErrorGitHub("No llego a GitHub. ¿Hay internet?"); }
  if (r.status === 404) throw new ErrorGitHub("No encuentro ese repo (404): revisá usuario/repo, o el token no lo ve.", 404);
  if (!r.ok) throw new ErrorGitHub(`GitHub respondió ${r.status}.`, r.status);
  const j = await r.json();
  if (!j.private) throw new ErrorGitHub("Ese repo es PÚBLICO: el buzón tiene que ser un repo privado (lleva tus grabaciones).", 400);
  return { ok: true, nombre: j.full_name, permisos: j.permissions || null };
}
