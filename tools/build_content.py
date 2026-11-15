"""Build app/data/*.json from the extracted sources.

Run:  python -I tools/build_content.py
Deterministic: same inputs always produce the same output.
"""
import json, re, os, math, collections, unicodedata, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)
OUT = D("app", "data")
os.makedirs(OUT, exist_ok=True)

def load(p):
    with open(D(p), encoding="utf-8") as f:
        return json.load(f)

def save(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {name:<22} {len(obj) if isinstance(obj,(list,dict)) else '-':>6}  "
          f"{os.path.getsize(os.path.join(OUT,name))/1024:.0f} KB")

def nrm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower())
                   if unicodedata.category(c) != "Mn")

def sid(*parts):
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:10]

# ---------------------------------------------------------------- topics
TOPICS = [
    (1,  "definiciones",   "Definiciones",                      "Vehículos, personas y categorías", "🚗", 3, 25),
    (2,  "documentacion",  "Documentación",                     "Permisos, documentos y trámites", "📄", 26, 41),
    (3,  "estado",         "El estado del conductor",           "Alcohol, drogas, fatiga y salud", "🧠", 42, 73),
    (4,  "obligaciones",   "Obligaciones de conductores y peatones", "Deberes de todos los usuarios", "🤝", 74, 85),
    (5,  "dispositivos",   "Dispositivos de seguridad",         "Cinturón, airbag, casco y SRI", "🦺", 86, 119),
    (6,  "elementos",      "Elementos del vehículo",            "Mandos, retrovisores y parabrisas", "🎛️", 120, 138),
    (7,  "luces",          "Sistema de luces",                  "Cada luz y cuándo se usa", "💡", 139, 153),
    (8,  "senales",        "Señales de circulación",            "Señales, marcas, semáforos y agentes", "🛑", 154, 211),
    (9,  "via",            "La vía",                            "Tipos de vía, carriles y arcén", "🛣️", 212, 242),
    (10, "velocidad",      "Velocidad y distancias",            "Límites y distancias de seguridad", "⏱️", 243, 266),
    (11, "maniobras",      "Maniobras",                         "Adelantar, girar, parar y estacionar", "↩️", 267, 300),
    (12, "preferencia",    "Normas de preferencia",             "Quién tiene preferencia", "⚖️", 301, 318),
    (13, "carga",          "Transportar personas y cargas",     "Pasajeros, carga y señalización", "📦", 319, 340),
    (14, "segura",         "Conducir de forma segura",          "Conducción defensiva en la práctica", "🛡️", 341, 364),
    (15, "mecanica",       "Mecánica y mantenimiento",          "Neumáticos, frenos, motor y revisiones", "🔧", 365, 387),
    (16, "accidentes",     "Accidentes de tráfico",             "Regla PAS, primeros auxilios y emergencias", "🚑", 388, 436),
    (17, "eficiente",      "Conducción preventiva y eficiente", "Anticipación y ahorro de combustible", "🌱", 437, 466),
    (18, "puntos",         "El permiso por puntos",             "El sistema de puntos", "🎯", 467, 477),
]
TOPIC_BY_N = {t[0]: t for t in TOPICS}

def tema_of_page(p):
    for t in TOPICS:
        if t[5] <= p <= t[6]:
            return t[0]
    return None

# -------------------------------------------- topic keyword model (tf-idf)
lf_pages = open(D("build/extracted/TeoricaAbreviada_LecturaFacil_2023-12_Interactivo.txt"),
                encoding="utf-8").read().split("\f")
tema_text = collections.defaultdict(list)
for pi, pg in enumerate(lf_pages, 1):
    t = tema_of_page(pi)
    if t:
        tema_text[t].append(pg)

STOP = set("""el la los las un una unos unas de del al a y o u en por para con sin sobre entre que se lo le les su sus
es son ser esta estan estar hay como mas menos muy pero si no ni ya cuando donde cual cuales que cual como puede pueden
debe deben hacer este esta estos estas ese esa eso aquel todo toda todos todas usted cuanto cuantos e desde hasta tras
ante bajo durante segun mediante otro otra otros otras mismo misma cada vez veces ha han he habia fue era sean sea haya
tanto ademas tambien solo sino aunque porque pues asi entonces luego antes despues mientras siempre nunca cualquier tu
te me mi nos nuestro ello ella el ellos ellas dos tres uno ver video tema pagina parte ejemplo puedes debes son estan
tiene tienen hace muy bien mal poco mucho menos mas""".split())

