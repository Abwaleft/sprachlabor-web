// Ejercicios de números generados en el celular (infinitos, sin IA).
// Tipos: zahl (números y decimales), preis, uhrzeit (oficial y coloquial), datum.
// El texto para la voz va en palabras, así controlamos exactamente qué se dice.
// La verificación se describe con un `spec` para que se pueda volver a comprobar más tarde con la misma regla.

const ONES = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
  "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const TENS = { 2: "zwanzig", 3: "dreißig", 4: "vierzig", 5: "fünfzig", 6: "sechzig", 7: "siebzig", 8: "achtzig", 9: "neunzig" };
export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const TAGE_IM_MONAT = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const ARTEN = {
  zahl: "Escribí el número en cifras.",
  preis: "Escribí el precio (ej.: 3,99).",
  uhrzeit: "Escribí la hora (hh:mm).",
  datum: "Escribí la fecha (d.m. o d.m.aaaa).",
};

// ---------- números en palabras ----------

function lt100(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return TENS[t];
  return (u === 1 ? "ein" : ONES[u]) + "und" + TENS[t];
}

function lt1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = h ? (h === 1 ? "ein" : ONES[h]) + "hundert" : "";
  if (r) s += lt100(r);
  return s;
}

function attr(n) {
  const s = lt1000(n);
  return s.endsWith("eins") ? s.slice(0, -1) : s;
}

export function zahl(n) {
  if (n === 0) return "null";
  if (n < 0) return "minus " + zahl(-n);
  const parts = [];
  const mio = Math.floor(n / 1000000);
  const rest = n % 1000000;
  if (mio) parts.push(mio === 1 ? "eine Million" : `${attr(mio)} Millionen`);
  const th = Math.floor(rest / 1000);
  const r = rest % 1000;
  let w = th ? attr(th) + "tausend" : "";
  if (r) w += lt1000(r);
  if (w) parts.push(w);
  return parts.join(" ");
}

export function jahr(y) {
  if (y >= 1100 && y <= 1999) {
    const hi = Math.floor(y / 100);
    const lo = y % 100;
    return lt100(hi) + "hundert" + (lo ? lt100(lo) : "");
  }
  return zahl(y);
}

export function ordinal(n) {
  const special = { 1: "erst", 3: "dritt", 7: "siebt", 8: "acht" };
  if (special[n]) return special[n];
  return zahl(n) + (n < 20 ? "t" : "st");
}

const stunde = (h) => (h === 1 ? "ein" : zahl(h));

// ---------- verificación por spec ----------

const digits = (s) => (s.match(/\d+/g) || []).map(Number);

