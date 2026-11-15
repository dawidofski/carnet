/* Peninsular Spanish text-to-speech via the browser. No network, no key. */

let voices = [];
let preferred = null;

function rank(v) {
  let s = 0;
  if (v.lang === "es-ES") s += 100;
  else if (v.lang?.startsWith("es")) s += 40;
  if (/spain|españa|castil/i.test(v.name)) s += 20;
  if (/google/i.test(v.name)) s += 8;
  if (/monica|mónica|jorge|pablo|elvira|laia|helena/i.test(v.name)) s += 6;
  if (v.localService) s += 4;
  return s;
}

export function refreshVoices() {
  if (!("speechSynthesis" in window)) return [];
  voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("es"));
  voices.sort((a, b) => rank(b) - rank(a));
  return voices;
}

export function spanishVoices() {
  if (!voices.length) refreshVoices();
  return voices;
}

export function setVoice(uri) {
  preferred = uri;
}

export function isAvailable() {
  return "speechSynthesis" in window && spanishVoices().length > 0;
}

export function hasPeninsular() {
  return spanishVoices().some((v) => v.lang === "es-ES");
}

let current = null;

export function speak(text, { rate = 0.95, slow = false, onend } = {}) {
  if (!("speechSynthesis" in window)) {
    onend?.();
    return null;
  }
  cancel();
  const u = new SpeechSynthesisUtterance(text);
  const list = spanishVoices();
  const v = (preferred && list.find((x) => x.voiceURI === preferred)) || list[0];
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else {
    u.lang = "es-ES";
  }
  u.rate = slow ? Math.max(0.5, rate * 0.65) : rate;
  u.pitch = 1;
  u.onend = () => { current = null; onend?.(); };
  u.onerror = () => { current = null; onend?.(); };
  current = u;
  speechSynthesis.speak(u);
  return u;
}

export function cancel() {
  if ("speechSynthesis" in window) {
    try { speechSynthesis.cancel(); } catch {}
  }
  current = null;
}

if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
  refreshVoices();
}

/** Loose comparison for "type what you heard" answers. */
export function sameText(a, b) {
  const clean = (s) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  return clean(a) === clean(b);
}

/** 0..1 similarity, so near-misses can be graded as "hard" rather than wrong. */
export function similarity(a, b) {
  const clean = (s) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const x = clean(a), y = clean(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const xs = x.split(" "), ys = y.split(" ");
  const set = new Set(ys);
  let hit = 0;
  for (const w of xs) if (set.has(w)) hit++;
  return hit / Math.max(xs.length, ys.length);
}
