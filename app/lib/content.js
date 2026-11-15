import { db } from "./db.js";

/** In-memory content indexes. Loaded once from IndexedDB after seeding. */
export const C = {
  topics: [], terms: [], sentences: [], questions: [], grammar: [],
  comprehension: [], lexicon: new Map(), meta: null, quarantined: [],
  byId: new Map(),
  termsByTopic: new Map(),
  sentencesByTopic: new Map(),
  questionsByTopic: new Map(),
  sentencesByTerm: new Map(),
  questionsByTerm: new Map(),
};

export const nrm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const push = (map, key, val) => {
  if (key == null) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
};

export async function loadContent() {
  const [topics, terms, sentences, questions, grammar, comprehension, lex, metaRow] =
    await Promise.all([
      db.topics.toArray(), db.terms.toArray(), db.sentences.toArray(),
      db.questions.toArray(), db.grammar.toArray(), db.comprehension.toArray(),
      db.lexicon.toArray(), db.settings.get("contentMeta"),
    ]);

  C.topics = topics.sort((a, b) => a.n - b.n);
  C.terms = terms;
  C.sentences = sentences;
  // Questions whose rule has since changed are kept in the database for
  // transparency but must never be asked. Filter once, here, so no caller
  // can forget.
  C.quarantined = questions.filter((q) => q.status === "outdated");
  C.questions = questions.filter((q) => q.status !== "outdated");
  const active = C.questions;
  C.grammar = grammar.sort((a, b) => b.hits - a.hits);
  C.comprehension = comprehension;
  C.meta = metaRow?.value || null;

  C.lexicon = new Map(lex.map((r) => [r.w, r]));
  C.byId = new Map();
  for (const arr of [terms, sentences, active, grammar, comprehension]) {
    for (const o of arr) C.byId.set(o.id, o);
  }

  C.termsByTopic = new Map();
  C.sentencesByTopic = new Map();
  C.questionsByTopic = new Map();
  for (const t of terms) push(C.termsByTopic, t.topic, t);
  for (const s of sentences) push(C.sentencesByTopic, s.topic, s);
  for (const q of active) push(C.questionsByTopic, q.topic, q);

  // which sentences / questions actually contain each term
  C.sentencesByTerm = new Map();
  for (const s of sentences) {
    const seen = new Set();
    for (const ch of s.chunks || []) {
      const id = ch.g?.termId;
      if (id && !seen.has(id)) { seen.add(id); push(C.sentencesByTerm, id, s); }
    }
  }
  C.questionsByTerm = new Map();
  const termHeads = terms
    .filter((t) => t.head && t.head.length > 4)
    .map((t) => [nrm(t.head), t.id]);
  for (const q of active) {
    const blob = nrm(q.q + " " + (q.options || []).join(" "));
    for (const [h, id] of termHeads) {
      if (blob.includes(h)) push(C.questionsByTerm, id, q);
    }
  }

  // sentences that carry each grammar structure
  for (const g of C.grammar) {
    g.sentences = (g.sentenceIds || []).map((id) => C.byId.get(id)).filter(Boolean);
  }
  return C;
}

export const topic = (n) => C.topics.find((t) => t.n === n);
export const termsOf = (n) => C.termsByTopic.get(n) || [];
export const sentencesOf = (n) => C.sentencesByTopic.get(n) || [];
export const questionsOf = (n) => C.questionsByTopic.get(n) || [];

export function officialOf(n) {
  return questionsOf(n).filter((q) => q.origin === "official");
}
export function practiceOf(n) {
  return questionsOf(n).filter((q) => q.origin === "practice");
}

/** Look a word up for tap-to-translate, with morphology fallback. */
export function lookup(word) {
  const n = nrm(word);
  if (C.lexicon.has(n)) return { ...C.lexicon.get(n), kind: "lex" };
  const t = C.terms.find((x) => nrm(x.head) === n);
  if (t) return { w: word, en: t.en, note: t.simple, kind: "term", term: t };
  for (const suf of ["es", "s"]) {
    if (n.endsWith(suf) && C.lexicon.has(n.slice(0, -suf.length))) {
      return { ...C.lexicon.get(n.slice(0, -suf.length)), kind: "lex" };
    }
  }
  return null;
}

/** Deterministic shuffle so a given seed always produces the same order. */
export function seededShuffle(arr, seed) {
  let h = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr, n, seed) => seededShuffle(arr, seed).slice(0, n);

/** Distractors for a vocabulary question: prefer declared confusables. */
export function distractorsFor(term, field, count = 3, seed = "") {
  const out = [];
  const val = (t) => (field === "en" ? t.en : t.head);
  const taken = new Set([nrm(val(term) || "")]);
  for (const cf of term.conf || []) {
    const t = C.terms.find((x) => nrm(x.head) === nrm(cf));
    if (t && val(t) && !taken.has(nrm(val(t)))) { out.push(val(t)); taken.add(nrm(val(t))); }
  }
  const pool = (C.termsByTopic.get(term.topic) || C.terms).filter(
    (t) => t.id !== term.id && val(t) && Math.abs(t.difficulty - term.difficulty) <= 2
  );
  for (const t of seededShuffle(pool, seed + term.id)) {
    if (out.length >= count) break;
    if (taken.has(nrm(val(t)))) continue;
    out.push(val(t));
    taken.add(nrm(val(t)));
  }
  let i = 0;
  while (out.length < count && i < C.terms.length) {
    const t = C.terms[(i * 37) % C.terms.length];
    i++;
    const v = val(t);
    if (v && !taken.has(nrm(v))) {
      out.push(v);
      taken.add(nrm(v));
    }
  }
  return out.slice(0, count);
}
