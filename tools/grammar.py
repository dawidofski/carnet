import re, json, collections
qs=[q["q"] for q in json.load(open("build/data/carnetb_questions.json",encoding="utf-8"))]
off=json.load(open("build/data/dgt_revista_questions.json",encoding="utf-8"))
qs += [o["q"] for o in off] + [v for o in off for v in o["options"].values()]
fr=[f["text"] for f in json.load(open("build/data/frases222.json",encoding="utf-8"))]
ALL=qs+fr
PAT={
 "modal: debe(n)/deberá":r"\bdeb(e|en|erá|erán|ería|erían)\b",
 "modal: puede(n)/podrá":r"\bpu(ede|eden)\b|\bpod(rá|rán|ría)\b",
 "modal: tiene(n) que":r"\btien[e|en] que\b",
 "obligación impersonal: hay que / se debe":r"\bhay que\b|\bse debe\b",
 "está permitido / prohibido":r"\best[áa]\s+(permitid|prohibid)",
 "es obligatorio / necesario":r"\bes\s+(obligatorio|necesario|conveniente|recomendable)\b",
 "pasiva refleja (se + verbo)":r"\bse\s+(puede|debe|permite|prohíbe|considera|realiza|utiliza|señaliza|circula)\b",
 "condicional: si ...":r"(^|[,;]\s*)[Ss]i\s+\w+",
 "cuando / siempre que":r"\bcuando\b|\bsiempre que\b",
 "excepción: salvo / excepto / a menos que":r"\bsalvo\b|\bexcepto\b|\ba menos que\b",
 "concesiva: aunque":r"\baunque\b",
 "negación doble: no ... ni / en ningún caso":r"\bni\b.*\bni\b|\ben ning[úu]n caso\b|\bninguna?\b",
 "subjuntivo tras 'que'":r"\bque\s+\w+(e|en|a|an)\b\s",
 "gerundio (circulando, conduciendo)":r"\b\w+(ando|iendo)\b",
 "comparativo: más/menos ... que":r"\bm[áa]s\b.*\bque\b|\bmenos\b.*\bque\b",
 "superlativo/límite: al menos, como mínimo, como máximo":r"\bal menos\b|\bcomo m[íi]nimo\b|\bcomo m[áa]ximo\b|\bnunca\b",
 "'como norma general'":r"\bcomo norma general\b",
 "pregunta: ¿qué debe hacer?":r"¿qu[ée] debe",
 "pregunta: ¿está permitido?":r"¿est[áa]\s+permitido",
 "pregunta: ¿cuál es / cuáles son?":r"¿cu[áa]l(es)? \w+",
 "pregunta: ¿a qué velocidad?":r"¿a qu[ée] velocidad",
 "deíctico de imagen: 'esta señal/este vehículo'":r"\best[ae]\s+(se[ñn]al|veh[íi]culo|v[íi]a|situaci[óo]n|carretera|calzada|caso|conductor)",
}
rows=[]
for name,p in PAT.items():
    r=re.compile(p,re.I); n=sum(1 for t in ALL if r.search(t))
    ex=next((t for t in ALL if r.search(t) and len(t)<120), "")
    rows.append({"pattern":name,"regex":p,"hits":n,"pct":round(n*100/len(ALL),1),"example":ex})
rows.sort(key=lambda r:-r["hits"])
json.dump(rows,open("build/data/grammar_patterns.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(f"corpus sentences analysed: {len(ALL)}\n")
for r in rows: print(f'{r["hits"]:>5} {r["pct"]:>5}%  {r["pattern"]}')
