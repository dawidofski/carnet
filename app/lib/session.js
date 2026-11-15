import { C, termsOf, sentencesOf, officialOf, practiceOf, seededShuffle, pick, distractorsFor, nrm } from "./content.js";
import { db, reviewKey, ABILITIES, getSettings } from "./db.js";
import { maturity, dueInDays } from "./fsrs.js";
import { isAvailable as speechAvailable } from "./speech.js";

/** Listening exercises are pointless without a Spanish voice on the device. */
const canListen = () => speechAvailable();

/* Typical seconds per exercise, used to fill a time budget. */
export const COST = {
  "term-intro": 8, mcq: 10, "type-in": 16, chunk: 20, order: 25, gap: 14,
  "listen-pick": 14, "listen-type": 26, question: 22, comprehension: 20,
  "grammar-pair": 18, "term-match": 30,
};

const ab = (itemType, itemId, ability) => ({ itemType, itemId, ability });

/* ------------------------------------------------------------ exercises */

export function exTermIntro(term) {
  return { type: "term-intro", id: `ti-${term.id}`, term, review: null, cost: COST["term-intro"] };
}

export function exRecognition(term, seed) {
  if (!term.en) return exSimpleGloss(term, seed);
  const opts = seededShuffle([term.en, ...distractorsFor(term, "en", 3, seed)], seed + "r");
  return {
    type: "mcq", id: `rec-${term.id}`, kind: "recognition",
    prompt: term.es, sub: "", options: opts, answer: opts.indexOf(term.en),
    term, review: ab("term", term.id, "recognition"), cost: COST.mcq,
    explain: term.simple, src: term.src,
  };
}

export function exSimpleGloss(term, seed) {
  const pool = C.terms.filter((t) => t.simple && t.id !== term.id && t.topic === term.topic);
  const opts = seededShuffle(
    [term.simple, ...pick(pool, 3, seed + term.id).map((t) => t.simple)], seed + "g"
  );
  return {
    type: "mcq", id: `glo-${term.id}`, kind: "comprehension",
    prompt: term.es, sub: "¿Qué significa, en español sencillo?",
    options: opts, answer: opts.indexOf(term.simple),
    term, review: ab("term", term.id, "comprehension"), cost: COST.mcq, src: term.src,
  };
}

export function exProduction(term) {
  return {
    type: "type-in", id: `pro-${term.id}`, kind: "production",
    prompt: term.en || term.simple, sub: "Escríbelo en español",
    answer: term.head, accept: [term.head, term.es],
    term, review: ab("term", term.id, "production"), cost: COST["type-in"],
    explain: term.simple, src: term.src,
  };
}

export function exListenTerm(term, seed) {
  const opts = seededShuffle(
    [term.head, ...distractorsFor(term, "head", 3, seed)], seed + "l"
  );
  return {
    type: "listen-pick", id: `lis-${term.id}`, kind: "listening",
    speak: term.head, prompt: "¿Qué palabra has oído?",
    options: opts, answer: opts.indexOf(term.head),
    term, review: ab("term", term.id, "listening"), cost: COST["listen-pick"],
    explain: term.en, src: term.src,
  };
}

export function exChunk(sentence) {
  return {
    type: "chunk", id: `chk-${sentence.id}`, kind: "comprehension",
    sentence, review: ab("sentence", sentence.id, "comprehension"), cost: COST.chunk,
    src: sentence.src,
  };
}

export function exOrder(sentence, seed) {
  const words = sentence.es.replace(/\s+/g, " ").trim().split(" ");
  if (words.length > 16) return exGapFromSentence(sentence, seed);
  return {
    type: "order", id: `ord-${sentence.id}`, kind: "production",
    sentence, words, shuffled: seededShuffle(words, seed + sentence.id),
    review: ab("sentence", sentence.id, "production"), cost: COST.order, src: sentence.src,
  };
}

