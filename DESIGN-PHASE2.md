# Phase 2 — Learning System Design

Built on the real content measured in `ANALYSIS-PHASE1.md`. Every design choice
below points at a specific finding from that analysis.

---

## 1. The core idea

Your actual problem is not that you don't know the rules. It is that you cannot
read a DGT question fast enough to know which rule it is asking about.

The analysis makes that concrete: **39% of all exam sentences hang on just three
grammatical structures** (*debe*, *puede*, subjunctive after *que*), and the
single most common way an answer flips from right to wrong is the exception
marker **salvo / excepto**. That is a small, closed, learnable system.

So the app is built around one mechanism that Anki does not have:

> **Every wrong answer is classified as either a *Spanish* failure or a *theory*
> failure, and the two are remediated differently.**

Get a question wrong because you didn't know the 1.5 m rule → you get the rule
again, in a new context. Get it wrong because you read *salvo* as "only" → you
get a *salvo* sentence drill, and the driving question is deferred, not repeated.

---

## 2. Content model

### 2.1 Entities

```
Topic        18 DGT themes (Lectura Fácil) + 5 frases blocks as cross-tags
Lesson       ordered unit inside a Topic; ~6–10 exercises; 3–5 min
Term         vocabulary item (es, en, es_simple, pos, topic, difficulty, confusables)
Sentence     a Spanish sentence + chunked gloss + source citation
Question     stem + options + answer + explanation + origin + source + image
Grammar      one of the 19 measured structures, with drill templates
Review       FSRS state — one row per (item, ability)
Attempt      every answer ever given, with error classification
```

### 2.2 How the sources map onto them

| Entity | Fed by |
|--------|--------|
| Topic | 18 Lectura Fácil temas (verified page ranges) |
| Term | 297 your words + 27 DGT definitions + 83 glossary + 64 acronyms + frequency list |
| Sentence | 222 frases + ~4,800 manual sentences + 2,945 real question stems |
| Question | 797 official DGT + 50 N-240 + ~1,000 generated-and-cited |
| Grammar | the 19 structures with measured frequency |

### 2.3 Provenance is mandatory

Every single item carries `source: { doc, page|issue, kind }` and an `origin`:

- `official` — DGT revista / N-240. Verified answer. Badge: **Oficial DGT**
- `manual` — stated verbatim in a DGT manual. Badge: **Manual DGT p.NNN**
- `practice` — generated from a cited manual sentence. Badge: **Práctica**
- `comprehension` — real exam wording, answer unknown. Never scored as theory.

The exam simulator draws **only** from `official`. This is a hard rule in code,
not a convention.

---

## 3. The five abilities

A word is not "known" because you recognised its translation. Each `Term` and
each `Sentence` carries **five independent FSRS schedules**:

| # | Ability | Exercise that trains it | Passing it means |
|---|---------|------------------------|------------------|
| 1 | `recognition` | ES → EN multiple choice | you've seen the word |
| 2 | `comprehension` | ES word in a real DGT sentence → pick meaning | you get it in context |
| 3 | `production` | EN → type the Spanish | you can retrieve it |
| 4 | `listening` | spoken (es-ES) → pick / type | you hear it |
| 5 | `contextual` | appears inside a real exam question you answer right | it works under exam pressure |

A term reaches **Mastered** only when all five are stable ≥ 21 days. The
dashboard reports mastery this way, not as "cards reviewed".

Abilities unlock progressively — `production` and `listening` only open once
`recognition` is stable, so early sessions stay easy.

---

## 4. Spaced repetition — FSRS

**FSRS-5**, implemented locally (~150 lines, no dependency). Per review row:

```js
{ itemId, itemType, ability, stability, difficulty, reps, lapses,
  lastReview, due, state, history[] }
```

Grades are 1–4 (Again / Hard / Good / Easy), derived from correctness + response
time + hint usage, so you never have to self-rate — this is the thing you said
you no longer want to manage by hand.

**Scheduling priority** when building a session:

1. Overdue `official` questions you got wrong twice → highest
2. Terms with ≥ 3 lapses on any ability (your genuine leeches)
3. Grammar structures with a recent error
4. Normal due reviews, oldest due first
5. New material — **capped**, and only if the backlog is under control

Reviewing beats introducing. If you have 40 items due, you get no new words that
day.

### Interleaving rule

A term is never reviewed twice in the same session in the same ability, and the
generator actively prefers to meet a term in a *new* sentence or a *new*
question rather than the one you first learned it in. This is what "recycled in
new contexts" means in practice, and the data supports it: 153 of your 297 words
appear in the real exam corpus, so there is almost always a fresh context
available.

---

## 5. The error classifier

