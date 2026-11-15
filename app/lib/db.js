import Dexie from "dexie";
import { newCard } from "./fsrs.js";

export const ABILITIES = ["recognition", "comprehension", "production", "listening", "contextual"];
export const ABILITY_LABEL = {
  recognition: "Reconocer",
  comprehension: "Entender en contexto",
  production: "Escribir",
  listening: "Escuchar",
  contextual: "Usar en el examen",
};

export const db = new Dexie("micarnet");

db.version(1).stores({
  // content (replaceable, keyed by contentVersion)
  topics: "n, slug",
  terms: "id, topic, difficulty, origin, *conf",
  sentences: "id, topic, block, difficulty",
  questions: "id, topic, origin, kind",
  grammar: "id",
  comprehension: "id, topic",
  lexicon: "w",
  // progress (never destroyed by a content update)
  reviews: "key, itemId, itemType, ability, due, state, lapses",
  attempts: "++id, ts, itemId, itemType, correct, errorClass, topic",
  sessions: "date",
  events: "++id, ts, type",
  settings: "key",
});

export const reviewKey = (itemType, itemId, ability) => `${itemType}:${itemId}:${ability}`;

/* ------------------------------------------------------------------ settings */
const SETTINGS_DEFAULT = {
  dailyMinutes: 10,
  theme: "auto",
  hearts: false,
  retention: 0.9,
  speechRate: 0.95,
  speechVoice: null,
  showEnglish: true,
  newPerDay: 8,
  onboarded: false,
};