export function exGapFromSentence(sentence, seed) {
  const cand = (sentence.chunks || []).filter(
    (c) => c.g && c.t.length > 4 && /^[a-záéíóúüñ]+$/i.test(c.t)
  );
  if (!cand.length) return exChunk(sentence);
  const target = pick(cand, 1, seed + sentence.id)[0];
  const pool = (C.termsByTopic.get(sentence.topic) || C.terms)
    .map((t) => t.head).filter((h) => h && !h.includes(" ") && nrm(h) !== nrm(target.t));
  const opts = seededShuffle([target.t, ...pick([...new Set(pool)], 3, seed + target.t)], seed + "x");
  return {
    type: "gap", id: `gap-${sentence.id}-${nrm(target.t)}`, kind: "comprehension",
    sentence, blank: target.t, options: opts, answer: opts.indexOf(target.t),
    review: ab("sentence", sentence.id, "comprehension"), cost: COST.gap,
    explain: target.g?.note || target.g?.en, src: sentence.src,
  };
}

export function exListenSentence(sentence) {
  return {
    type: "listen-type", id: `lst-${sentence.id}`, kind: "listening",
    sentence, speak: sentence.es,
    review: ab("sentence", sentence.id, "listening"), cost: COST["listen-type"], src: sentence.src,
  };
}

export function exQuestion(q) {
  return {
    type: "question", id: `q-${q.id}`, kind: "contextual", question: q,
    review: ab("question", q.id, "contextual"), cost: COST.question,
    src: q.src, origin: q.origin,
  };
}

export function exComprehension(item, seed) {
  // Show a real exam question and ask what it is about — no answer needed.
  const topics = C.topics.map((t) => t.title);
  const right = C.topics.find((t) => t.n === item.topic)?.title;
  if (!right) return null;
  const opts = seededShuffle(
    [right, ...pick(topics.filter((t) => t !== right), 3, seed + item.id)], seed + "c"
  );
  return {
    type: "comprehension", id: `cmp-${item.id}`, kind: "comprehension",
    item, prompt: item.q, sub: "¿De qué trata esta pregunta de examen?",
    options: opts, answer: opts.indexOf(right),
    review: ab("comprehension", item.id, "comprehension"), cost: COST.comprehension,
    src: "Pregunta real de examen (mazo Carnet.B)",
  };
}

export function exGrammarPair(g, seed) {
  const pool = (g.sentences || []).filter((s) => s);
  if (pool.length < 1) return null;
  const s = pick(pool, 1, seed + g.id)[0];
  const marker = (g.markers || []).find((m) => nrm(s.es).includes(nrm(m))) || g.markers?.[0];
  return {
    type: "grammar-pair", id: `gr-${g.id}-${s.id}`, kind: "comprehension",
    grammar: g, sentence: s, marker,
    review: ab("grammar", g.id, "comprehension"), cost: COST["grammar-pair"],
    src: s.src,
  };
}

/* ------------------------------------------------------- card state helpers */

export async function cardsFor(itemType, ids, ability) {
  const rows = await db.reviews.bulkGet(ids.map((id) => reviewKey(itemType, id, ability)));
  const m = new Map();
  ids.forEach((id, i) => m.set(id, rows[i] || null));
  return m;
}

/** Terms ready to be introduced or reviewed in a topic. */
export async function topicState(n) {
  const terms = termsOf(n);
  const cards = await cardsFor("term", terms.map((t) => t.id), "recognition");
  const comp = await cardsFor("term", terms.map((t) => t.id), "comprehension");
  let mastered = 0, learning = 0, fresh = 0;
  for (const t of terms) {
    const c = cards.get(t.id);
    const m = maturity(c);
    if (m === "new") fresh++;
    else if (m === "mastered" && maturity(comp.get(t.id)) !== "new") mastered++;
    else learning++;
  }
  const qs = officialOf(n);
  const qc = await cardsFor("question", qs.map((q) => q.id), "contextual");
  const qSeen = qs.filter((q) => qc.get(q.id)).length;
  const total = terms.length || 1;
  return {
    n, terms: terms.length, mastered, learning, fresh,
    progress: Math.round(((mastered + learning * 0.4) / total) * 100),
    official: qs.length, officialSeen: qSeen,
  };
}

export async function allTopicStates() {
  return Promise.all(C.topics.map((t) => topicState(t.n)));
}

/** A topic unlocks when the previous one is 60% complete. */
export function unlockedUpTo(states) {
  let last = 0;
  for (const s of states) {
    if (s.progress >= 60) last = s.n;
    else break;
  }
  return Math.min(C.topics.length, last + 1);
}

/* --------------------------------------------------------------- builders */

