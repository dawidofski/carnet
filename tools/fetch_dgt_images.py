import json, os, hashlib, urllib.request, time, sys
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
qs = json.load(open("build/data/dgt_revista_questions.json", encoding="utf-8"))
UA = "Mozilla/5.0 (compatible; personal-study-tool/1.0)"
seen, ok, fail = {}, 0, 0
for q in qs:
    u = q.get("img")
    if not u: q["img_file"] = None; continue
    if u in seen: q["img_file"] = seen[u]; continue
    name = hashlib.sha1(u.encode()).hexdigest()[:16] + os.path.splitext(u)[1].split("?")[0].lower()
    dest = os.path.join(out, name)
    if not os.path.exists(dest) or os.path.getsize(dest) < 500:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r: data = r.read()
            open(dest, "wb").write(data); time.sleep(1.2); ok += 1
        except Exception as e:
            print("!", u, e); fail += 1; q["img_file"] = None; continue
    else: ok += 1
    seen[u] = name; q["img_file"] = name
json.dump(qs, open("build/data/dgt_revista_questions.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
tot = sum(os.path.getsize(os.path.join(out,f)) for f in os.listdir(out))
print(f"downloaded/ok {ok} fail {fail} | unique images {len(seen)} | {tot/1e6:.1f} MB")
