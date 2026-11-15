"""Flag official DGT questions that may teach a superseded rule.

The scraped questions span 2014-2026. Spanish traffic law changed materially in
May 2021 (urban speed limits), March 2022 (Ley 18/2021) and January 2026
(V-16). A question written before a change can be factually wrong today.

This script only FLAGS. Nothing is excluded without a human decision recorded
in tools/rule_verdicts.json.

Run:  python -I tools/rule_currency.py          # report
      python -I tools/rule_currency.py --apply  # write verdicts into app/data
"""
import json, os, re, sys, unicodedata, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)
nrm = lambda s: "".join(c for c in unicodedata.normalize("NFD", (s or "").lower())
                        if unicodedata.category(c) != "Mn")

# (id, changed-in-year, label, current rule, any-of patterns, all-of patterns)
RULES = [
    ("v16", 2026,
     "Señalización de vehículo inmovilizado",
     "Desde el 1-1-2026 la baliza V-16 conectada es el único medio legal; los "
     "triángulos V-16/V-2 ya no sirven para vehículos matriculados en España.",
     [r"triangul", r"\bv-?16\b", r"dispositivo de preseñalizacion"],
     [r"triangul|v-?16|preseñaliza|senaliza"]),

    ("margen20", 2022,
     "Margen de 20 km/h para adelantar",
     "Suprimido el 21-3-2022 (Ley 18/2021). En convencional no se puede superar "
     "el límite de la vía para adelantar.",
     [r"\b20\s*km", r"margen", r"rebasar en 20", r"superar.{0,24}limite"],
     [r"adelant"]),

    ("urbana", 2021,
     "Velocidad genérica en vía urbana",
     "Desde el 11-5-2021: 20 km/h en plataforma única, 30 km/h con un carril por "
     "sentido, 50 km/h con dos o más carriles por sentido.",
     [r"\b50\s*km", r"\b30\s*km", r"\b20\s*km"],
     [r"urbana|poblado|ciudad|travesia|calle"]),

    ("puntos_movil", 2022,
     "Puntos por usar el móvil",
     "Desde 21-3-2022 son 6 puntos (antes 3).",
     [r"punto"],
     [r"telefono|movil|auricular"]),

    ("puntos_cinturon", 2022,
     "Puntos por cinturón / casco / SRI",
     "Desde 21-3-2022 son 4 puntos (antes 3).",
     [r"punto"],
     [r"cinturon|casco|sistema de retencion|sri"]),

    ("ciclistas", 2022,
     "Adelantamiento a ciclistas",
     "Desde 21-3-2022 hay que cambiar de carril por completo en vías con más de "
     "un carril por sentido; 1,5 m de separación lateral siempre.",
     [r"1[,.]5|separacion|carril"],
     [r"ciclista|bicicleta|ciclo\b"]),

    ("alcohol", 2022,
     "Tasas de alcohol",
     "Generales 0,25 mg/l aire (0,5 g/l sangre); noveles y profesionales 0,15 "
     "mg/l (0,3 g/l). Menores de edad 0,0 desde marzo de 2022. La rebaja general "
     "a 0,2 g/l fue RECHAZADA en marzo de 2026: las tasas no han cambiado.",
     [r"0[,.]\d", r"tasa"],
     [r"alcohol|alcoholemia|espirado"]),

    ("vmp", 2022,
     "Vehículos de movilidad personal",
     "Regulados desde 2021-2022: prohibidos en acera, travesía, vía interurbana, "
     "autopista, autovía y túnel urbano; velocidad de diseño 6-25 km/h.",
     [r"patin|vmp|movilidad personal|segway"],
     [r"."]),

    ("radar", 2022,
     "Detectores e inhibidores de radar",
     "Desde 21-3-2022 llevar un detector son 3 puntos y 500 €.",
     [r"detector|inhibidor"],
     [r"radar|cinemometro|detector|inhibidor"]),

    ("recuperacion", 2022,
     "Recuperación del saldo de puntos",
     "Desde 21-3-2022: 2 años sin sanciones graves para recuperar el saldo; "
     "cursos de 10 h (hasta 4 puntos) y de 20 h tras perderlos todos.",
     [r"\b\d\s*(años|anos|horas)|recuperar|curso"],
     [r"punto"]),
]


def load():
    with open(D("app", "data", "questions.json"), encoding="utf-8") as f:
        return json.load(f)


def scan(questions):
    hits = collections.defaultdict(list)
    for q in questions:
        if q.get("origin") != "official":
            continue
        year = int(q.get("year") or 0)
        blob = nrm(q["q"] + " " + " ".join(q.get("options") or []))
        for rid, changed, label, current, anyof, allof in RULES:
            if year and year >= changed:
                continue  # written after the change: presumed current
            if not all(re.search(p, blob) for p in allof):
                continue
            if not any(re.search(p, blob) for p in anyof):
                continue
            hits[rid].append(q)
    return hits


def main():
    qs = load()
    hits = scan(qs)
    verdict_path = D("tools", "rule_verdicts.json")
    verdicts = json.load(open(verdict_path, encoding="utf-8")) if os.path.exists(verdict_path) else {}

    total = sum(len(v) for v in hits.values())
    print(f"official questions scanned: {sum(1 for q in qs if q['origin']=='official')}")
    print(f"flagged for review: {total} across {len(hits)} rules\n")

    for rid, changed, label, current, *_ in RULES:
        qq = hits.get(rid, [])
        if not qq:
            continue
        print(f"=== {rid}  ({label}, changed {changed}) — {len(qq)} flagged")
        print(f"    now: {current}")
        for q in qq:
            v = verdicts.get(q["id"], {}).get("verdict", "—")
            print(f"    [{v:^9}] {q['year']}  {q['id']}")
            print(f"        {q['q'][:120]}")
            for i, o in enumerate(q.get("options") or []):
                mark = "*" if i == q["answer"] else " "
                print(f"         {mark} {'ABC'[i]}. {o[:100]}")
        print()

    if "--apply" in sys.argv:
        if not verdicts:
            print("No tools/rule_verdicts.json — nothing to apply.")
            return
        n_out = n_ok = 0
        for q in qs:
            v = verdicts.get(q["id"])
            if not v:
                continue
            if v["verdict"] == "outdated":
                q["status"] = "outdated"
                q["supersededBy"] = v.get("note", "")
                n_out += 1
            else:
                q["status"] = "current"
                n_ok += 1
        with open(D("app", "data", "questions.json"), "w", encoding="utf-8") as f:
            json.dump(qs, f, ensure_ascii=False, separators=(",", ":"))
        print(f"applied: {n_out} marked outdated, {n_ok} confirmed current")


if __name__ == "__main__":
    main()