This runs on every wrong answer. It is deterministic — no AI.

**Inputs:** which option you picked, the diff between the correct and chosen
option, which terms/grammar the stem contains, your current FSRS state for
those, response time, and whether you opened a hint.

**Rules, in order:**

| Signal | Classification | Remediation |
|--------|---------------|-------------|
| Stem contains a grammar structure you have a weak/lapsed schedule for (esp. *salvo, excepto, aunque, siempre que, a menos que, en ningún caso*) | `language.grammar` | inject a targeted sentence drill on that structure; defer the question 3 days |
| Stem or correct option contains a term whose `comprehension` is weak/unseen | `language.vocab` | inject that term's comprehension + listening exercise; defer the question |
| Chosen option differs from correct only by a **number** (speeds, distances, kg, metres) | `theory.number` | numeric recall drill from the 222 frases |
| Chosen option differs only by a **polarity/modal** word (*permitido/prohibido/obligatorio*, *debe/puede*) | `language.modal` | the confusion-set drill (measured: 138/111/103 occurrences — a real set) |
| Response time < 3 s and the term/grammar states are all strong | `careless` | re-ask later in the session, no FSRS penalty |
| None of the above, term + grammar states strong | `theory.rule` | show the rule from the manual with page cite; reschedule the *rule*, test it with a **different** question |

Every attempt is stored with its classification, so the dashboard can tell you
the one number that matters: **"this week, 62% of your mistakes were Spanish,
not driving."** That tells you what to study.

After the exam simulator, the same classifier runs over the whole paper and
produces that split for the session.

---

## 6. Lesson composition

A lesson is generated, not authored. Given a Topic and a time budget:

```
pick 2–4 target Terms from this Topic (due or new, frequency-ranked)
pick 1 target Grammar structure present in this Topic's sentences
then build the exercise chain:

  1. Term introduction        es + DGT's own simple-Spanish definition
  2. Recognition MCQ          distractors = same-topic terms, confusables first
  3. Sentence chunking        real manual sentence containing the term,
                              broken into Los conductores | deben | respetar | …
  4. Gap-fill                 same sentence, target term removed
  5. Grammar drill            two sentences differing only by salvo/siempre que
  6. Listening                es-ES SpeechSynthesis, replay + 0.7× speed
  7. Comprehension            a real carnetb exam stem using the term →
                              "what is this question asking?"
  8. Official question        a real DGT question from this Topic
  9. Mistake replay           anything missed above, re-asked differently
```

Steps 1–4 use the *same* sentence so the word is learned in place; steps 7–8 use
*different* material so it transfers. Hints and the English gloss fade
automatically as `comprehension` stability rises — at stability > 14 days the
English is hidden by default and you have to tap to reveal.

---

## 7. Exercise types

**Vocabulary:** ES→EN · EN→ES · MCQ · matching pairs · type-the-translation ·
gap-fill in a real sentence · confusable discrimination · listening recognition

**Sentence:** translate · pick the meaning · word-order reconstruction ·
gap-fill · identify the key expression · listen-and-rebuild · explain in simple
Spanish (self-graded against the DGT definition)

