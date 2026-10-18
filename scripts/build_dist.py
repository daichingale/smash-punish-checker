#!/usr/bin/env python3
"""src/ と data/ から dist/ を作る。
- dist/index.html: CSS・JS・データをすべて埋め込んだ単体HTML（スマホでファイルを開くだけで動く／そのまま静的公開できる）"""
import json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
src, data, dist = ROOT / "src", ROOT / "data", ROOT / "dist"
dist.mkdir(exist_ok=True)
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
calc = (src / "calc.js").read_text(encoding="utf-8")
app = (src / "app.js").read_text(encoding="utf-8")
d = json.loads((data / "data.json").read_text(encoding="utf-8"))
# 画面で使わない生値・備考を落として軽くする
for c in d["chars"]:
    for m in c["moves"]:
        for r in m["rows"]:
            for k in ("rowNote", "inherited", "landingLag"):
                r.pop(k, None)
blob = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = re.sub(r"<!--STYLE-->.*?<!--/STYLE-->", lambda m: f"<style>{css}</style>", html, flags=re.S)
html = re.sub(r"<!--DATA-->.*?<!--/DATA-->", lambda m: f"<script>window.__DATA__={blob};</script>", html, flags=re.S)
html = re.sub(r"<!--SCRIPTS-->.*?<!--/SCRIPTS-->", lambda m: f"<script>{calc}</script><script>{app}</script>", html, flags=re.S)
(dist / "index.html").write_text(html, encoding="utf-8")
print("dist/index.html", len(html.encode()) // 1024, "KB")
