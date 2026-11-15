import re, json, sys, io
src = "build/extracted/Resumen-dgt-permiso-b-en-222-frases.txt"
raw = open(src, encoding="utf-8").read()
pages = raw.split("\f")
# strip page furniture
lines = []
for pi, p in enumerate(pages, 1):
    for ln in p.split("\n"):
        if re.search(r"practicatest|Página \d+ de \d+|Resumen DGT|222 frases para|^\s*Permiso B\s*$", ln):
            continue
        lines.append((pi, ln.rstrip()))

SECTIONS = {"MANIOBRAS":"maniobras","NORMAS BÁSICAS":"normas_basicas","RIESGOS Y AUXILIO":"riesgos_auxilio",
            "VEHÍCULO SEGURO":"vehiculo_seguro","VÍAS Y SEÑALES":"vias_senales"}
items, cur_sec, cur, expect = [], None, None, 1
for pi, ln in lines:
    s = ln.strip()
    if not s: continue
    m = re.match(r"^(" + "|".join(SECTIONS) + r")\s+(\d+)$", s)
    if m:
        cur_sec = SECTIONS[m.group(1)]; expect = 1
        if cur: items.append(cur); cur = None
        continue
    if re.match(r"^(" + "|".join(SECTIONS) + r")\s*[–—-]?\s*\d*\s*$", s) and cur_sec is None:
        continue
    m = re.match(r"^(\d{1,3})\s+(\S.*)$", s)
    if m and cur_sec and int(m.group(1)) == expect and len(m.group(2)) > 25:
        expect += 1
        if cur: items.append(cur)
        cur = {"section": cur_sec, "n": int(m.group(1)), "page": pi, "text": m.group(2)}
    elif cur is not None:
        cur["text"] += " " + s
if cur: items.append(cur)

# normalise: fix ligature artifacts, collapse spaces
LIG = {"ﬁ":"fi","ﬂ":"fl","ﬀ":"ff","ﬃ":"ffi","ﬄ":"ffl"}
for it in items:
    t = it["text"]
    for k,v in LIG.items(): t = t.replace(k,v)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+•\s*", " • ", t)
    it["text"] = t
    it["id"] = f"fr-{it['section']}-{it['n']:03d}"

from collections import Counter
print("total:", len(items), dict(Counter(i["section"] for i in items)))
json.dump(items, open("build/data/frases222.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
for i in items[:2]+items[-2:]: print(i["id"], "|", i["text"][:110])