export function checkFromSpec(spec) {
  switch (spec.tipo) {
    case "int":
      return (s) => { s = s.replace(/[\s.'’]/g, ""); return /^\d+$/.test(s) && parseInt(s, 10) === +spec.n; };
    case "decimal":
      return (s) => {
        const m = /^\s*(\d+)\s*[,.]\s*(\d+)\s*$/.exec(s);
        return !!m && parseInt(m[1], 10) === +spec.a && m[2].replace(/0+$/, "") === String(spec.b);
      };
    case "preis":
      return (s) => {
        s = s.replace(/\s|€|eur(o)?/gi, "");
        const m = /^(\d*)(?:[,.](\d{1,2}))?$/.exec(s);
        if (!m || (!m[1] && !m[2])) return false;
        const euros = parseInt(m[1] || "0", 10);
        const frac = m[2] || "0";
        const cents = parseInt(frac, 10) * (frac.length === 1 ? 10 : 1);
        return euros === +spec.e && cents === +spec.c;
      };
    case "zeit":
      return (s) => {
        let d = digits(s);
        if (d.length === 1 && +spec.m === 0) d = [d[0], 0];
        if (d.length !== 2) return false;
        const [hh, mm] = d;
        if (mm !== +spec.m) return false;
        return spec.ambiguo ? hh % 12 === +spec.h % 12 : hh === +spec.h;
      };
    case "datum":
      return (s) => {
        const n = digits(s);
        const esperado = spec.y ? [+spec.d, +spec.mo, +spec.y] : [+spec.d, +spec.mo];
        return n.length === esperado.length && n.every((v, i) => v === esperado[i]);
      };
    default:
      return () => false;
  }
}

// ---------- generadores ----------

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtMiles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function genZahl() {
  const r = Math.random();
  if (r < 0.15) {
    const a = rnd(1, 99);
    const b = rnd(1, 9);
    const tpl = pick(["Die Anlage hat {} Megawatt.", "Ich bin {} Kilometer gelaufen.", "Der Wind weht mit {} Metern pro Sekunde.", "Die Zahl ist {}."]);
    return { art: "zahl", text_de: tpl.replace("{}", `${zahl(a)} Komma ${zahl(b)}`), loesung: `${a},${b}`, spec: { tipo: "decimal", a, b } };
  }
  let n;
  let tpl;
  if (r < 0.55) {
    n = rnd(13, 99);
    tpl = pick(["Die Hausnummer ist {}.", "Wir brauchen {} Stühle.", "Der Bus Nummer {} kommt gleich.", "Mein Opa ist {} Jahre alt.", "Die Zahl ist {}."]);
  } else if (r < 0.8) {
    n = rnd(100, 999);
    tpl = pick(["Das Buch hat {} Seiten.", "Bis Hamburg sind es noch {} Kilometer.", "Der Turm ist {} Meter hoch.", "Die Zahl ist {}."]);
  } else {
    n = rnd(1000, 99999);
    tpl = pick(["In dem Dorf wohnen {} Menschen.", "Das Auto kostet {} Euro.", "Die Anlage erzeugt {} Kilowattstunden pro Tag.", "Die Zahl ist {}."]);
  }
  return { art: "zahl", text_de: tpl.replace("{}", zahl(n)), loesung: fmtMiles(n), spec: { tipo: "int", n } };
}

function genPreis() {
  const r = Math.random();
  let e = r < 0.5 ? rnd(0, 9) : r < 0.85 ? rnd(10, 99) : rnd(100, 999);
  let c = pick([0, 5, 10, 19, 29, 45, 49, 50, 79, 89, 95, 99, rnd(1, 99)]);
  if (e === 0 && c === 0) e = 1;
  let betrag;
  if (e === 0) betrag = `${zahl(c)} Cent`;
  else betrag = (e === 1 ? "einen Euro" : `${zahl(e)} Euro`) + (c ? ` ${zahl(c)}` : "");
  const ding = pick(["Der Kaffee", "Die Fahrkarte", "Das Brot", "Das Ticket", "Die Jacke", "Das Zimmer", "Die Laufschuhe"]);
  const verb = ding === "Die Laufschuhe" ? "kosten" : "kostet";
  return { art: "preis", text_de: `${ding} ${verb} ${betrag}.`, loesung: `${e},${String(c).padStart(2, "0")} €`, spec: { tipo: "preis", e, c } };
}

function genUhrzeit() {
  if (Math.random() < 0.5) {
    const h = rnd(0, 23);
    const m = pick([0, rnd(1, 59), rnd(1, 59), 15, 30, 45]);
    let text = `Es ist ${stunde(h)} Uhr` + (m ? ` ${zahl(m)}` : "") + ".";
    if (Math.random() < 0.4) text = pick(["Der Zug fährt um", "Das Training beginnt um", "Wir treffen uns um"]) + text.slice("Es ist".length);
    return { art: "uhrzeit", text_de: text, loesung: `${h}:${String(m).padStart(2, "0")}`, spec: { tipo: "zeit", h, m, ambiguo: false } };
  }
  const h = rnd(1, 12);
  const nxt = (h % 12) + 1;
  const hz = (x) => (x === 1 ? "eins" : zahl(x));
  const m = pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  const phrase = {
    0: `${stunde(h)} Uhr`, 5: `fünf nach ${hz(h)}`, 10: `zehn nach ${hz(h)}`, 15: `Viertel nach ${hz(h)}`,
    20: `zwanzig nach ${hz(h)}`, 25: `fünf vor halb ${hz(nxt)}`, 30: `halb ${hz(nxt)}`, 35: `fünf nach halb ${hz(nxt)}`,
    40: `zwanzig vor ${hz(nxt)}`, 45: `Viertel vor ${hz(nxt)}`, 50: `zehn vor ${hz(nxt)}`, 55: `fünf vor ${hz(nxt)}`,
  }[m];
  const mm = String(m).padStart(2, "0");
  return { art: "uhrzeit", text_de: `Es ist ${phrase}.`, loesung: `${h}:${mm} (o ${h + 12}:${mm})`, spec: { tipo: "zeit", h, m, ambiguo: true } };
}

function genDatum() {
  const mo = rnd(1, 12);
  const d = rnd(1, TAGE_IM_MONAT[mo - 1]);
  const am = `am ${ordinal(d)}en ${MONATE[mo - 1]}`;
  if (Math.random() < 0.4) {
    const y = rnd(1950, 2030);
    const text = pick(["Er ist {} geboren.", "Das Kraftwerk wurde {} eröffnet.", "Der Marathon war {}."]).replace("{}", `${am} ${jahr(y)}`);
    return { art: "datum", text_de: text, loesung: `${d}.${mo}.${y}`, spec: { tipo: "datum", d, mo, y } };
  }
  const text = pick(["Ich habe {} Geburtstag.", "Der Termin ist {}.", "Wir fliegen {} nach Berlin.", "Das Rennen ist {}."]).replace("{}", am);
  return { art: "datum", text_de: text, loesung: `${d}.${mo}.`, spec: { tipo: "datum", d, mo, y: null } };
}

const GENERATORS = { zahl: genZahl, preis: genPreis, uhrzeit: genUhrzeit, datum: genDatum };
const PESOS = [["zahl", 4], ["preis", 2], ["uhrzeit", 3], ["datum", 2]];

export function generate(art = "mix") {
  if (!GENERATORS[art]) {
    const total = PESOS.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    art = PESOS.find(([, w]) => (r -= w) < 0)[0];
  }
  const a = GENERATORS[art]();
  return { ...a, prompt: ARTEN[a.art] };
}

export const check = (a, s) => checkFromSpec(a.spec)(s);