def toks(s):
    return [w for w in re.findall(r"[a-záéíóúüñ]{4,}", s.lower()) if nrm(w) not in STOP]

tf = {t: collections.Counter(toks(" ".join(v))) for t, v in tema_text.items()}
df = collections.Counter()
for t, c in tf.items():
    for w in c:
        df[w] += 1
N = len(tf)
TOPIC_KEYS = {}
for t, c in tf.items():
    tot = sum(c.values()) or 1
    scored = {w: (n / tot) * math.log(N / (1 + df[w])) for w, n in c.items() if n >= 3}
    TOPIC_KEYS[t] = dict(sorted(scored.items(), key=lambda kv: -kv[1])[:70])

def classify(text, bias=None):
    """Return (tema, confidence 0..1)."""
    ws = set(nrm(w) for w in toks(text))
    best, scores = None, {}
    for t, keys in TOPIC_KEYS.items():
        s = sum(v for w, v in keys.items() if nrm(w) in ws)
        if bias and t == bias:
            s *= 1.35
        scores[t] = s
    tot = sum(scores.values())
    if not tot:
        return None, 0.0
    best = max(scores, key=scores.get)
    return best, round(scores[best] / tot, 3)

# ---------------------------------------------------------------- lexicon
lex_raw = load("tools/lexicon.json")
LEX = {k: v for k, v in lex_raw.items() if not k.startswith("_")}
# lookups are accent-insensitive, so index by the normalised key too
LEX_N = {}
for k, v in LEX.items():
    LEX_N.setdefault(nrm(k), v)

# ------------------------------------------------------------------ terms
ws = load("build/data/wordsheet_user.json")
linked = load("build/data/vocab_linked.json")
ov = {}
for f in ("tools/vocab_overrides.json", "tools/vocab_overrides_2.json", "tools/vocab_overrides_3.json"):
    ov.update({k: v for k, v in load(f).items() if not k.startswith("_")})

lf_defs = load("build/data/defs_lecturafacil.json")
LF_DEF = {nrm(d["term"]): d for d in lf_defs}
gl = load("build/data/glosario_manual2.json")
GL_DEF = {nrm(g["term"]): g for g in gl["terms"]}

freq = {f["w"]: f["n"] for f in load("build/data/freq_top.json")}

terms, dropped = [], 0
for i, (w, lk) in enumerate(zip(ws, linked), 1):
    o = ov.get(str(i), {})
    if o.get("drop"):
        dropped += 1
        continue
    es = o.get("es", w["es"])
    en = o.get("en", w["en_user"])
    simple = o.get("simple")
    src = o.get("src")
    head = re.sub(r"^(el|la|los|las|un|una)\s+", "", es, flags=re.I)
    head = re.sub(r"\(.*?\)", "", head).strip()
    if not simple:
        d = LF_DEF.get(nrm(head)) or GL_DEF.get(nrm(head))
        if d:
            simple = d["def"]
            src = src or ("DGT Lectura Fácil p.%d" % d["page"] if "tema" in d else "Manual II p.%d" % d["page"])
    tema = lk.get("tema")
    if lk.get("example"):
        t2, conf = classify(lk["example"] + " " + es, bias=tema)
        if conf > 0.08 and t2:
            tema = t2
    terms.append({
        "id": "t" + sid("term", i),
        "es": es, "head": head, "en": en,
        "simple": simple,
        "pos": o.get("pos"),
        "note": o.get("note"),
        "conf": o.get("conf") or [],
        "topic": tema,
        "example": lk.get("example"),
        "exampleSrc": lk.get("example_src"),
        "src": src,
        "freqQ": lk.get("freq_preguntas", 0),
        "freqF": lk.get("freq_frases", 0),
        "origin": "wordsheet",
    })

