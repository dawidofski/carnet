# Phase 1 — Content Analysis of the Source Material

**Project:** Mi Carnet — personal Spanish + DGT Permiso B learning game
**Date:** 2026-11-15
**Status:** Analysis complete. No application code written yet.

Everything below is derived from the actual files. Every number is produced by a
script in `tools/`, and every extracted record is on disk in `build/data/`.
Nothing here is invented.

---

## 1. Source inventory and verdict

| # | File | Pages | What it actually is | Verdict |
|---|------|-------|---------------------|---------|
| 1 | `TeoricaAbreviada_LecturaFacil_2023-12_Interactivo.pdf` | 477 | **Official DGT** — *Manual del Permiso B en Lectura Fácil*, Dirección General de Tráfico, Ministerio del Interior. Adapted to UNE 153101:2018 "easy reading" by Asociación Lectura Fácil. | ★ **Primary spine** |
| 2 | `Resumen-dgt-permiso-b-en-222-frases.pdf` | 12 | practicatest.com, **Edición 2026**. 222 one-sentence exam facts in 5 blocks. Contains the 2026 rule changes. | ★ **Knowledge spine** |
| 3 | `carnetb.pdf` | 498 | An **Anki deck exported to PDF** (`studytools.oldlane17.com`). Real Spanish DGT exam question wording + the real scenario photograph. | ★ **Language + image corpus** (see §4) |
| 4 | `Manual-II-Cuestiones-de-Seguridad-Vial-2025.pdf` | 574 | **Official DGT**, Edición 2025, NIPO 128-25-001-6. Manual II of the nine-volume *Profesor de Formación Vial* course. | ✔ **Depth + glossary** |
| 5 | `N-240-SUP-ESP-TEST-WOP.pdf` | 8 | **Official DGT** — supplement to *Revista Tráfico y Seguridad Vial* nº 240. 50 questions, questions selected by the *Subdirección Adjunta de Conocimiento Vial (DGT)*, **with answer key**. | ✔ **Official test** |
| 6 | `wordsheet.html` | — | Your own Google Sheets vocabulary list, 297 rows (Spanish → English). | ★ **Your personal weak-word list** |
| 7 | `EXAMEN-TEORICO-POWER-POINT-1.pdf` | 46 | ⚠️ **Argentinian, not Spanish.** Footer: `autoescuela-labella.com.ar`, Boedo 459, Lomas de Zamora (Buenos Aires). Uses *colectivo*, *patente*, *contramano*, *auto*. 218 questions, **no answer key**. | ✖ **Excluded** (see §7) |

### Extraction result

All six PDFs extracted cleanly as UTF-8 via `pdftotext -layout -enc UTF-8`
(first pass silently produced cp1252 and would have corrupted every accented
character — fixed). ~2.5 MB of clean Spanish text.

---

## 2. Topic hierarchy

### 2.1 The learning path spine — DGT *Lectura Fácil* manual (source 1)

This is the official DGT syllabus, already written in simplified Spanish. It
becomes the skill tree 1:1. Page ranges are verified, not guessed.

| Tema | Title | Pages | Size |
|------|-------|-------|------|
| 1 | Definiciones | 3–25 | 23 |
| 2 | Documentación | 26–41 | 16 |
| 3 | El estado del conductor | 42–73 | 32 |
| 4 | Obligaciones de conductores y peatones | 74–85 | 12 |
| 5 | Dispositivos de seguridad en el vehículo | 86–119 | 34 |
| 6 | Elementos del vehículo y normas para usarlos | 120–138 | 19 |
| 7 | Sistema de luces de los vehículos | 139–153 | 15 |
| 8 | Señales de circulación | 154–211 | **58** |
| 9 | La vía | 212–242 | 31 |
| 10 | Velocidad y distancias | 243–266 | 24 |
| 11 | Maniobras | 267–300 | 34 |
| 12 | Normas de preferencia para circular | 301–318 | 18 |
| 13 | Transportar personas y cargas | 319–340 | 22 |
| 14 | Conducir de forma segura | 341–364 | 24 |
| 15 | Mecánica y mantenimiento del vehículo | 365–387 | 23 |
| 16 | Accidentes de tráfico | 388–436 | **49** |
| 17 | Conducción preventiva y eficiente | 437–466 | 30 |
| — | Anexo: El permiso de conducir por puntos | 467–477 | 11 |

