import re, json, unicodedata, collections
TEMAS=[(3,25,1,"Definiciones"),(26,41,2,"Documentación"),(42,73,3,"El estado del conductor"),
 (74,85,4,"Obligaciones de conductores y peatones"),(86,119,5,"Dispositivos de seguridad en el vehículo"),
 (120,138,6,"Elementos del vehículo y normas para usarlos"),(139,153,7,"Sistema de luces de los vehículos"),
 (154,211,8,"Señales de circulación"),(212,242,9,"La vía"),(243,266,10,"Velocidad y distancias"),
 (267,300,11,"Maniobras"),(301,318,12,"Normas de preferencia para circular"),
 (319,340,13,"Transportar personas y cargas"),(341,364,14,"Conducir de forma segura"),
 (365,387,15,"Mecánica y mantenimiento del vehículo"),(388,436,16,"Accidentes de tráfico"),
 (437,466,17,"Conducción preventiva y eficiente"),(467,477,18,"Anexo: permiso por puntos")]
def tema(p):
    for a,b,n,t in TEMAS:
        if a<=p<=b: return n,t
    return 0,"Portada"
lf=open("build/extracted/TeoricaAbreviada_LecturaFacil_2023-12_Interactivo.txt",encoding="utf-8").read().split("\f")
# sentence index over the easy-read manual
SENTS=[]
for pi,pg in enumerate(lf,1):
    txt=re.sub(r"\s+"," ",pg.replace("\n"," ")).strip()
    for s in re.split(r"(?<=[.!?])\s+", txt):
        s=s.strip()
        if 25 <= len(s) <= 190 and re.search(r"[a-záéíóúñ]", s):
            n,t=tema(pi); SENTS.append({"s":s,"p":pi,"tema":n,"tema_title":t})
frases=json.load(open("build/data/frases222.json",encoding="utf-8"))
stems=json.load(open("build/data/carnetb_questions.json",encoding="utf-8"))
def norm(w): return "".join(c for c in unicodedata.normalize("NFD",w.lower()) if unicodedata.category(c)!="Mn")
def stem(w):
    w=norm(w)
    for suf in ("ciones","ciónes","idades","mente","ando","iendo","arse","erse","irse","ados","idos","adas","idas","ar","er","ir","es","os","as","a","o","s"):
        if len(w)>5 and w.endswith(suf): return w[:-len(suf)]
    return w
INDEX=collections.defaultdict(list)
for i,s in enumerate(SENTS):
    for w in set(re.findall(r"[a-záéíóúüñ]{3,}", s["s"].lower())): INDEX[stem(w)].append(i)
voc=json.load(open("build/data/wordsheet_user.json",encoding="utf-8"))
hits=0
for v in voc:
    head=re.sub(r"\(.*?\)","",v["es"]).strip()
    head=re.sub(r"^(el|la|los|las|un|una)\s+","",head,flags=re.I).strip()
    key=stem(head.split()[0]) if head else ""
    cands=INDEX.get(key,[])
    best=None
    for i in cands:
        s=SENTS[i]
        if norm(head) in norm(s["s"]): best=s; break
    if best is None and cands: best=SENTS[cands[0]]
    if best:
        hits+=1
        v["tema"]=best["tema"]; v["tema_title"]=best["tema_title"]
        v["example"]=best["s"]; v["example_src"]=f"LecturaFácil p.{best['p']}"
    else:
        v["tema"]=None; v["example"]=None
    # frequency in exam-question corpus
    v["freq_preguntas"]=sum(1 for q in stems if norm(head) in norm(q["q"]))
    v["freq_frases"]=sum(1 for f in frases if norm(head) in norm(f["text"]))
print(f"wordsheet entries: {len(voc)} | linked to a manual sentence: {hits} ({hits*100//len(voc)}%)")
print("by tema:", dict(sorted(collections.Counter(v['tema'] for v in voc if v['tema']).items())))
print("appear in real exam questions:", sum(1 for v in voc if v["freq_preguntas"]>0))
json.dump(voc, open("build/data/vocab_linked.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
