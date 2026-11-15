import re, json
src="build/extracted/TeoricaAbreviada_LecturaFacil_2023-12_Interactivo.txt"
pages=open(src,encoding="utf-8").read().split("\f")
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
HEAD=re.compile(r"^(\s{1,6})([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ /()-]{2,34})\.(\s|$)")
defs=[]
for pi,pg in enumerate(pages,1):
    lines=pg.split("\n")
    for i,ln in enumerate(lines):
        m=HEAD.match(ln)
        if not m: continue
        term=m.group(2).strip()
        if term.lower() in {"ver vídeo","índice"} or " " in term and len(term.split())>3: continue
        body=[ln[m.end(2)+1:].strip()]
        for nx in lines[i+1:]:
            t=nx.strip()
            if not t or HEAD.match(nx) or re.fullmatch(r"\d{1,3}",t): break
            if re.search(r"Tema \d+\.",t): break
            body.append(t)
        d=re.sub(r"\s+"," "," ".join(body)).strip()
        if len(d)<20 or not re.match(r"^[A-ZÁÉÍÓÚÑ]",d): continue
        # must look like a definition, not a sentence about "you"
        if re.match(r"^(No |Y |Así |Puedes |Esto |Hay que |Ni )",d): continue
        n,t=tema(pi)
        defs.append({"term":term,"def":d,"page":pi,"tema":n,"tema_title":t})
seen=set(); out=[]
for d in defs:
    k=d["term"].lower()
    if k in seen: continue
    seen.add(k); out.append(d)
print("definition boxes:",len(out))
json.dump(out,open("build/data/defs_lecturafacil.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for d in out: print(f"T{d['tema']:>2} p{d['page']:>3} {d['term']:<22} {d['def'][:78]}")
