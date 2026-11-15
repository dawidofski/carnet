import os, sys, json
from PIL import Image
SRC = "build/media/dgt"; DST = "media/dgt"
os.makedirs(DST, exist_ok=True)
MAXW = 760
n = ok = 0
for f in sorted(os.listdir(SRC)):
    n += 1
    out = os.path.join(DST, os.path.splitext(f)[0] + ".webp")
    if os.path.exists(out): ok += 1; continue
    try:
        im = Image.open(os.path.join(SRC, f)).convert("RGB")
        if im.width > MAXW:
            im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=74, method=5)
        ok += 1
    except Exception as e:
        print("!", f, e)
size = sum(os.path.getsize(os.path.join(DST, x)) for x in os.listdir(DST))
print(f"source {n} -> webp {ok} | {size/1e6:.1f} MB (was {sum(os.path.getsize(os.path.join(SRC,x)) for x in os.listdir(SRC))/1e6:.1f} MB)")
# rewrite question image paths to .webp
p = "app/data/questions.json"
qs = json.load(open(p, encoding="utf-8"))
c = 0
for q in qs:
    if q.get("img") and q["img"].endswith((".jpg", ".jpeg", ".png")):
        q["img"] = os.path.splitext(q["img"])[0] + ".webp"; c += 1
json.dump(qs, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("question image paths rewritten:", c)