/** A topic lesson: introduces a few terms and recycles them into real material. */
export async function buildLesson(n, seedBase = "") {
  const st = await topicState(n);
  const seed = `${n}-${seedBase || st.mastered + "-" + st.learning}`;
  const terms = termsOf(n);
  if (!terms.length) return [];

  const recog = await cardsFor("term", terms.map((t) => t.id), "recognition");
  const comp = await cardsFor("term", terms.map((t) => t.id), "comprehension");
  const now = Date.now();

  const due = terms.filter((t) => {
    const c = recog.get(t.id);
    return c && c.due <= now;
  });
  const unseen = terms.filter((t) => !recog.get(t.id))
    .sort((a, b) => a.difficulty - b.difficulty || b.freqQ - a.freqQ);

  const targets = [...pick(due, 2, seed), ...unseen.slice(0, 3)].slice(0, 4);
  if (!targets.length) targets.push(...pick(terms, 3, seed));

  const ex = [];
  for (const t of targets) {
    const isNew = !recog.get(t.id);
    if (isNew) ex.push(exTermIntro(t));
    ex.push(exRecognition(t, seed));
    if (t.simple && !isNew) ex.push(exSimpleGloss(t, seed));
    const sents = C.sentencesByTerm.get(t.id) || [];
    if (sents.length) {
      const s = pick(sents, 1, seed + t.id)[0];
      ex.push(exChunk(s));
      ex.push(exGapFromSentence(s, seed));
    }
    const cm = maturity(comp.get(t.id));
    if (!isNew && cm !== "new" && canListen()) ex.push(exListenTerm(t, seed));
    if (cm === "strong" || cm === "mastered") ex.push(exProduction(t));
  }

  // one grammar structure present in this topic
  const g = C.grammar.find((x) => (x.sentences || []).some((s) => s.topic === n));
  if (g) {
    const gp = exGrammarPair(g, seed);
    if (gp) ex.push(gp);
  }

  // real exam language, then a real exam question
  const comps = (C.comprehension || []).filter((c) => c.topic === n);
  if (comps.length) {
    const c = exComprehension(pick(comps, 1, seed)[0], seed);
    if (c) ex.push(c);
  }
  const off = officialOf(n);
  const qcards = await cardsFor("question", off.map((q) => q.id), "contextual");
  const unseenQ = off.filter((q) => !qcards.get(q.id));
  const dueQ = off.filter((q) => { const c = qcards.get(q.id); return c && c.due <= now; });
  for (const q of [...pick(dueQ, 1, seed), ...pick(unseenQ, 2, seed)].slice(0, 2)) {
    ex.push(exQuestion(q));
  }
  if (ex.length < 6) {
    for (const q of pick(practiceOf(n), 3, seed)) ex.push(exQuestion(q));
  }
  return ex.filter(Boolean);
}

