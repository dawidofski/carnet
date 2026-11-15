# 🚦 Mi Carnet

A personal learning game for passing the Spanish **DGT Permiso B** theory exam
*while actually learning Spanish* — built around real DGT material.

No build step. No npm. No bundler. No backend. No API keys. Push it to GitHub,
switch on Pages, open the URL, start learning.

---

## Put it online (5 minutes)

1. Create a new **empty** repository on GitHub.
2. In this folder:

```bash
git init -b main && git add . && git commit -m "Mi Carnet"
```

3. Connect it and push (replace with your own repo):

```bash
git remote add origin https://github.com/YOUR-USER/mi-carnet.git && git push -u origin main
```

4. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save**.
5. Wait about a minute, then open `https://YOUR-USER.github.io/mi-carnet/`.

On your phone, use *Add to Home Screen*. After the first load it works fully offline.

> `.gitignore` deliberately excludes the source PDFs. `carnetb.pdf` is 138 MB and
> GitHub rejects any file over 100 MB — the push would fail. The app does not need
> them; everything has already been extracted into `app/data/`.

### Running it locally

```bash
python -m http.server 8123
```

Then open `http://localhost:8123`. It must be served over http — opening
`index.html` as a `file://` URL will not work, because the app uses ES modules.

---

## What is inside

| | |
|---|---|
| **324** vocabulary entries | your own 297-word list, corrected, plus DGT's own definitions |
| **222** exam-fact sentences | every word tappable for its meaning |
| **791** official DGT questions | scraped from `revista.dgt.es`, with verified answers and photos (6 more are quarantined as out of date) |
| **508** practice questions | generated from the manuals, each citing its source |
| **2,927** real exam questions | authentic wording, used for comprehension training |
| **610** dictionary entries | powers tap-any-word translation everywhere |
| **13** grammar structures | ranked by how often they actually appear |
| **18** topics | the official DGT *Lectura Fácil* syllabus |

Every item carries its source. Questions are labelled **Oficial DGT**,
**Práctica** or **Comprensión**, and the exam simulator draws **only** from the
official pool — enforced in code, not by convention.

The official questions span 2014–2026, and Spanish law changed in May 2021,
March 2022 and January 2026. `tools/rule_currency.py` flags every question that
touches a changed rule; each one is then judged by hand and the verdict recorded
in `tools/rule_verdicts.json`. Anything that would teach a dead rule is
quarantined at load time and can never reach a lesson or the exam.

---

## The idea

You don't fail the Spanish theory exam because you don't know the rules. You fail
because you can't read the question fast enough to know *which* rule it's asking
about.

Measured across 6,358 real exam sentences: **39% depend on just three grammar
structures** — *debe*, *puede*, and the subjunctive after *que*. And the most
common way an answer flips from right to wrong is the exception marker
**salvo / excepto**.

So the app does something Anki can't:

> **Every wrong answer is classified as a *Spanish* failure or a *theory* failure,
> and the two are fixed differently.**

Misread *salvo*? You get a *salvo* drill, and the driving question comes back
later. Didn't know the 1.5 m rule? You get the rule, then a *different* question
testing the same thing.

The dashboard tells you the one number that matters:
*"62% of your mistakes this week were Spanish, not driving."*

### Five abilities per word

A word is not "known" because you recognised a translation. Each term carries
five independent FSRS schedules — **recognise, understand in context, produce,
hear, use under exam pressure** — and only counts as mastered when all five are
stable for 21 days.

---

## Layout

```
index.html              shell + import map (no bundler)
app/
  main.js               bootstrap, router
  style.css             design system, light + dark
  lib/
    fsrs.js             FSRS-5, implemented here, no dependency
    db.js               Dexie schema, seeding, export/import
    content.js          in-memory indexes, tap-to-translate lookup
    session.js          exercise builders, daily planner, exam builder
    classify.js         the Spanish-vs-theory error classifier
    speech.js           es-ES text to speech
  ui/                   path, player, home, vocab, stats, exam, settings
  data/                 generated content (committed)
  vendor/               Preact, htm, Dexie — vendored, no CDN
media/dgt/              789 official question photos (WebP, 6 MB)
tools/                  the extraction and build pipeline
sw.js                   offline service worker
```

## Rebuilding the content

Only needed if you change the sources or the authoring files in `tools/`.
Requires the original PDFs in this folder.

```bash
python -I tools/build_content.py
```

Bump `VERSION` in `sw.js` when you deploy changes, so browsers pick them up.

---

## Your data

Everything lives in **IndexedDB in your browser**. Nothing is uploaded; there is
no account and no server.

That also means: clearing site data, using a private window, or switching phones
loses it. **Settings → Download a copy** gives you a JSON backup, and restoring
shows you a diff before it writes anything, keeps a snapshot, and can be undone.

---

## Sources

- **Manual del Permiso B en Lectura Fácil** — DGT, 2023 (the syllabus spine)
- **Manual II, Cuestiones de Seguridad Vial** — DGT, 2025 (glossary and depth)
- **Revista Tráfico y Seguridad Vial, tests** — DGT, issues 224–279 (the official questions)
- **Resumen DGT Permiso B, 222 frases** — practicatest.com, 2026 edition
- Personal vocabulary list and an Anki deck of real exam wording

`EXAMEN-TEORICO-POWER-POINT-1.pdf` was **excluded**: it is Argentinian
(*colectivo*, *patente*, *contramano*), its rules differ from Spanish law, and it
has no answer key. See `ANALYSIS-PHASE1.md` §7.

Not affiliated with or endorsed by the DGT. Official questions are reproduced
from DGT's own freely published tests for personal study.