### 2.2 Cross-cutting blocks — 222 frases (source 2)

A second, orthogonal grouping that matches how the exam is actually built:

| Block | Count | Maps onto Temas |
|-------|-------|-----------------|
| Maniobras | 22 | 11, 12 |
| Normas básicas | 38 | 1, 2, 4 |
| Riesgos y auxilio | 32 | 3, 14, 16 |
| Vehículo seguro | 73 | 5, 6, 7, 13, 15 |
| Vías y señales | 57 | 8, 9, 10 |

### 2.3 Depth layer — Manual II (source 4), 23 themes

Accidentes de tráfico · Dinámica de un impacto · Grupos de riesgo · La velocidad ·
Alcohol y drogas · Enfermedad y fármacos · Sueño, fatiga y estrés · Seguridad
activa · Seguridad pasiva · La vía · Comprobaciones previas · Conducción segura ·
Circulación real · El frenado · Intersecciones · Curvas · El adelantamiento ·
Autopista y autovía · Conducción nocturna · Meteorología · Otros vehículos ·
Conducción eficiente · Medio ambiente.

This is instructor-level material — too deep to be a lesson, but it is the right
source for the *"why is this the answer"* explanation behind a question.

---

## 3. Vocabulary database

### 3.1 What was extracted

| Source | Records | File | What each record has |
|--------|---------|------|----------------------|
| Your wordsheet, linked to the manuals | **297** | `build/data/vocab_linked.json` | es, your en, theme, page, real example sentence, frequency in exam questions |
| DGT *Lectura Fácil* definition boxes | **27** | `build/data/defs_lecturafacil.json` | Spanish term + **DGT's own simple-Spanish definition**, tema + page |
| Manual II official glossary | **83** | `build/data/glosario_manual2.json` | Spanish term + formal DGT definition + page |
| Manual II acronyms (ABS, ESP, MMA, SRI, VMP…) | **64** | same file | expansion |
| Corpus frequency ranking | **400** | `build/data/freq_top.json` | token, count, which corpora |

Distinct word forms across the whole corpus: **4,918**.

### 3.2 Automatic linking — the important part

A linker (`tools/link_vocab.py`) stems each headword and searches the DGT
easy-read manual for a sentence containing it.

- **270 of your 297 words (90%)** were matched to a real sentence in the official
  DGT manual, with theme number and page number attached.
- **153 of your 297 words (52%)** actually occur in the real exam question corpus.

This means the app never has to invent an example sentence — every vocabulary
card can show a genuine DGT sentence and cite `Lectura Fácil p.NNN`.

### 3.3 The DGT's own simple-Spanish definitions

These are gold, because the DGT wrote them *for people who find Spanish hard*.
Examples, verbatim from the manual:

- **Eje** — *Barra que atraviesa un objeto y le ayuda a moverse y a girar.*
- **Cilindrada** — *Medida para calcular la potencia de un motor.*
- **Maniobra** — *Movimiento o acción que se hace al conducir un vehículo.*
- **Cañada** — *Camino creado para que pasen por él los animales.*
- **Raqueta** — *Desvío en forma de medio círculo en la carretera para cambiar de dirección.*
- **Punto muerto** — *Posición de la caja de cambios en la que el movimiento del motor no se transmite a las ruedas.*

Full list of 27 in `build/data/defs_lecturafacil.json`. One of them is a bad
extraction (`Distracciones` picked up the wrong body text at p.410) and
`Anexo puntos` is a false positive — both flagged for manual correction.

### 3.4 ⚠️ Errors found in your own wordsheet

You are currently studying from some incorrect translations. These need fixing
before they are loaded into the app. A representative set:

**Wrong English**

| Spanish | Your English | Correct |
|---------|--------------|---------|
| cuestas largas | long hiss | long **slopes / hills** |
| Travesías | Crossigs | **travesía** = stretch of an interurban road running through a built-up area |
| mediana | space between two lanes | **central reservation** separating the two carriageways |
| plataforma | roadway | **calzada + arcenes** together |
| rasante | slope | *cambio de rasante* = **crest / brow of a hill** |
| daños | injuries | **damage** (*lesiones* = injuries) |
| deslumbrar | blind | to **dazzle** |
| derrapar | drift | to **skid** |
| calzo | wheelpump | wheel **chock** |
| Catadióptrico | retro-reflective light | **reflector** — it emits no light |
| Señales de balizamiento | traffic signs | **delineation / beaconing** devices |
| placa | sign | **plate** (placa L, panel V-20) |
| adelantar | take over | to **overtake** |
| cebreado | zebra crossings | **hatched road marking** — *not* a pedestrian crossing |
| poblado | village or city | **built-up area** (legal term) |
| Homologado | certified | **type-approved** |
| raqueta | u-turn | **turnaround loop** (DGT: *desvío en forma de medio círculo*) |
| Luz de posición | parking light | **position / side light** |
| Aspa | Cross | **red X** over a lane — lane is closed |
| cuidar | pay attention | to **look after / take care of** |
| Pedal de embrague | clutch panel | clutch **pedal** |

