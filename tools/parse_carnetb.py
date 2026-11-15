import re, json, sys, os
sys.path.insert(0,"")
import pymupdf
doc = pymupdf.open("carnetb.pdf")
rows=[]
SKIP=re.compile(r"Anki to PDF|^https://|^Front$|^Back$|^Carnet\.B$|^\d+/498$|^\d{2}/\d{2}/\d{4}")
for pno in range(doc.page_count):
    p=doc[pno]
    # left-column text blocks = question cells
    cells=[]
    for b in p.get_text("blocks"):
        x0,y0,x1,y1,txt = b[0],b[1],b[2],b[3],b[4]
        if x1 > 440: continue            # right column = image cell
        t=re.sub(r"\s+"," ",txt).strip()
        if not t or SKIP.search(t): continue
        if len(t) < 12: continue
        cells.append((y0,y1,t))
    cells.sort()
    imgs=[]
    for d in p.get_image_info(xrefs=True):
        if d.get("xref"): imgs.append((d["bbox"][1], d["bbox"][3], d["xref"]))
    imgs.sort()
    used=set()
    for y0,y1,t in cells:
        best=None;bd=1e9
        for i,(iy0,iy1,x) in enumerate(imgs):
            if i in used: continue
            d=abs(((y0+y1)/2)-((iy0+iy1)/2))
            if d<bd: bd=d;best=i
        xref=None
        if best is not None and bd < 60:
            used.add(best); xref=imgs[best][2]
        rows.append({"page":pno+1,"q":t,"xref":xref})
print("rows:",len(rows),"| with image:",sum(1 for r in rows if r["xref"]))
json.dump(rows, open("build/data/carnetb_questions.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
for r in rows[:6]: print(r["page"], r["xref"], "|", r["q"][:95])