# add DGT definition-box terms not already present
have = {nrm(t["head"]) for t in terms}
for d in lf_defs:
    if nrm(d["term"]) in have or d["term"] in ("Anexo puntos",) or d["term"] == "Distracciones":
        continue
    terms.append({
        "id": "t" + sid("lf", d["term"]), "es": d["term"], "head": d["term"], "en": None,
        "simple": d["def"], "pos": None, "note": None, "conf": [],
        "topic": d["tema"], "example": None, "exampleSrc": None,
        "src": f"DGT Lectura Fácil p.{d['page']}", "freqQ": 0, "freqF": 0, "origin": "dgt-def",
    })
    have.add(nrm(d["term"]))

# add glossary terms that actually occur in the exam corpus
cb = load("build/data/carnetb_questions.json")
cb_blob = nrm(" ".join(q["q"] for q in cb))
for g in gl["terms"]:
    h = nrm(g["term"])
    if h in have or len(h) < 4:
        continue
    if cb_blob.count(h) < 2:
        continue
    t, _ = classify(g["term"] + " " + g["def"])
    terms.append({
        "id": "t" + sid("gl", g["term"]), "es": g["term"], "head": g["term"], "en": None,
        "simple": g["def"], "pos": None, "note": None, "conf": [],
        "topic": t, "example": None, "exampleSrc": None,
        "src": f"Manual II p.{g['page']}", "freqQ": cb_blob.count(h), "freqF": 0, "origin": "glosario",
    })
    have.add(h)

# difficulty 1..5 from corpus frequency + register + example length
for t in terms:
    f = freq.get(nrm(t["head"]).split()[0] if t["head"] else "", 0) + t["freqQ"] * 2
    d = 5 if f == 0 else 4 if f < 5 else 3 if f < 25 else 2 if f < 100 else 1
    if t["origin"] == "glosario":
        d = min(5, d + 1)
    if t["example"] and len(t["example"]) > 120:
        d = min(5, d + 1)
    t["difficulty"] = d

# fill missing topics by classifying the headword + gloss
for t in terms:
    if not t["topic"]:
        t["topic"] = classify(" ".join(filter(None, [t["es"], t["simple"], t["example"]])))[0] or 1

TERM_BY_HEAD = {}
for t in terms:
    TERM_BY_HEAD.setdefault(nrm(t["head"]), t)

# -------------------------------------------------------------- sentences
LIG = {"ﬁ": "fi", "ﬂ": "fl"}
SEC2TOPIC = {"maniobras": 11, "normas_basicas": 4, "riesgos_auxilio": 16,
             "vehiculo_seguro": 5, "vias_senales": 8}

# longest-match chunker over multiword terms + lexicon
MULTI = sorted([nrm(t["head"]) for t in terms if " " in t["head"]] +
               [k for k in LEX if " " in k], key=len, reverse=True)

# --- morphology ------------------------------------------------------
# Verb endings, longest first. Stripping one gives a stem; stem + ar/er/ir
# is tried against the dictionaries.
VERB_SUF = ["andose", "iendose", "aramos", "ieramos", "abamos", "iamos",
            "aremos", "eremos", "iremos", "ariamos", "eriamos", "iriamos",
            "andola", "andolo", "iendola", "iendolo",
            "ando", "iendo", "amos", "emos", "imos", "aban", "ian", "aron",
            "ieron", "aste", "iste", "ados", "idos", "adas", "idas",
            "ara", "iera", "ase", "iese", "aria", "eria", "iria",
            "ado", "ido", "ada", "ida", "aba", "ia", "are", "ere", "ire",
            "ais", "eis", "an", "en", "as", "es", "os", "ar", "er", "ir",
            "a", "e", "o", "s"]
NOUN_SUF = ["es", "s"]

def _look(n):
    if n in LEX_N:
        return {"en": LEX_N[n][0], "note": (LEX_N[n][1] or None), "kind": "lex"}
    t = TERM_BY_HEAD.get(n)
    if t:
        return {"en": t["en"], "note": t["simple"], "kind": "term", "termId": t["id"]}
    return None

_gcache = {}