**Misspelled Spanish** (these will never match the exam text):

`lanta` → **llanta** · `caldeza` → **calzada** · `badenas` → **badenes** ·
`alcacen` / `alcazan` → **alcancen / alcanzan** · `fondar de freno` → **pisar a fondo el freno** ·
`raje de piel` → **traje de piel** · `entorpezcar` → **entorpecer** ·
`acercartar` → **acercarse** · `Colócalar` → **colócala** · `ruedar` → **rodar** ·
`enciender` → **encender** · `calentarar` → **calentar** · `marcha atrá` → **marcha atrás**

**Systematic English slip:** you consistently write *lightning* for **lighting**
(`Sistemas de alumbrado`, `Circuito de iluminación`, `Activación automática de
alumbrado`) and *breaks* for **brakes** (`Los frenos`, `frenado brusco`, AEB).

**Still in Dutch:** `Zona de frenado de emergencia` → *vluchtstrook*;
`Apartadero` → *inham voor ongelukken*.

**Untranslated / wrong column:** `Titular del vehículo` has no English;
row 185 has *"Traction control"* in the **Spanish** column (should be
*Control de tracción*).

**Duplicates to merge:** reposacabezas ×2 · Conjunto de vehículos ×2 ·
permiso de circulación ×2 · caja de cambios ×2 · *Remolque agrícola* used twice,
once where the term should be **Máquina remolcada**.

---

## 4. Question bank — what exists, and the honest limits

### 4.1 Official DGT questions **with verified answers** — 797

Discovered and harvested from `revista.dgt.es`, the DGT's own magazine, whose
test questions are selected by the *Subdirección Adjunta de Conocimiento Vial*:

- **797 questions**, 57 monthly test pages, issues **224 → 279 (2014 → 2026)**
- Each has: question text, three options A/B/C, **the correct answer**, and the
  original photograph