**Theory:** official MCQ · sign recognition · scenario-with-photo · true/false
from a cited manual sentence · number recall · exception-spotting ("which part
of this sentence changes the answer?")

**Listening:** all of the above with `es-ES` speech, replay, and a slow mode.

---

## 8. Daily session generator

You pick 5 / 10 / 15 / 30 minutes. The generator uses measured per-exercise
median durations (seeded, then learned from you) and fills the budget:

```
40%  reviews due today            (never skipped)
20%  weak-item remediation        (leeches + last session's error classes)
25%  official theory questions    (weighted to your weakest Topics)
15%  new material                 (0% if reviews are backlogged)
```

If you have missed days, the generator does **not** dump the whole backlog on
you — it takes the most overdue slice that fits, and tells you how many remain.

---

## 9. Exam simulator

Modelled on the real thing, as stated in the N-240 supplement itself:
**30 questions, pass with at most 3 wrong.**

- Drawn only from the 797 + 50 `official` pool, topic-weighted like the real exam
  (Reglamentación ≈ 45%, Señales ≈ 15%, Seguridad Vial ≈ 30%, Motos/Novedades ≈ 10%,
  from the DGT's own N-240 categorisation)
- Timed, no hints, no translations, no dictionary — exam conditions
- Afterwards: score, per-question explanation with manual citation, weak-topic
  chart, and the **Spanish-vs-theory split** of your mistakes
- Every missed question is fed back into FSRS as a lapse on its Topic *and* on
  its terms/grammar

**Rule-currency guard:** before any pre-2023 question enters the pool it is
checked against a keyword list of known-changed rules (V-16 vs triángulos, the
+20 km/h overtaking margin, minors' alcohol limit, VMP rules). Matches are
quarantined for manual review rather than silently asked.

---

## 10. Gamification

XP per exercise (weighted by ability difficulty, not by volume) · daily streak
with one free "freeze" per week · levels · a visual path of 18 topic nodes that
fill as mastery rises · achievements tied to *real* milestones
("*Salvo* — 20 exception sentences right in a row", "First mock exam passed",
"All 73 Vehículo Seguro facts stable") · weekly stats · optional hearts (off by
default — mistakes are the point).

No Duolingo assets or branding. Original icon set, system font stack, light/dark
via `prefers-color-scheme` with a manual override.

---

## 11. Technical shape

### Stack — deliberately minimal

- **Plain ES modules. No bundler, no npm install, no build step.**
- **Preact + htm**, vendored locally (~16 KB total), for components — gives a
  real component model without a toolchain
- **Dexie.js**, vendored locally, for IndexedDB
- **FSRS-5** implemented in-repo
- CSS custom properties, container queries, mobile-first

Rationale: you want to push to GitHub, flip on Pages, and use it. A no-build
static site does that, keeps working in three years with zero toolchain rot, and
has no CDN dependency to break offline. Nothing in this app needs more.

### Layout

```
index.html
app/
  main.js  router.js  ui/  features/  lib/fsrs.js  lib/db.js  lib/speech.js
  vendor/preact.js  vendor/htm.js  vendor/dexie.js
  data/            content JSON, generated by tools/, committed
media/             recompressed WebP images
sw.js  manifest.webmanifest
tools/             the Phase 1 extractors + a content build step
```

### Dexie schema (v1)

```
topics      ++id, slug, tema
terms       ++id, es, topic, difficulty, *tags
sentences   ++id, topic, *termIds, source
questions   ++id, topic, origin, *termIds, *grammarIds
grammar     ++id, key
reviews     ++id, [itemType+itemId+ability], due, state, lapses
attempts    ++id, itemId, ts, correct, errorClass
sessions    ++id, date, seconds, xp
settings    key
```

Content JSON ships with the app and is loaded into Dexie on first run with a
`contentVersion` stamp; later content updates merge **without touching** your
`reviews`/`attempts`/`sessions`. Schema migrations are explicit Dexie versions.

### Images

789 DGT photos recompressed to WebP ~800 px → target **under 12 MB** total,
committed and precached. The 2,945 carnetb photos are **not** all shipped: a
frequency-selected subset (~600, covering every distinct sign and scenario type)
is recompressed and committed; the rest stay available in `build/` for later.

### Backup

- **Full JSON export / import**, always available, no account, no network —
  schema-versioned, validated on import, with duplicate detection and a
  dry-run diff before it writes
- Automatic local snapshot kept in IndexedDB before every import
- **Optional** GitHub backup to a *private* repo via a PAT you paste yourself,
  stored only in IndexedDB, never in source, with the security implications
  spelled out in the UI and a one-tap revoke. Local export works regardless.

### PWA

Service worker precaches app shell + content JSON + images; stale-while-
revalidate for everything else. Full offline: lessons, quizzes, FSRS, progress,
exam simulator. Speech synthesis is a browser API and works offline on most
devices. A storage-quota check warns before the image cache is at risk.

### No AI at runtime

The app ships with everything precomputed: vocabulary, definitions, sentences,
chunked glosses, questions, distractors, explanations, drills. There is no API
key, no network call, nothing to pay for. I do not recommend adding an AI
provider — the only thing it would buy is free-text answer grading, and the
self-graded "explain it in simple Spanish" step covers that well enough.

---

## 12. Dashboard

Terms: total / mastered (all 5 abilities) / learning / due today ·
per-ability mastery bars · sentence comprehension level · listening level ·
theory coverage per Topic · mock-exam pass rate and trend ·
**mistake split: Spanish vs theory** · your 5 weakest topics · 5 worst leeches ·
streak · time studied · and one honest readiness estimate:
*"you would currently score ~24/30 — the exam needs 27."*

---

## 13. Build order

1. Content pipeline → `app/data/*.json`, images recompressed, rule-currency pass
2. Dexie + FSRS + seeding + export/import *(backup before there is data to lose)*
3. Shell, router, theming, dashboard skeleton
4. Vocabulary + sentence exercises
5. Question engine + error classifier
6. Daily session generator + learning path
7. Listening
8. Exam simulator
9. Gamification + stats
10. PWA + GitHub Pages deploy
11. Test pass: every exercise type, scheduling, persistence across reload,
    backup round-trip, mobile layout, offline, no-AI