def gloss_of(tok):
    n = nrm(tok)
    if n in _gcache:
        return _gcache[n]
    g = _look(n)
    if g is None and len(n) > 3:
        # plural / gender
        for suf in NOUN_SUF:
            if n.endswith(suf):
                g = _look(n[:-len(suf)])
                if g:
                    break
        if g is None and n.endswith(("a", "as", "os")):
            base = n[:-2] + "o" if n.endswith(("as", "os")) else n[:-1] + "o"
            g = _look(base)
        if g is None and n.endswith("o"):
            g = _look(n[:-1] + "a")
    if g is None and len(n) > 4:
        # verb forms -> infinitive
        for suf in VERB_SUF:
            if not n.endswith(suf) or len(n) - len(suf) < 3:
                continue
            stem = n[:-len(suf)]
            for inf in ("ar", "er", "ir"):
                g = _look(stem + inf)
                if g:
                    g = dict(g, infl=True)
                    break
            if g:
                break
            # stem-changing verbs: ue->o, ie->e  (puede->poder, enciende->encender)
            for a, b in (("ue", "o"), ("ie", "e"), ("i", "e"), ("u", "o")):
                if a in stem:
                    alt = stem.replace(a, b, 1)
                    for inf in ("ar", "er", "ir"):
                        g = _look(alt + inf)
                        if g:
                            g = dict(g, infl=True)
                            break
                if g:
                    break
            if g:
                break
    _gcache[n] = g
    return g

def chunk(text):
    out, i = [], 0
    low = nrm(text)
    while i < len(text):
        ch = text[i]
        if not ch.isalpha():
            out.append({"t": ch})
            i += 1
            continue
        hit = None
        for m in MULTI:
            if low.startswith(m, i) and (i + len(m) >= len(text) or not text[i + len(m)].isalpha()):
                hit = m
                break
        if hit:
            raw = text[i:i + len(hit)]
            g = TERM_BY_HEAD.get(hit)
            out.append({"t": raw, "g": ({"en": g["en"], "note": g["simple"], "kind": "term", "termId": g["id"]}
                                        if g else {"en": LEX[hit][0], "note": LEX[hit][1] or None, "kind": "lex"})})
            i += len(hit)
            continue
        j = i
        while j < len(text) and text[j].isalpha():
            j += 1
        raw = text[i:j]
        out.append({"t": raw, "g": gloss_of(raw)})
        i = j
    merged = []
    for p in out:
        if "g" not in p and merged and "g" not in merged[-1]:
            merged[-1]["t"] += p["t"]
        else:
            merged.append(p)
    return merged

frases = load("build/data/frases222.json")
sentences = []
for f in frases:
    txt = f["text"]
    for k, v in LIG.items():
        txt = txt.replace(k, v)
    base = SEC2TOPIC[f["section"]]
    t2, conf = classify(txt, bias=base)
    topic = t2 if conf > 0.07 and t2 else base
    ch = chunk(txt)
    known = sum(1 for p in ch if p.get("g"))
    words = sum(1 for p in ch if p["t"][:1].isalpha())
    sentences.append({
        "id": "s" + sid("fr", f["id"]),
        "es": txt, "topic": topic, "block": f["section"],
        "chunks": ch,
        "coverage": round(known / words, 2) if words else 0,
        "len": words,
        "difficulty": 1 if words < 18 else 2 if words < 26 else 3 if words < 34 else 4,
        "src": f"Resumen DGT 222 frases · {f['section'].replace('_',' ')} nº{f['n']}",
        "origin": "frases222",
    })

# ------------------------------------------------------------- questions
questions = []
dgt = load("build/data/dgt_revista_questions.json")
for q in dgt:
    if not q.get("img_file"):
        pass
    t, conf = classify(q["q"] + " " + " ".join(q["options"].values()))
    questions.append({
        "id": "q" + sid("dgt", q["src_page"], q["n"], q["q"][:40]),
        "q": q["q"],
        "options": [q["options"].get(k, "") for k in ("A", "B", "C")],
        "answer": "ABC".index(q["answer"]),
        "topic": t or 1,
        "topicConf": conf,
        # media/ ships WebP produced by tools/make_media.py
        "img": ("dgt/" + os.path.splitext(q["img_file"])[0] + ".webp") if q.get("img_file") else None,
        "origin": "official",
        "src": f"Revista DGT {q['src_title']}",
        "year": (re.search(r"(20\d\d)", q["src_title"]) or [None, None])[1],
    })