- **789 of the 797 photographs downloaded** (9 are 503 on DGT's own server)
- Answer distribution is balanced: A 273 / B 266 / C 259 — no guessable bias
- Plus the **50 questions** of the N-240 supplement you supplied, also with
  answer key, categorised by DGT as Reglamentación 1–22, Señales 23–29,
  Seguridad Vial 30–45, Motos 46–48, Novedades 49–50

→ `build/data/dgt_revista_questions.json`, images in `build/media/dgt/`

### 4.2 Real exam question wording + photos — 2,945, **no answers**

`carnetb.pdf` turned out to be an Anki deck where **Front = question text** and
**Back = the scenario photograph**. There are no answer options and no correct
answers anywhere in the file — I verified this across all 498 pages.

What was recovered: **2,945 question stems paired to their own photograph** by
matching vertical position on the page (2,905 unique; the repeats are generic
stems like *"¿Qué indica esta señal?"* that are only distinguishable by their
image — so the pairing matters).

**This is still extremely valuable, just not as a quiz.** It is 2,945 samples of
exactly the Spanish you have to understand on exam day, each with its picture.
It becomes the **comprehension and listening corpus** — read/hear the real
question, prove you understood it — which is precisely the skill you said you
are missing. A curated subset can be promoted to full questions where the
manuals state the rule unambiguously.

→ `build/data/carnetb_questions.json`

### 4.3 Generated practice questions — planned, clearly labelled

The 222 frases and the Lectura Fácil manual support deterministic generation of
practice items (true/false, fill-the-gap, "which is prohibited", number recall)
**each carrying a citation back to the exact source sentence and page**. These
will be tagged `origin: "practice"` and shown with a visible badge, never mixed
into "official" counts. Projected yield: ~900–1,200 items.

### 4.4 Summary

| Type | Count | Answers? | Label in app |
|------|-------|----------|--------------|
| DGT revista questions | 797 | ✅ verified | **Oficial DGT** |
| N-240 supplement | 50 | ✅ verified | **Oficial DGT** |
| carnetb stems + photos | 2,945 | ❌ none | **Comprensión** |
| Generated from manuals | ~1,000 | ✅ cited | **Práctica** |

---

## 5. Sentences and grammar

### 5.1 Sentence corpus

- **222** curated exam-fact sentences (`frases222.json`), each ≤ 2 lines, each
  already a complete testable statement — ideal for translate / reorder /
  gap-fill / listen-and-reconstruct
- **~4,800** sentences from the easy-read manual, indexed by theme and page,
  already filtered to 25–190 characters
- **2,945** authentic exam question sentences
- **2,394** official option strings (797 × 3) — short, highly patterned Spanish

### 5.2 Grammar structures, ranked by real frequency

Measured across 6,358 real sentences (`tools/grammar.py`,
`build/data/grammar_patterns.json`). This is the teaching order, derived from the
data rather than from a textbook:

| Rank | Structure | Hits | % |
|------|-----------|------|---|
| 1 | **debe / deben / deberá** (obligation) | 988 | 15.5% |
| 2 | **puede / pueden / podrá** (permission) | 755 | 11.9% |
| 3 | **subjunctive after *que*** | 744 | 11.7% |
| 4 | **gerund** — *circulando, conduciendo, adelantando* | 586 | 9.2% |
| 5 | **cuando / siempre que** | 416 | 6.5% |
| 6 | **si …** conditional | 316 | 5.0% |
| 7 | **pasiva refleja** — *se debe, se permite, se señaliza* | 308 | 4.8% |
| 8 | **deictic reference to the photo** — *esta señal, este vehículo* | 281 | 4.4% |
| 9 | *¿cuál es / cuáles son?* | 280 | 4.4% |
| 10 | **está permitido / está prohibido** | 266 | 4.2% |
| 11 | **es obligatorio / necesario / recomendable** | 217 | 3.4% |
| 12 | **hay que / se debe** | 161 | 2.5% |
| 13 | *¿qué debe hacer?* | 132 | 2.1% |
| 14 | *¿está permitido?* | 113 | 1.8% |
| 15 | **como norma general** | 62 | 1.0% |
| 16 | **salvo / excepto / a menos que** (exception) | 57 | 0.9% |
| 17 | **al menos / como mínimo / como máximo / nunca** | 45 | 0.7% |
| 18 | **en ningún caso / ni … ni** (double negation) | 42 | 0.7% |
| 19 | **aunque** (concessive) | 29 | 0.5% |

**The headline finding for your learning problem:** the top three structures
alone — *debe*, *puede*, and the subjunctive after *que* — appear in roughly
**39% of all exam sentences**. The entire exam is built on a small, closed set of
obligation/permission/exception grammar. This is highly learnable, and it is
exactly the set you listed as your weakness (*aunque, salvo, siempre que, a menos
que*). Rank 16 confirms it: **salvo / excepto** is the single most common way the
exam flips an answer from right to wrong.

### 5.3 Vocabulary frequency — the words that actually matter

Top content words across the full corpus (stopwords removed): *vehículo* 1,997 ·
*velocidad* 479 · *conductor/conductores* 622 · *circular/circulación/circula* 702 ·
*carretera* 350 · *señal/señales* 617 · *vía/vías* 381 · *carril/carriles* 389 ·
*seguridad* 264 · *luz/luces* 503 · *adelantar* 154 · *calzada* 151 ·
*permitido* 138 · *prohibido* 111 · *obligatorio* 103 · *arcén* 90 ·
*preferencia* 89 · *rasante*, *gálibo*, *catadióptrico* (low count, high exam value).

Note the triplet you flagged — **permitido (138) / prohibido (111) /
obligatorio (103)** — is confirmed as a genuine high-frequency confusion set.

---

## 6. Difficulty model

Difficulty will be computed, not guessed, from four measured signals already
available in the data:

1. **Corpus frequency** — rare word = harder (`freq_top.json`)
2. **Appears in real exam questions or not** — 153 of your 297 words do
3. **Source register** — Lectura Fácil (easy) < 222 frases (medium) < Manual II (hard)
4. **Sentence length and clause count** of its example sentence

Plus a fifth, personal signal once you start using the app: your own FSRS
difficulty for that item, which overrides the static estimate.

---

## 7. Gaps, risks and things I could not resolve

1. **`EXAMEN-TEORICO-POWER-POINT-1.pdf` is Argentinian.** Its rules, sign
   terminology and road vocabulary differ from Spanish DGT law, and it has no
   answer key. Including it would actively teach you wrong answers and wrong
   words (*colectivo*, *patente*, *contramano*). **Recommendation: exclude it.**
   If you want, I can keep ~20 of its items in a tiny "false friends across
   Spanish-speaking countries" side lesson — but it must never enter the exam
   simulator.
2. **`carnetb.pdf` has no answers.** Confirmed exhaustively. Repurposed as the
   comprehension corpus (§4.2). This is a real reduction against the hope of
   "2,945 ready questions" and you should know it up front.
3. **Image weight.** The 789 DGT photos are 61 MB as downloaded; the 2,945
   carnetb photos are ~700 MB raw. Both must be recompressed (WebP, ~800px) before
   they go anywhere near GitHub Pages. Phase 2 will size this properly; the
   carnetb set will likely need to be a lazy-loaded subset, not all 2,945.
4. **Rule currency conflict.** Source 2 is Edición 2026 and states three changes
   the older sources contradict: the **V-16 conectada replaces warning
   triangles from 1 Jan 2026**; the **+20 km/h overtaking margin on conventional
   roads no longer exists**; **minors have a 0.0 alcohol limit**. Some of the 797
   scraped questions date from 2014–2019 and may reflect superseded rules.
   **Mitigation:** every question carries its issue/year, and any question
   matching a "known changed rule" keyword list gets flagged for review before it
   is allowed into the exam simulator. I have not yet run that pass.
5. **Theme auto-tagging is first-match.** The vocabulary linker assigns the theme
   of the *first* sentence containing the word, which over-weights Temas 1–8.
   Needs a frequency-weighted pass.
6. **Signs are images, not data.** Tema 8 (Señales) is the biggest theme (58
   pages) and is almost entirely pictorial. The sign images still need to be
   extracted from the Lectura Fácil PDF and paired with their meanings — that is
   the largest remaining extraction job.
7. **No audio exists.** All listening exercises will use browser
   `SpeechSynthesis` with a Peninsular Spanish voice (`es-ES`), which is free and
   offline-capable but voice quality depends on the device.

---

## 8. What is on disk now

```
tools/                          reproducible extractors (run with python -I)
  parse_frases.py               222 frases       → frases222.json
  parse_glosario.py             Manual II glossary
  parse_lecturafacil.py         DGT easy-read definition boxes
  parse_wordsheet.py            your Google Sheet
  parse_carnetb.py              question↔photo pairing (PyMuPDF)
  scrape_dgt.py                 revista.dgt.es official questions
  fetch_dgt_images.py           official question photos
  link_vocab.py                 vocab → theme/page/example linker
  freq.py                       corpus frequency
  grammar.py                    grammar-pattern frequency

build/extracted/                6 × clean UTF-8 text (2.5 MB)
build/data/
  frases222.json                222
  glosario_manual2.json         83 terms + 64 acronyms
  defs_lecturafacil.json        27 DGT simple-Spanish definitions
  wordsheet_user.json           297
  vocab_linked.json             297, 90% linked to manual page + example
  carnetb_questions.json        2,945 question stems + image xrefs
  carnetb_stems.json            2,796 sentence-split stems
  dgt_revista_questions.json    797 official Q + options + answer + image
  freq_top.json                 400 ranked tokens
  grammar_patterns.json         19 structures with counts and examples
build/media/dgt/                789 official question photographs (61 MB)
```

---

## 9. What Phase 2 will decide

- The skill tree: 18 DGT themes × progressive lessons, cross-linked to the five
  222-frases blocks
- How a single lesson interleaves vocabulary → sentence → question so that
  *adelantar / adelantamiento / carril contrario / vehículo adelantado /
  distancia de seguridad* are all met in one sitting and then recycled
- The five-ability FSRS model (recognition, comprehension, production, listening,
  contextual) and how one word carries five independent schedules
- The error classifier that decides whether a wrong answer was a **Spanish**
  failure or a **theory** failure — the single most important mechanism in the
  whole design, and the thing that makes this different from Anki
- Dexie schema, daily-goal generator, and the GitHub Pages / PWA build shape
