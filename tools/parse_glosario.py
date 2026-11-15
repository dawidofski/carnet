import re, json
src = "build/extracted/Manual-II-Cuestiones-de-Seguridad-Vial-2025.txt"
raw = open(src, encoding="utf-8").read()
pages = raw.split("\f")
# glossary pages: find page index containing the first glossary bullet
gi = next(i for i,p in enumerate(pages) if "Accidente con víctimas" in p)
gj = next(i for i,p in enumerate(pages) if "GLOSARIO DE ACRÓNIMOS" in p and i > gi)
terms, cur = [], None
for pi in range(gi, gj):
    for ln in pages[pi].split("\n"):
        s = ln.strip()
        if not s or re.fullmatch(r"\d{1,4}|GLOSARIO|MANUAL II.*|CUESTIONES.*", s): continue
        m = re.match(r"^•\s*(.{2,70}?)[.:]\s+(.+)$", s)
        if m:
            if cur: terms.append(cur)
            cur = {"term": m.group(1).strip(), "def": m.group(2).strip(), "page": pi+1}
        elif cur:
            cur["def"] += " " + s
if cur: terms.append(cur)
for t in terms:
    for k,v in {"ﬁ":"fi","ﬂ":"fl"}.items():
        t["def"]=t["def"].replace(k,v); t["term"]=t["term"].replace(k,v)
    t["def"] = re.sub(r"\s+"," ",t["def"]).strip()
# acronyms
acr = []
for pi in range(gj, len(pages)):
    for ln in pages[pi].split("\n"):
        m = re.match(r"^•?\s*([A-ZÁÉÍÓÚ0-9/\.\-]{2,12})[.:]\s+(.{4,})$", ln.strip())
        if m: acr.append({"acronym": m.group(1), "def": re.sub(r"\s+"," ",m.group(2)).strip(), "page": pi+1})
print("glossary terms:", len(terms), "| acronyms:", len(acr))
json.dump({"terms":terms,"acronyms":acr}, open("build/data/glosario_manual2.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
for t in terms[:3]: print("-", t["term"], "::", t["def"][:90])
print("...")
for t in terms[-3:]: print("-", t["term"], "::", t["def"][:90])