# N-240 official supplement (hand-keyed from the user's PDF, with DGT's answer key)
n240 = load("tools/n240_questions.json") if os.path.exists(D("tools/n240_questions.json")) else []
for q in n240:
    t, conf = classify(q["q"] + " " + " ".join(q["options"]))
    questions.append({
        "id": "q" + sid("n240", q["n"]), "q": q["q"], "options": q["options"],
        "answer": q["answer"], "topic": t or 1, "topicConf": conf,
        "img": (f"n240/n240-{q['n']:02d}.webp" if q.get("img") else None),
        "origin": "official", "src": f"Suplemento DGT nº240 · pregunta {q['n']} ({q['cat']})", "year": "2017",
    })

# ---- generated practice questions, each citing its source sentence
NUMRE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(km/h|kg|m|mm|metros|minutos|segundos|horas|años|puntos|%|cm³|kW|mg/l)")
def variants(num, unit):
    try:
        v = float(num.replace(".", "").replace(",", "."))
    except ValueError:
        return []
    cands = [v * 2, v / 2, v + 10, max(0, v - 10), v + 1, max(0, v - 1), v * 1.5]
    out, seen = [], {v}
    for c in cands:
        c = round(c, 2)
        if c <= 0 or c in seen:
            continue
        seen.add(c)
        s = ("%g" % c)
        if v >= 1000:
            s = f"{int(c):,}".replace(",", ".")
        out.append(f"{s} {unit}")
        if len(out) == 2:
            break
    return out

POLAR = [("está prohibido", "está permitido"), ("prohibido", "permitido"),
         ("obligatorio", "voluntario"), ("debe", "no debe"),
         ("por la izquierda", "por la derecha"), ("aumentar", "reducir"),
         ("al menos", "como máximo"), ("delante", "detrás")]

practice = []
for s in sentences:
    txt = s["es"]
    # (a) number-recall multiple choice
    m = NUMRE.search(txt)
    if m:
        alts = variants(m.group(1), m.group(2))
        if len(alts) == 2:
            correct = f"{m.group(1)} {m.group(2)}"
            opts = sorted([correct] + alts, key=lambda x: nrm(x))
            stem = txt[:m.start()].strip() + " ______ " + txt[m.end():].strip()
            practice.append({
                "id": "p" + sid("num", s["id"]),
                "q": "Completa la frase:  " + re.sub(r"\s+", " ", stem),
                "options": opts, "answer": opts.index(correct),
                "topic": s["topic"], "origin": "practice", "kind": "number",
                "src": s["src"], "sentenceId": s["id"], "img": None,
            })
    # (b) true/false with a polarity flip
    for a, b in POLAR:
        if a in txt:
            practice.append({
                "id": "p" + sid("tf", s["id"], a),
                "q": "¿Es correcta esta afirmación?\n\n« " + txt.replace(a, b, 1) + " »",
                "options": ["Verdadero", "Falso"], "answer": 1,
                "topic": s["topic"], "origin": "practice", "kind": "truefalse",
                "src": s["src"], "sentenceId": s["id"], "img": None,
                "explain": "La frase correcta es: « " + txt + " »",
            })
            break
    else:
        practice.append({
            "id": "p" + sid("tft", s["id"]),
            "q": "¿Es correcta esta afirmación?\n\n« " + txt + " »",
            "options": ["Verdadero", "Falso"], "answer": 0,
            "topic": s["topic"], "origin": "practice", "kind": "truefalse",
            "src": s["src"], "sentenceId": s["id"], "img": None,
        })

# (c) term gap-fill: blank a content word, choose from same-topic terms
BY_TOPIC = collections.defaultdict(list)
for t in terms:
    if t["head"] and len(t["head"]) > 4:
        BY_TOPIC[t["topic"]].append(t)
for s in sentences:
    picks = [p for p in s["chunks"]
             if p.get("g", {}) and p["g"].get("kind") == "term"
             and len(p["t"]) > 4 and not p["g"].get("infl")]
    seen_in_sentence = set()
    for p in picks[:2]:
        word = p["t"]
        if nrm(word) in seen_in_sentence:
            continue
        seen_in_sentence.add(nrm(word))
        pool = [t["head"] for t in BY_TOPIC.get(s["topic"], [])
                if nrm(t["head"]) != nrm(word) and " " not in t["head"]]
        pool = sorted(set(pool), key=lambda x: sid("d", s["id"], x))[:3]
        if len(pool) < 3:
            continue
        opts = sorted([word] + pool, key=lambda x: sid("o", s["id"], x))
        stem = s["es"].replace(word, "______", 1)
        practice.append({
            "id": "p" + sid("gap", s["id"], word),
            "q": "Elige la palabra que falta:\n\n" + stem,
            "options": opts, "answer": opts.index(word),
            "topic": s["topic"], "origin": "practice", "kind": "gapfill",
            "src": s["src"], "sentenceId": s["id"], "img": None,
            "targetWord": word,
        })
