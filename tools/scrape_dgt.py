import re, json, os, time, urllib.request, html, sys
OUT_HTML = sys.argv[1]; OUT_JSON = sys.argv[2]
os.makedirs(OUT_HTML, exist_ok=True)
BASE = "https://revista.dgt.es"
UA = "Mozilla/5.0 (compatible; personal-study-tool/1.0)"
def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 2000:
        return open(dest, encoding="utf-8", errors="replace").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read()
    except Exception as e:
        print("  !", url, e); return None
    txt = raw.decode("utf-8", "replace")
    if "\ufffd" in txt[:4000]:
        txt = raw.decode("iso-8859-1", "replace")
    open(dest, "w", encoding="utf-8").write(txt)
    time.sleep(0.7)
    return txt

# 1. discover candidate test pages
cands = set()
for seed in ["/es/test/index.shtml"]:
    h = get(BASE + seed, os.path.join(OUT_HTML, "index.html")) or ""
    for m in re.finditer(r'href="(/es/test/[^"]*Test[^"]*\.shtml)"', h, re.I):
        cands.add(m.group(1))
for n in range(150, 290):
    cands.add(f"/es/test/Test-num-{n}.shtml")
for n in (238,239,240,241,242):
    for cat,k in [("Reglamentacion",3),("Senales",2),("Seg-Vial",3),("Seg-Vial-II",6),("Motos",2)]:
        for i in range(1,k+1): cands.add(f"/es/test/Test-num-{n}-{cat}-{i}.shtml")
print("candidates:", len(cands))

ART = re.compile(r'(?s)<article class="test[^"]*">(.*?)</article>')
def strip(s):
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()

qs, pages_ok = [], []
for path in sorted(cands):
    dest = os.path.join(OUT_HTML, path.rsplit("/",1)[-1])
    h = get(BASE + path, dest)
    if not h or 'class="test' not in h: continue
    title = strip(re.search(r"<title>(.*?)</title>", h, re.S).group(1)) if re.search(r"<title>(.*?)</title>", h, re.S) else path
    found = 0
    for a in ART.findall(h):
        mq = re.search(r'(?s)<h4[^>]*>(.*?)</h4>', a)
        if not mq: continue
        qt = strip(mq.group(1))
        num = None
        mn = re.match(r"^(\d{1,3})[\.\)]\s*(.*)$", qt)
        if mn: num, qt = int(mn.group(1)), mn.group(2)
        opts = {}
        for mo in re.finditer(r'(?s)<li[^>]*>\s*<span class="opcion">\s*([ABCabc])\.?\s*</span>(.*?)</li>', a):
            opts[mo.group(1).upper()] = strip(mo.group(2))
        ma = re.search(r'(?s)content_respuesta.*?<span class="opcion">\s*([ABCabc])\s*</span>', a)
        img = re.search(r'<img src="([^"]+)"', a)
        if len(opts) < 2 or not ma: continue
        qs.append({"src_page": path, "src_title": title, "n": num, "q": qt,
                   "options": opts, "answer": ma.group(1).upper(),
                   "img": (BASE + img.group(1)) if img else None})
        found += 1
    if found:
        pages_ok.append((path, found, title))
        print(f"  ok {path}: {found}")
print("\npages with questions:", len(pages_ok), "| total questions:", len(qs))
json.dump(qs, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