/** The daily session: reviews first, weakness second, theory third, new last. */
export async function buildDaily(minutes) {
  const budget = minutes * 60;
  const seed = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const out = [];
  let spent = 0;
  const addedIds = new Set();
  const add = (e) => {
    if (!e || addedIds.has(e.id) || spent + e.cost > budget) return false;
    addedIds.add(e.id);
    out.push(e);
    spent += e.cost;
    return true;
  };

  const dueRows = await db.reviews.where("due").belowOrEqual(now).sortBy("due");

  // 1. due reviews (40%)
  const reviewBudget = budget * 0.4;
  for (const r of dueRows) {
    if (spent > reviewBudget) break;
    const item = C.byId.get(r.itemId);
    if (!item) continue;
    add(exFor(item, r.itemType, r.ability, seed));
  }

  // 2. leeches and the error classes that hurt last week (20%)
  const weakBudget = budget * 0.6;
  const leeches = await db.reviews.where("lapses").above(2).limit(40).toArray();
  for (const r of seededShuffle(leeches, seed)) {
    if (spent > weakBudget) break;
    const item = C.byId.get(r.itemId);
    if (!item) continue;
    add(exFor(item, r.itemType, r.ability, seed + "w"));
  }
  const recent = await db.attempts.orderBy("ts").reverse().limit(60).toArray();
  const badGrammar = new Set(recent.filter((a) => a.errorClass === "language.grammar").map((a) => a.grammarId).filter(Boolean));
  for (const gid of badGrammar) {
    const g = C.grammar.find((x) => x.id === gid);
    if (g) add(exGrammarPair(g, seed));
  }

  // 3. official theory, weighted to weak topics (25%)
  const theoryBudget = budget * 0.85;
  const states = await allTopicStates();
  const weakTopics = [...states].sort((a, b) => a.progress - b.progress).slice(0, 6);
  for (const st of weakTopics) {
    if (spent > theoryBudget) break;
    const off = officialOf(st.n);
    if (!off.length) continue;
    const cards = await cardsFor("question", off.map((q) => q.id), "contextual");
    const fresh = off.filter((q) => !cards.get(q.id));
    for (const q of pick(fresh.length ? fresh : off, 2, seed + st.n)) {
      if (!add(exQuestion(q))) break;
    }
  }

  // 4. new material, only if the backlog is under control
  const settings = await getSettings();
  if (dueRows.length < 40) {
    const unlocked = unlockedUpTo(states);
    let introduced = 0;
    for (const st of states) {
      if (st.n > unlocked || introduced >= settings.newPerDay) break;
      const terms = termsOf(st.n);
      const cards = await cardsFor("term", terms.map((t) => t.id), "recognition");
      const unseen = terms.filter((t) => !cards.get(t.id))
        .sort((a, b) => a.difficulty - b.difficulty || b.freqQ - a.freqQ);
      for (const t of unseen.slice(0, 3)) {
        if (introduced >= settings.newPerDay) break;
        if (!add(exTermIntro(t))) break;
        add(exRecognition(t, seed));
        const sents = C.sentencesByTerm.get(t.id) || [];
        if (sents.length) add(exGapFromSentence(pick(sents, 1, seed + t.id)[0], seed));
        introduced++;
      }
    }
  }

  // top up with practice if the budget is still open
  if (spent < budget * 0.75) {
    for (const st of weakTopics) {
      for (const q of pick(practiceOf(st.n), 3, seed + "p")) {
        if (!add(exQuestion(q))) break;
      }
      if (spent >= budget * 0.95) break;
    }
  }
  return { exercises: out, seconds: spent, dueTotal: dueRows.length };
}

/** Rebuild the right exercise for a due review row. */
export function exFor(item, itemType, ability, seed) {
  if (itemType === "term") {
    if (ability === "recognition") return exRecognition(item, seed);
    if (ability === "comprehension") return item.simple ? exSimpleGloss(item, seed) : exRecognition(item, seed);
    if (ability === "production") return exProduction(item);
    if (ability === "listening") {
      return canListen() ? exListenTerm(item, seed) : exRecognition(item, seed);
    }
    const qs = C.questionsByTerm.get(item.id) || [];
    return qs.length ? exQuestion(pick(qs, 1, seed + item.id)[0]) : exRecognition(item, seed);
  }
  if (itemType === "sentence") {
    if (ability === "listening") {
      return canListen() ? exListenSentence(item) : exGapFromSentence(item, seed);
    }
    if (ability === "production") return exOrder(item, seed);
    return exGapFromSentence(item, seed);
  }
  if (itemType === "question") return exQuestion(item);
  if (itemType === "grammar") return exGrammarPair(item, seed);
  if (itemType === "comprehension") return exComprehension(item, seed);
  return null;
}

/* ------------------------------------------------------------------ exam */

/** Topic weights taken from the DGT's own N-240 categorisation. */
const EXAM_WEIGHTS = [
  [[1, 2, 4, 9, 11, 12, 13, 18], 0.45], // reglamentación
  [[8], 0.15],                          // señales
  [[3, 5, 14, 16, 17], 0.30],           // seguridad vial
  [[6, 7, 10, 15], 0.10],               // vehículo / varios
];

export function buildExam(seed = String(Date.now())) {
  const total = C.meta?.exam?.questions || 30;
  const out = [];
  const used = new Set();
  for (const [topics, w] of EXAM_WEIGHTS) {
    const want = Math.round(total * w);
    const pool = C.questions.filter(
      (q) => q.origin === "official" && topics.includes(q.topic) && !used.has(q.id)
    );
    for (const q of pick(pool, want, seed + topics.join())) {
      used.add(q.id);
      out.push(q);
    }
  }
  if (out.length < total) {
    const rest = C.questions.filter((q) => q.origin === "official" && !used.has(q.id));
    for (const q of pick(rest, total - out.length, seed + "fill")) {
      used.add(q.id);
      out.push(q);
    }
  }
  return seededShuffle(out, seed).slice(0, total);
}