questions.extend(practice)

# ---- rule-currency verdicts: quarantine questions that teach a dead rule --
VERDICTS = {}
_vp = D("tools", "rule_verdicts.json")
if os.path.exists(_vp):
    VERDICTS = {k: v for k, v in load("tools/rule_verdicts.json").items() if not k.startswith("_")}
n_outdated = 0
for q in questions:
    v = VERDICTS.get(q["id"])
    if not v:
        continue
    q["status"] = v["verdict"]
    if v["verdict"] == "outdated":
        q["supersededBy"] = v.get("note", "")
        q["supersededRule"] = v.get("rule", "")
        n_outdated += 1
print(f"  rule-currency: {len(VERDICTS)} reviewed, {n_outdated} quarantined as outdated")

# ---------------- comprehension corpus (real exam wording, no answer) -----
comp = []
for q in cb:
    if not q["q"].endswith(("?", "...", "…")):
        continue
    t, conf = classify(q["q"])
    comp.append({"id": "c" + sid("cb", q["page"], q["q"][:40]), "q": q["q"],
                 "topic": t or 1, "conf": conf, "page": q["page"], "xref": q["xref"]})

# ------------------------------------------------------------- grammar
gp = load("build/data/grammar_patterns.json")
GRAMMAR_TEACH = {
 "excepción: salvo / excepto / a menos que": ("salvo", "Excepciones: salvo / excepto", "*salvo* and *excepto* introduce the case where the rule does NOT apply. Miss the word and you invert the answer. It is the single most common way a DGT question flips.", ["salvo", "excepto", "a menos que", "salvo que"]),
 "concesiva: aunque": ("aunque", "Concesión: aunque", "*aunque* = although / even if. What follows does not cancel the rule: «debes adaptar la velocidad aunque circules por debajo del límite».", ["aunque", "aun cuando"]),
 "cuando / siempre que": ("siempreque", "Condición: siempre que / cuando", "*siempre que* means *provided that*, not *always*. It is a condition and it takes the subjunctive.", ["siempre que", "cuando"]),
 "modal: debe(n)/deberá": ("debe", "Obligación: debe / deberá", "*debe*, *deberá*, *deben* = a legal must. Not advice.", ["debe", "deben", "deberá", "deberán"]),
 "modal: puede(n)/podrá": ("puede", "Permiso: puede / podrá", "*puede* = may, is allowed to. Contrast it with *debe* = must. Swapping them changes the answer.", ["puede", "pueden", "podrá"]),
 "está permitido / prohibido": ("permiso", "Permitido · prohibido · obligatorio", "The three words the exam builds its traps on. They appear 138 / 111 / 103 times in your corpus.", ["está permitido", "está prohibido", "obligatorio"]),
 "pasiva refleja (se + verbo)": ("se", "El «se» impersonal", "*se debe*, *se permite*, *se prohíbe* = one must, it is allowed, it is forbidden. No named subject — the rule applies to everybody.", ["se debe", "se permite", "se prohíbe", "se considera"]),
 "negación doble: no ... ni / en ningún caso": ("ningun", "Negación absoluta", "*en ningún caso* = under no circumstances. Absolute wording is often, but not always, the wrong option.", ["en ningún caso", "nunca", "ni"]),
 "superlativo/límite: al menos, como mínimo, como máximo": ("limites", "Al menos vs como máximo", "*al menos* / *como mínimo* set a floor; *como máximo* sets a ceiling. Reading one as the other reverses the answer.", ["al menos", "como mínimo", "como máximo"]),
 "'como norma general'": ("normagen", "Como norma general", "This phrase warns you in advance that exceptions exist. Look for the exception before you answer.", ["como norma general"]),
 "condicional: si ...": ("si", "Condicional con «si»", "*si* + present tense decides which rule applies. The condition is the whole question.", ["si"]),
 "subjuntivo tras 'que'": ("subj", "Subjuntivo después de «que»", "After *que*, *cuando*, *siempre que*, *salvo que*, the verb ending changes: *circula → circule*, *sea*, *pueda*. It signals a condition, not a fact.", ["que sea", "que circule", "que pueda"]),
 "gerundio (circulando, conduciendo)": ("ger", "Gerundio: -ando / -iendo", "*circulando* = while driving along. It sets the situation in which the rule applies.", ["circulando", "conduciendo", "adelantando"]),
}
grammar = []
for g in gp:
    meta = GRAMMAR_TEACH.get(g["pattern"])
    if not meta:
        continue
    key, title, expl, markers = meta
    ex = [s["id"] for s in sentences if any(mk in nrm(s["es"]) for mk in map(nrm, markers))][:40]
    grammar.append({"id": "g" + key, "title": title, "pattern": g["pattern"],
                    "explain": expl, "markers": markers, "hits": g["hits"],
                    "pct": g["pct"], "sentenceIds": ex})
