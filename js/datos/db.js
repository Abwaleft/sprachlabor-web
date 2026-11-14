// Base de datos local (IndexedDB). Todo lo del usuario vive acá, en su celular.
//
// Esquema versionado: `ESQUEMA` sube cuando cambian los almacenes o índices (onupgradeneeded) y
// `MIGRACIONES` (datos/migraciones.js) corre las migraciones de datos pendientes al abrir, guardando la última
// aplicada en kv["esquema_datos"]. Antes de migrar datos se guarda una copia en kv["copia_pre_migracion"].
//
// Almacenes:
//   kv           clave → valor (perfil, opciones, niveles, ajustes de IA, metadatos)
//   palabras     vocabulario con su estado de repetición espaciada
//   items        ejercicios del lote: hoeren, diktat, vorlesen, schreiben, sprechen
//   intentos     cada ejercicio hecho (payload con el detalle), con `enviado` 0/1 para el tutor
//   feedback     correcciones del tutor (por intento)
//   envios       cada «Enviar al tutor» con su resultado y lo que costó
//   sesiones     sesión del día (plan y avance)
//   audio        WAV generados con Piper en el celular (hash del texto → blob)
//   ia_llamadas  registro de cada llamada a la IA: tokens, costo, tiempo
//   grabaciones  audios de Sprechen (y Vorlesen) para el taller de la PC

export const NOMBRE = "sprachlabor";
export const ESQUEMA = 1;

let dbp = null;

function definir(d, oldVersion) {
  if (oldVersion < 1) {
    d.createObjectStore("kv");
    const p = d.createObjectStore("palabras", { keyPath: "id", autoIncrement: true });
    p.createIndex("due", "due");
    p.createIndex("introduced", "introduced");
    p.createIndex("clave", ["wort", "artikel"], { unique: true });
    const it = d.createObjectStore("items", { keyPath: "id", autoIncrement: true });
    it.createIndex("type", "type");
    const a = d.createObjectStore("intentos", { keyPath: "id", autoIncrement: true });
    a.createIndex("ts", "ts");
    a.createIndex("type", "type");
    a.createIndex("enviado", "enviado");
    a.createIndex("client_id", "client_id", { unique: true });
    const f = d.createObjectStore("feedback", { keyPath: "id", autoIncrement: true });
    f.createIndex("attempt_id", "attempt_id");
    d.createObjectStore("envios", { keyPath: "id", autoIncrement: true });
    const s = d.createObjectStore("sesiones", { keyPath: "id", autoIncrement: true });
    s.createIndex("estado", "estado");
    d.createObjectStore("audio", { keyPath: "hash" });
    const ia = d.createObjectStore("ia_llamadas", { keyPath: "id", autoIncrement: true });
    ia.createIndex("ts", "ts");
    const g = d.createObjectStore("grabaciones", { keyPath: "id", autoIncrement: true });
    g.createIndex("estado", "estado");
    g.createIndex("attempt_id", "attempt_id");
  }
}

export const ALMACENES = ["kv", "palabras", "items", "intentos", "feedback", "envios", "sesiones", "audio", "ia_llamadas", "grabaciones"];

/** Abre (o crea) la base. `nombre` distinto solo en pruebas. */
export function abrir(nombre = NOMBRE) {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(nombre, ESQUEMA);
    req.onupgradeneeded = (e) => definir(req.result, e.oldVersion);
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => { d.close(); dbp = null; };
      res(d);
    };
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error("La base está abierta en otra pestaña: cerrala y recargá."));
  });
  return dbp;
}

export function cerrar() {
  if (!dbp) return Promise.resolve();
  return dbp.then((d) => { d.close(); dbp = null; });
}

/** Promesa de un IDBRequest. */
export const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/**
 * Transacción sobre uno o varios almacenes. `fn(t)` recibe un ayudante con operaciones que devuelven promesas
 * y corren dentro de la MISMA transacción (no esperar promesas ajenas a IndexedDB adentro: la cierra).
 * Devuelve lo que devuelva fn, cuando la transacción terminó.
 */
export async function tx(almacenes, modo, fn) {
  const d = await abrir();
  const lista = Array.isArray(almacenes) ? almacenes : [almacenes];
  return new Promise((res, rej) => {
    const t = d.transaction(lista, modo);
    const h = ayudante(t);
    let out;
    let fallo = null;
    Promise.resolve().then(() => fn(h)).then((v) => { out = v; }, (e) => { fallo = e; try { t.abort(); } catch { /* ya abortada */ } });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(fallo || t.error);
    t.onabort = () => rej(fallo || t.error || new Error("transacción abortada"));
  });
}

function ayudante(t) {
  const st = (n) => t.objectStore(n);
  return {
    get: (n, k) => req(st(n).get(k)),
    put: (n, v, k) => req(k === undefined ? st(n).put(v) : st(n).put(v, k)),
    add: (n, v, k) => req(k === undefined ? st(n).add(v) : st(n).add(v, k)),
    del: (n, k) => req(st(n).delete(k)),
    clear: (n) => req(st(n).clear()),
    all: (n, q, cnt) => req(st(n).getAll(q, cnt)),
    allKeys: (n, q) => req(st(n).getAllKeys(q)),
    count: (n, q) => req(st(n).count(q)),
    index: (n, i, q, cnt) => req(st(n).index(i).getAll(q, cnt)),
    indexCount: (n, i, q) => req(st(n).index(i).count(q)),
    indexGet: (n, i, k) => req(st(n).index(i).get(k)),
    /** Recorre un almacén (o índice) con cursor; `cb(valor, cursor)` devuelve false para cortar. */
    each: (n, cb, { index = null, query = null, dir = "next" } = {}) => new Promise((res, rej) => {
      const src = index ? st(n).index(index) : st(n);
      const r = src.openCursor(query, dir);
      r.onsuccess = () => {
        const c = r.result;
        if (!c) { res(); return; }
        if (cb(c.value, c) === false) { res(); return; }
        c.continue();
      };
      r.onerror = () => rej(r.error);
    }),
  };
}

// ---------- atajos de un solo almacén ----------

export const get = (n, k) => tx(n, "readonly", (t) => t.get(n, k));
export const put = (n, v, k) => tx(n, "readwrite", (t) => t.put(n, v, k));
export const add = (n, v) => tx(n, "readwrite", (t) => t.add(n, v));
export const del = (n, k) => tx(n, "readwrite", (t) => t.del(n, k));
export const all = (n, q, cnt) => tx(n, "readonly", (t) => t.all(n, q, cnt));
export const count = (n, q) => tx(n, "readonly", (t) => t.count(n, q));
export const porIndice = (n, i, q, cnt) => tx(n, "readonly", (t) => t.index(n, i, q, cnt));

// ---------- kv ----------

export const kvGet = async (k, def = null) => { const v = await get("kv", k); return v === undefined ? def : v; };
export const kvSet = (k, v) => put("kv", v, k);
export const kvDel = (k) => del("kv", k);

/** Borra TODO (para importar una copia o empezar de cero). */
export async function vaciar() {
  await tx(ALMACENES, "readwrite", async (t) => { for (const n of ALMACENES) await t.clear(n); });
}

/** Uso aproximado del almacenamiento del navegador. */
export async function uso() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const q = await navigator.storage.estimate();
      return { usado: q.usage || 0, cuota: q.quota || 0 };
    }
  } catch { /* sin API */ }
  return { usado: 0, cuota: 0 };
}

/** Pide al navegador que no borre los datos si le falta espacio (Chrome lo concede a las apps instaladas). */
export async function persistir() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* sin API */ }
  return false;
}
