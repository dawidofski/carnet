import re, json, html
raw = open("wordsheet.html", encoding="utf-8").read()
rows = re.findall(r"<tr>.*?</tr>", raw, re.S)
out = []
for r in rows:
    cells = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
    if not cells: continue
    def clean(c):
        c = re.sub(r"<br\s*/?>", " ", c)
        c = re.sub(r"<[^>]+>", "", c)
        return re.sub(r"\s+", " ", html.unescape(c)).strip()
    vals = [clean(c) for c in cells]
    es, en = (vals + ["",""])[:2]
    grp = vals[2] if len(vals) > 2 else ""
    link = ""
    m = re.search(r'href="([^"]+)"', r)
    if m: link = m.group(1)
    if es and en:
        out.append({"es": es, "en_user": en, "group": grp if not grp.startswith("http") else "", "img": link})
print("wordsheet rows:", len(out))
json.dump(out, open("build/data/wordsheet_user.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
