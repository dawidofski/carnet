import re, json, collections, unicodedata
corpora = {
 "frases": [i["text"] for i in json.load(open("build/data/frases222.json",encoding="utf-8"))],
 "preguntas": None, "lecturafacil": None,
}
# carnetb question stems
raw = open("build/extracted/carnetb.txt", encoding="utf-8").read()
stems=[]
for pg in raw.split("\f"):
    buf=[]
    for ln in pg.split("\n"):
        s=ln.strip()
        if not s or "Anki to PDF" in s or s.startswith("https://") or s in ("Front","Back","Front Back","Carnet.B") or re.fullmatch(r"\d+/498",s): continue
        s=re.sub(r"\s*\d+/498\s*$","",s).strip()
        if not s: continue
        buf.append(s)
    text=" ".join(buf)
    for m in re.finditer(r"[^.?]*\?|[^.?]*\.\.\.", text):
        t=re.sub(r"\s+"," ",m.group(0)).strip()
        if len(t)>18: stems.append(t)
corpora["preguntas"]=stems
lf = open("build/extracted/TeoricaAbreviada_LecturaFacil_2023-12_Interactivo.txt",encoding="utf-8").read()
corpora["lecturafacil"]=[lf]
json.dump(stems, open("build/data/carnetb_stems.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("carnetb question stems:", len(stems))

STOP=set("""el la los las un una unos unas de del al a y o u en por para con sin sobre entre que se lo le les su sus
es son ser está están estar hay como más menos muy pero si no ni ya cuando donde cual cuales qué cuál cómo
puede pueden debe deben tiene tienen hacer este esta estos estas ese esa eso aquel todo toda todos todas
usted su cuanto cuantos cuánto cuántos cuánta e desde hasta tras ante bajo durante según mediante
otro otra otros otras mismo misma cada vez veces ha han he había fue era sean sea haya tanto además también
solo sólo sino aunque porque pues así entonces luego antes después mientras siempre nunca cualquier
tu te me mi nos nuestro ello ella él ellos ellas lo cual dos tres uno""".split())
cnt=collections.Counter(); where=collections.defaultdict(set)
for name, texts in corpora.items():
    for t in texts:
        for w in re.findall(r"[a-záéíóúüñ]{3,}", t.lower()):
            if w in STOP: continue
            cnt[w]+=1; where[w].add(name)
top=[(w,c,sorted(where[w])) for w,c in cnt.most_common(400)]
json.dump([{"w":w,"n":c,"src":s} for w,c,s in top], open("build/data/freq_top.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("distinct lemma-ish tokens:", len(cnt))
print(" | ".join(f"{w}:{c}" for w,c,_ in top[:120]))
