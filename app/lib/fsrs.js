/* FSRS-5 — free spaced repetition scheduler.
   Implemented locally so the app has no dependencies and works offline.
   Reference: open FSRS algorithm, default parameter set.
   Grades: 1 Again, 2 Hard, 3 Good, 4 Easy. */

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

const W = [
  0.2172, 1.1771, 3.2602, 16.1507, 7.0114, 0.57, 2.0966, 0.0069, 1.5261,
  0.112, 1.0178, 1.849, 0.1133, 0.3127, 2.2934, 0.2191, 3.0004, 0.7536,
  0.3332, 0.1437, 0.2,
];
const DECAY = -0.5, FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
const MIN_D = 1, MAX_D = 10, MAX_IVL = 365 * 4;

const clampD = (d) => Math.min(Math.max(d, MIN_D), MAX_D);
const clampS = (s) => Math.max(0.01, s);

/** Retrievability of a card `elapsed` days after its last review. */
export function retrievability(stability, elapsed) {
  if (!stability || stability <= 0) return 0;
  return Math.pow(1 + FACTOR * (elapsed / stability), DECAY);
}

function initStability(g) {
  return clampS(W[g - 1]);
}
function initDifficulty(g) {
  return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
}
function nextDifficulty(d, g) {
  const delta = -W[6] * (g - 3);
  const dp = d + delta * ((10 - d) / 9);
  const d0 = initDifficulty(EASY);
  return clampD(W[7] * d0 + (1 - W[7]) * dp);
}
function nextStabilityRecall(d, s, r, g) {
  const hard = g === HARD ? W[15] : 1;
  const easy = g === EASY ? W[16] : 1;
  return clampS(
    s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
      (Math.exp((1 - r) * W[10]) - 1) * hard * easy)
  );
}
function nextStabilityForget(d, s, r) {
  const long = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) *
    Math.exp((1 - r) * W[14]);
  return clampS(Math.min(long, s / Math.exp(W[17] * W[18])));
}
function shortTermStability(s, g) {
  return clampS(s * Math.exp(W[17] * (g - 3 + W[18])));
}

/** Interval in days for a target retention (default 0.9). */
export function intervalFor(stability, retention = 0.9) {
  const ivl = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(Math.max(Math.round(ivl), 1), MAX_IVL);
}

export const DAY = 86400000;

/** A brand-new, never-studied card. */
export function newCard() {
  return {
    stability: 0, difficulty: 0, reps: 0, lapses: 0,
    state: "new", last: null, due: 0, elapsed: 0,
  };
}

/**
 * Apply a grade to a card and return the updated card.
 * `now` is a timestamp; `retention` lets the UI trade volume for accuracy.
 */
export function review(card, grade, now = Date.now(), retention = 0.9) {
  const c = { ...card };
  const elapsedDays = c.last ? Math.max(0, (now - c.last) / DAY) : 0;
  c.elapsed = elapsedDays;

  if (c.state === "new" || !c.stability) {
    c.difficulty = initDifficulty(grade);
    c.stability = initStability(grade);
    c.reps = 1;
    if (grade === AGAIN) {
      c.lapses = 0;
      c.state = "learning";
      c.due = now + 60000;           // 1 minute, same-session retry
    } else {
      c.state = grade === EASY ? "review" : "learning";
      c.due = now + intervalFor(c.stability, retention) * DAY;
    }
  } else {
    const r = retrievability(c.stability, elapsedDays);
    c.reps += 1;
    const d0 = c.difficulty || initDifficulty(GOOD);
    c.difficulty = nextDifficulty(d0, grade);
    if (elapsedDays < 1) {
      c.stability = shortTermStability(c.stability, grade);
    } else if (grade === AGAIN) {
      c.lapses += 1;
      c.stability = nextStabilityForget(c.difficulty, c.stability, r);
    } else {
      c.stability = nextStabilityRecall(c.difficulty, c.stability, r, grade);
    }
    if (grade === AGAIN) {
      c.state = "relearning";
      c.due = now + 10 * 60000;      // 10 minutes
    } else {
      c.state = "review";
      c.due = now + intervalFor(c.stability, retention) * DAY;
    }
  }
  c.last = now;
  return c;
}

/**
 * Turn a raw answer into a grade, so the learner never self-rates.
 *  correct   — did they get it right
 *  ms        — response time
 *  hinted    — did they reveal a hint / translation
 *  expectMs  — typical time for this exercise type
 */
export function gradeFrom(correct, ms, hinted, expectMs = 9000) {
  if (!correct) return AGAIN;
  if (hinted) return HARD;
  if (ms <= expectMs * 0.45) return EASY;
  if (ms >= expectMs * 1.8) return HARD;
  return GOOD;
}

/** Days until due (negative = overdue). */
export function dueInDays(card, now = Date.now()) {
  if (!card || !card.due) return -1;
  return (card.due - now) / DAY;
}

/** Stability-based mastery label used throughout the UI. */
export function maturity(card) {
  if (!card || card.state === "new" || !card.stability) return "new";
  if (card.stability >= 21) return "mastered";
  if (card.stability >= 7) return "strong";
  return "learning";
}