export async function getSettings() {
  const rows = await db.settings.toArray();
  const s = { ...SETTINGS_DEFAULT };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

/* ------------------------------------------------------------------ seeding */
const FILES = ["topics", "terms", "sentences", "questions", "grammar", "comprehension"];

async function fetchJSON(name) {
  const res = await fetch(new URL(`../data/${name}.json`, import.meta.url));
  if (!res.ok) throw new Error(`cannot load ${name}.json (${res.status})`);
  return res.json();
}

/**
 * Load content into IndexedDB. Only touches content tables — progress is
 * never cleared. Re-runs when contentVersion changes.
 */
export async function seedContent(onProgress = () => {}) {
  const meta = await fetchJSON("meta");
  const current = await db.settings.get("contentVersion");
  if (current && current.value === meta.contentVersion) {
    const n = await db.terms.count();
    if (n > 0) return { seeded: false, meta };
  }
  let step = 0;
  for (const name of FILES) {
    onProgress(name, ++step, FILES.length + 1);
    const rows = await fetchJSON(name);
    await db.table(name).clear();
    await db.table(name).bulkPut(rows);
  }
  onProgress("lexicon", ++step, FILES.length + 1);
  const lex = await fetchJSON("lexicon");
  await db.lexicon.clear();
  await db.lexicon.bulkPut(
    Object.entries(lex).map(([w, v]) => ({ w, en: v[0], note: v[1] || null }))
  );
  await db.settings.put({ key: "contentVersion", value: meta.contentVersion });
  await db.settings.put({ key: "contentMeta", value: meta });
  return { seeded: true, meta };
}

/* ------------------------------------------------------------------ reviews */
export async function getCard(itemType, itemId, ability) {
  const key = reviewKey(itemType, itemId, ability);
  const row = await db.reviews.get(key);
  if (row) return row;
  return { key, itemId, itemType, ability, ...newCard() };
}

export async function putCard(card) {
  await db.reviews.put(card);
}

export async function dueCards(limit = 500, now = Date.now()) {
  return db.reviews.where("due").belowOrEqual(now).limit(limit).toArray();
}

export async function countDue(now = Date.now()) {
  return db.reviews.where("due").belowOrEqual(now).count();
}

/* ------------------------------------------------------------------ attempts */
export async function logAttempt(a) {
  await db.attempts.add({ ts: Date.now(), ...a });
}

/* ------------------------------------------------------------------ sessions */
export function todayKey(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export async function bumpSession(patch) {
  const date = todayKey();
  const row = (await db.sessions.get(date)) || {
    date, seconds: 0, xp: 0, answered: 0, correct: 0, newTerms: 0, reviews: 0,
  };
  for (const k of Object.keys(patch)) row[k] = (row[k] || 0) + patch[k];
  await db.sessions.put(row);
  return row;
}

export async function streakInfo() {
  const rows = await db.sessions.orderBy("date").reverse().limit(400).toArray();
  const done = new Set(rows.filter((r) => r.xp > 0).map((r) => r.date));
  let streak = 0;
  const d = new Date();
  if (!done.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (done.has(todayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const best = (() => {
    const list = [...done].sort();
    let b = 0, run = 0, prev = null;
    for (const k of list) {
      if (prev) {
        const gap = (new Date(k) - new Date(prev)) / 86400000;
        run = gap === 1 ? run + 1 : 1;
      } else run = 1;
      b = Math.max(b, run);
      prev = k;
    }
    return b;
  })();
  return { streak, best, days: done.size, rows };
}

/* ------------------------------------------------------------------ backup */
const PROGRESS_TABLES = ["reviews", "attempts", "sessions", "events", "settings"];

export async function exportBackup() {
  const out = {
    format: "micarnet-backup",
    version: 1,
    exported: new Date().toISOString(),
    data: {},
  };
  for (const t of PROGRESS_TABLES) out.data[t] = await db.table(t).toArray();
  out.counts = Object.fromEntries(Object.entries(out.data).map(([k, v]) => [k, v.length]));
  return out;
}

export function validateBackup(obj) {
  const errs = [];
  if (!obj || typeof obj !== "object") errs.push("Not a JSON object.");
  else {
    if (obj.format !== "micarnet-backup") errs.push("Not a Mi Carnet backup file.");
    if (typeof obj.version !== "number") errs.push("Missing version.");
    if (obj.version > 1) errs.push(`Backup version ${obj.version} is newer than this app understands.`);
    if (!obj.data || typeof obj.data !== "object") errs.push("Missing data block.");
    else {
      for (const t of PROGRESS_TABLES) {
        if (obj.data[t] && !Array.isArray(obj.data[t])) errs.push(`${t} is not a list.`);
      }
      const r = obj.data.reviews || [];
      if (r.length && !r.every((x) => x && typeof x.key === "string")) {
        errs.push("reviews rows are missing their key.");
      }
    }
  }
  return { ok: errs.length === 0, errors: errs };
}

/** Compare a backup against what is stored now, without writing anything. */
export async function diffBackup(obj) {
  const d = {};
  for (const t of PROGRESS_TABLES) {
    const incoming = obj.data[t] || [];
    const existing = await db.table(t).count();
    let dup = 0;
    if (t === "reviews") {
      const keys = new Set((await db.reviews.toCollection().primaryKeys()).map(String));
      dup = incoming.filter((x) => keys.has(String(x.key))).length;
    } else if (t === "sessions") {
      const keys = new Set((await db.sessions.toCollection().primaryKeys()).map(String));
      dup = incoming.filter((x) => keys.has(String(x.date))).length;
    } else if (t === "settings") {
      const keys = new Set((await db.settings.toCollection().primaryKeys()).map(String));
      dup = incoming.filter((x) => keys.has(String(x.key))).length;
    }
    d[t] = { incoming: incoming.length, existing, duplicates: dup, new: incoming.length - dup };
  }
  return d;
}

/**
 * Import a backup. mode "replace" wipes progress first; mode "merge" keeps
 * whichever review row was reviewed more recently. A snapshot of the current
 * state is always stored first so an import can be undone.
 */
export async function importBackup(obj, mode = "merge") {
  const v = validateBackup(obj);
  if (!v.ok) throw new Error(v.errors.join(" "));
  const snapshot = await exportBackup();
  await db.settings.put({ key: "preImportSnapshot", value: snapshot });

  await db.transaction("rw", PROGRESS_TABLES.map((t) => db.table(t)), async () => {
    if (mode === "replace") {
      for (const t of PROGRESS_TABLES) {
        if (t === "settings") {
          const keep = await db.settings.bulkGet(["contentVersion", "contentMeta", "preImportSnapshot"]);
          await db.settings.clear();
          await db.settings.bulkPut(keep.filter(Boolean));
        } else {
          await db.table(t).clear();
        }
      }
    }
    for (const t of PROGRESS_TABLES) {
      const rows = obj.data[t] || [];
      if (!rows.length) continue;
      if (t === "attempts" || t === "events") {
        await db.table(t).bulkAdd(rows.map(({ id, ...r }) => r));
      } else if (t === "reviews" && mode === "merge") {
        const existing = await db.reviews.bulkGet(rows.map((r) => r.key));
        const win = rows.filter((r, i) => !existing[i] || (r.last || 0) > (existing[i].last || 0));
        await db.reviews.bulkPut(win);
      } else if (t === "settings" && mode === "merge") {
        await db.settings.bulkPut(
          rows.filter((r) => !["contentVersion", "contentMeta", "preImportSnapshot"].includes(r.key))
        );
      } else {
        await db.table(t).bulkPut(rows);
      }
    }
  });
  return { restoredFrom: obj.exported, mode };
}

export async function undoImport() {
  const snap = await db.settings.get("preImportSnapshot");
  if (!snap) throw new Error("No snapshot available.");
  await importBackup(snap.value, "replace");
  await db.settings.delete("preImportSnapshot");
}

export async function wipeProgress() {
  for (const t of ["reviews", "attempts", "sessions", "events"]) await db.table(t).clear();
  const keep = ["contentVersion", "contentMeta"];
  const rows = await db.settings.toArray();
  await db.settings.bulkDelete(rows.map((r) => r.key).filter((k) => !keep.includes(k)));
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage || 0, quota: e.quota || 0 };
}

/* ------------------------------------------------------- persistent storage
   Without this the browser is allowed to evict IndexedDB under storage
   pressure, which would silently wipe every review. Chrome and Safari decide
   from engagement heuristics and usually grant it without a prompt; Firefox
   shows a permission prompt. So we do NOT ask on the very first paint — we
   wait until there is progress worth protecting, which is also when the
   heuristics are most likely to say yes and when a prompt makes sense. */

const PERSIST_KEY = "persistState";
const RETRY_AFTER = 7 * 86400000;
const MAX_AUTO_ASKS = 4;

export async function persistenceState() {
  if (!navigator.storage?.persisted) return { supported: false, granted: false };
  try {
    return { supported: true, granted: await navigator.storage.persisted() };
  } catch {
    return { supported: false, granted: false };
  }
}

/**
 * Ask the browser to keep this site's data.
 * Self-throttling: retries at most once a week, and gives up asking by itself
 * after a few refusals. `force: true` (the Settings button) ignores both.
 */
export async function ensurePersistence({ force = false, minReviews = 5 } = {}) {
  if (!navigator.storage?.persist) return { supported: false, granted: false, asked: false };
  let already = false;
  try {
    already = await navigator.storage.persisted();
  } catch {
    return { supported: false, granted: false, asked: false };
  }
  if (already) return { supported: true, granted: true, asked: false };

  const rec = (await db.settings.get(PERSIST_KEY))?.value || { asks: 0, last: 0 };
  if (!force) {
    if (await db.reviews.count() < minReviews) {
      return { supported: true, granted: false, asked: false, reason: "no-data-yet" };
    }
    if (Date.now() - (rec.last || 0) < RETRY_AFTER) {
      return { supported: true, granted: false, asked: false, reason: "asked-recently" };
    }
    if ((rec.asks || 0) >= MAX_AUTO_ASKS) {
      return { supported: true, granted: false, asked: false, reason: "gave-up" };
    }
  }

  let granted = false;
  try {
    granted = await navigator.storage.persist();
  } catch {
    granted = false;
  }
  await db.settings.put({
    key: PERSIST_KEY,
    value: { asks: (rec.asks || 0) + 1, last: Date.now(), granted },
  });
  return { supported: true, granted, asked: true };
}