grammar.sort(key=lambda g: -g["hits"])

# ------------------------------------------------------------ topic index
topics = []
for n, slug, title, sub, icon, p0, p1 in TOPICS:
    tcount = sum(1 for t in terms if t["topic"] == n)
    scount = sum(1 for s in sentences if s["topic"] == n)
    qoff = sum(1 for q in questions if q["topic"] == n and q["origin"] == "official")
    qpra = sum(1 for q in questions if q["topic"] == n and q["origin"] == "practice")
    topics.append({"n": n, "slug": slug, "title": title, "sub": sub, "icon": icon,
                   "pages": [p0, p1], "counts": {"terms": tcount, "sentences": scount,
                                                 "official": qoff, "practice": qpra},
                   "keywords": list(TOPIC_KEYS.get(n, {}))[:25]})

meta = {
    "contentVersion": 3,
    "built": "2026-11-15",
    "exam": {"questions": 30, "maxWrong": 3},
    "sources": [
        {"key": "lf", "title": "Manual del Permiso B en Lectura Fácil", "org": "DGT", "year": 2023},
        {"key": "frases", "title": "Resumen DGT Permiso B · 222 frases", "org": "practicatest.com", "year": 2026},
        {"key": "m2", "title": "Manual II — Cuestiones de Seguridad Vial", "org": "DGT", "year": 2025},
        {"key": "revista", "title": "Revista Tráfico y Seguridad Vial · Test", "org": "DGT", "year": "2014–2026"},
        {"key": "n240", "title": "Suplemento Especial Test nº240", "org": "DGT", "year": 2017},
        {"key": "anki", "title": "Mazo Carnet.B (comprensión)", "org": "—", "year": 2026},
    ],
    "totals": {},
}

print("writing app/data:")
save("topics.json", topics)
save("terms.json", terms)
save("sentences.json", sentences)
save("questions.json", questions)
save("grammar.json", grammar)
save("lexicon.json", LEX)
save("comprehension.json", comp)
meta["totals"] = {"topics": len(topics), "terms": len(terms), "sentences": len(sentences),
                  "questions": len(questions),
                  "official": sum(1 for q in questions if q["origin"] == "official"),
                  "practice": sum(1 for q in questions if q["origin"] == "practice"),
                  "comprehension": len(comp), "grammar": len(grammar), "lexicon": len(LEX),
                  "quarantined": n_outdated,
                  "officialActive": sum(1 for q in questions
                                        if q["origin"] == "official" and q.get("status") != "outdated")}
save("meta.json", meta)

print("\nsummary")
for k, v in meta["totals"].items():
    print(f"  {k:<16}{v:>6}")
print(f"  duplicates merged from your wordsheet: {dropped}")
cov = [s["coverage"] for s in sentences]
print(f"  sentence gloss coverage: {sum(cov)/len(cov)*100:.0f}% of words have a translation")
unc = sum(1 for q in questions if q["origin"] == "official" and q.get("topicConf", 1) < 0.06)
print(f"  official questions with weak topic confidence: {unc}")
