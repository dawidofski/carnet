import { C, nrm } from "./content.js";
import { db, reviewKey } from "./db.js";
import { maturity } from "./fsrs.js";

/* Markers measured as high-frequency in the real exam corpus.
   These are the words that flip an answer. */
export const EXCEPTION_MARKERS = [
  "salvo", "excepto", "a menos que", "salvo que", "a excepción", "sin perjuicio",
];
export const CONCESSIVE_MARKERS = ["aunque", "aun cuando", "si bien"];
export const CONDITION_MARKERS = ["siempre que", "siempre y cuando", "cuando", "si "];
export const ABSOLUTE_MARKERS = [
  "en ningún caso", "nunca", "jamás", "siempre", "en todo caso", "ninguna", "ningún",
];
export const LIMIT_MARKERS = ["al menos", "como mínimo", "como máximo", "no menos de", "no más de"];
export const MODAL_SETS = [
  ["permitido", "prohibido", "obligatorio", "voluntario"],
  ["debe", "puede", "no debe", "no puede"],
  ["obligatoria", "aconsejada", "recomendada"],
];

const NUM = /\d+(?:[.,]\d+)?/g;

export const CLASSES = {
  "language.grammar":  { label: "Gramática española", lang: true,  tip: "Una palabra de excepción o condición cambió el sentido." },
  "language.vocab":    { label: "Vocabulario español", lang: true, tip: "No conocías una palabra clave de la pregunta." },
  "language.modal":    { label: "Permitido / prohibido / obligatorio", lang: true, tip: "Confundiste el tipo de obligación." },
  "language.absolute": { label: "Palabra absoluta", lang: true,    tip: "«nunca», «siempre», «en ningún caso» — revisa si de verdad no hay excepciones." },
  "theory.number":     { label: "Cifra de la norma", lang: false,  tip: "La regla es correcta, pero fallaste el número." },
  "theory.rule":       { label: "Conocimiento de la norma", lang: false, tip: "Hay que repasar la norma en sí." },
  careless:            { label: "Despiste", lang: false,          tip: "Fuiste demasiado rápido. Esta no cuenta como fallo." },
};

const has = (text, markers) => markers.find((m) => nrm(text).includes(nrm(m)));

function numbersIn(s) {
  return (String(s).match(NUM) || []).join("|");
}

/** Which terms in the question are weak for this learner. */
async function weakTerms(question) {
  const ids = (C.questionsByTerm.get(question.id) ? [] : []);
  const blob = nrm(question.q + " " + (question.options || []).join(" "));
  const candidates = C.terms.filter(
    (t) => t.head && t.head.length > 4 && blob.includes(nrm(t.head))
  );
  if (!candidates.length) return [];
  const keys = candidates.map((t) => reviewKey("term", t.id, "comprehension"));
  const rows = await db.reviews.bulkGet(keys);
  const weak = [];
  candidates.forEach((t, i) => {
    const card = rows[i];
    if (card) {
      // started but not holding: a genuine comprehension gap
      const m = maturity(card);
      if (m === "learning" || (card.lapses || 0) >= 2) weak.push(t);
      return;
    }
    // never studied: only count it against the learner if the word is
    // genuinely hard, otherwise every early mistake looks like a Spanish
    // failure and the split becomes meaningless.
    if (t.difficulty >= 4) weak.push(t);
  });
  return weak;
}

/** Which grammar structures appear, and are they weak for this learner. */
async function weakGrammar(question) {
  const text = question.q + " " + (question.options || []).join(" ");
  const hits = C.grammar.filter((g) => (g.markers || []).some((m) => nrm(text).includes(nrm(m))));
  if (!hits.length) return [];
  const rows = await db.reviews.bulkGet(hits.map((g) => reviewKey("grammar", g.id, "comprehension")));
  return hits.filter((g, i) => {
    const m = maturity(rows[i]);
    return m === "new" || m === "learning" || (rows[i]?.lapses || 0) >= 1;
  });
}

/**
 * Decide why an answer was wrong.
 * Returns { cls, lang, label, tip, terms, grammar, remediation }
 */
export async function classifyError({ question, chosenIndex, ms, hinted }) {
  const correct = question.options[question.answer] || "";
  const chosen = question.options[chosenIndex] ?? "";
  const stem = question.q || "";
  const both = stem + " " + correct + " " + chosen;

  const wTerms = await weakTerms(question);
  const wGram = await weakGrammar(question);

  // Cold start: with almost no history every card looks weak, so only a
  // hard textual signal (a marker, a modal pair, a number) may be called a
  // language failure. Everything else is treated as not-yet-known theory.
  const history = await db.reviews.count();
  const coldStart = history < 25;

  const result = (cls, extra = {}) => ({
    cls, ...CLASSES[cls], terms: wTerms, grammar: wGram, ...extra,
  });

  // 1. an exception / condition / concession marker the learner has not mastered
  const marker =
    has(stem, EXCEPTION_MARKERS) || has(both, EXCEPTION_MARKERS) ||
    has(both, CONCESSIVE_MARKERS) || has(stem, CONDITION_MARKERS);
  if (marker && wGram.length) {
    return result("language.grammar", { marker, remediation: "grammar" });
  }

  // 2. the two options differ only by a modal / polarity word
  for (const set of MODAL_SETS) {
    const inC = set.filter((w) => nrm(correct).includes(nrm(w)));
    const inX = set.filter((w) => nrm(chosen).includes(nrm(w)));
    if (inC.length && inX.length && nrm(inC[0]) !== nrm(inX[0])) {
      return result("language.modal", { pair: [inC[0], inX[0]], remediation: "modal" });
    }
  }

  // 3. the two options differ only by a number
  if (numbersIn(correct) && numbersIn(correct) !== numbersIn(chosen)) {
    const stripC = nrm(correct).replace(NUM, "#");
    const stripX = nrm(chosen).replace(NUM, "#");
    if (stripC === stripX) return result("theory.number", { remediation: "number" });
  }

  // 4. an absolute word in the option the learner picked
  const abs = has(chosen, ABSOLUTE_MARKERS) || has(correct, LIMIT_MARKERS);
  if (abs && !wTerms.length) {
    return result("language.absolute", { marker: abs, remediation: "grammar" });
  }

  // 5. a key word in the question is still weak
  if (wTerms.length && !coldStart) {
    return result("language.vocab", { remediation: "vocab" });
  }

  // 6. answered very fast with everything already strong → careless
  if (ms < 3500 && !hinted) {
    return result("careless", { remediation: "retry" });
  }

  return result("theory.rule", { remediation: "rule" });
}

/** Aggregate a set of attempts into the Spanish-vs-theory split. */
export function splitAttempts(attempts) {
  let lang = 0, theory = 0, careless = 0;
  const byClass = new Map();
  for (const a of attempts) {
    if (a.correct) continue;
    const c = a.errorClass || "theory.rule";
    byClass.set(c, (byClass.get(c) || 0) + 1);
    if (c === "careless") careless++;
    else if (CLASSES[c]?.lang) lang++;
    else theory++;
  }
  const total = lang + theory + careless;
  return {
    lang, theory, careless, total,
    langPct: total ? Math.round((lang / total) * 100) : 0,
    theoryPct: total ? Math.round((theory / total) * 100) : 0,
    byClass: [...byClass.entries()].sort((a, b) => b[1] - a[1]),
  };
}
