#!/usr/bin/env python3
"""src/ と data/ から dist/ を作る。
- dist/index.html: CSS・JS・データをすべて埋め込んだ単体HTML（スマホでファイルを開くだけで動く／そのまま静的公開できる）
- dist/table.html: 全技表。データは dist/data.json を別リクエストで読む（index.html のサイズは増やさない）
- dist/tier.html: ティア表。ファイター名だけを埋め込み、data.json は読まない
- dist/result.html: リザルト。ファイター名だけを埋め込み、data.json は読まない
- dist/fighters/: 公式サイトの切り抜き WebP（HTML には埋め込まない）
- dist/manifest.webmanifest, icon.svg, sw.js: ホーム画面追加とオフライン用（ネットワーク優先）"""
import hashlib, json, pathlib, re, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
src, data, dist = ROOT / "src", ROOT / "data", ROOT / "dist"
dist.mkdir(exist_ok=True)
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
calc = (src / "calc.js").read_text(encoding="utf-8")
names = (src / "names.js").read_text(encoding="utf-8")
app = (src / "app.js").read_text(encoding="utf-8")
table_js = (src / "table.js").read_text(encoding="utf-8")
table_page = (src / "table-page.js").read_text(encoding="utf-8")
table_css = (src / "table.css").read_text(encoding="utf-8")
d = json.loads((data / "data.json").read_text(encoding="utf-8"))
# 画面で使わない生値・備考を落として軽くする（data.json 側はデバッグ用に残す）
for c in d["chars"]:
    for m in c["moves"]:
        m.pop("inputNote", None)
        for r in m["rows"]:
            for k in ("activeRaw", "totalRaw", "damageRaw", "stunRaw", "rowNote", "inherited", "landingLag"):
                r.pop(k, None)
blob = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = re.sub(r"<!--STYLE-->.*?<!--/STYLE-->", lambda m: f"<style>{css}</style>", html, flags=re.S)
html = re.sub(r"<!--DATA-->.*?<!--/DATA-->", lambda m: f"<script>window.__DATA__={blob};</script>", html, flags=re.S)
html = re.sub(r"<!--SCRIPTS-->.*?<!--/SCRIPTS-->", lambda m: f"<script>{calc}</script><script>{names}</script><script>{app}</script>", html, flags=re.S)
(dist / "index.html").write_text(html, encoding="utf-8")
(dist / "data.json").write_text(blob, encoding="utf-8")
table = (src / "table.html").read_text(encoding="utf-8")
table = re.sub(r"<!--STYLE-->.*?<!--/STYLE-->", lambda m: f"<style>{table_css}</style>", table, flags=re.S)
table = re.sub(r"<!--SCRIPTS-->.*?<!--/SCRIPTS-->", lambda m: f"<script>{calc}</script><script>{names}</script><script>{table_js}</script><script>{table_page}</script>", table, flags=re.S)
(dist / "table.html").write_text(table, encoding="utf-8")
tier_css = (src / "tier.css").read_text(encoding="utf-8")
tier_js = (src / "tier.js").read_text(encoding="utf-8")
tier_page = (src / "tier-page.js").read_text(encoding="utf-8")
roster = json.dumps([{"name": c["name"], "sheetTab": c["sheetTab"]} for c in d["chars"]], ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
tier = (src / "tier.html").read_text(encoding="utf-8")
tier = re.sub(r"<!--STYLE-->.*?<!--/STYLE-->", lambda m: f"<style>{tier_css}</style>", tier, flags=re.S)
tier = re.sub(r"<!--DATA-->.*?<!--/DATA-->", lambda m: f"<script>window.__ROSTER__={roster};</script>", tier, flags=re.S)
preview_js = (src / "preview.js").read_text(encoding="utf-8")
tier = re.sub(r"<!--SCRIPTS-->.*?<!--/SCRIPTS-->", lambda m: f"<script>{names}</script><script>{tier_js}</script><script>{preview_js}</script><script>{tier_page}</script>", tier, flags=re.S)
(dist / "tier.html").write_text(tier, encoding="utf-8")
result_css = (src / "result.css").read_text(encoding="utf-8")
result_js = (src / "result.js").read_text(encoding="utf-8")
result_page = (src / "result-page.js").read_text(encoding="utf-8")
result = (src / "result.html").read_text(encoding="utf-8")
result = re.sub(r"<!--STYLE-->.*?<!--/STYLE-->", lambda m: f"<style>{result_css}</style>", result, flags=re.S)
result = re.sub(r"<!--DATA-->.*?<!--/DATA-->", lambda m: f"<script>window.__ROSTER__={roster};</script>", result, flags=re.S)
result = re.sub(r"<!--SCRIPTS-->.*?<!--/SCRIPTS-->", lambda m: f"<script>{names}</script><script>{result_js}</script><script>{tier_js}</script><script>{preview_js}</script><script>{result_page}</script>", result, flags=re.S)
(dist / "result.html").write_text(result, encoding="utf-8")
fighters = ROOT / "fighters"
if fighters.is_dir():
    dest_f = dist / "fighters"
    if dest_f.exists():
        shutil.rmtree(dest_f)
    shutil.copytree(fighters, dest_f)
stamp = hashlib.sha256(html.encode()).hexdigest()[:10]
(dist / "manifest.webmanifest").write_text(json.dumps({
    "name": "スマブラSP 確定反撃チェッカー",
    "short_name": "確定反撃",
    "start_url": "./index.html",
    "scope": "./",
    "display": "standalone",
    "background_color": "#0e1116",
    "theme_color": "#0e1116",
    "lang": "ja",
    "icons": [{"src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}],
}, ensure_ascii=False, indent=2), encoding="utf-8")
(dist / "icon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6cb4ff"/>'
    '<text x="32" y="42" text-anchor="middle" font-size="26" font-family="sans-serif" font-weight="700" fill="#04121f">+F</text></svg>',
    encoding="utf-8")
(dist / "sw.js").write_text(
    f'const CACHE="punish-{stamp}";\n'
    'self.addEventListener("install",()=>self.skipWaiting());\n'
    'self.addEventListener("activate",e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));\n'
    'self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith((async()=>{try{const res=await fetch(e.request);if(res.ok){const c=await caches.open(CACHE);c.put(e.request,res.clone());}return res;}catch(err){const hit=await caches.match(e.request);if(hit)return hit;throw err;}})());});\n',
    encoding="utf-8")
print("dist/index.html", len(html.encode()) // 1024, "KB", "/ table.html", len(table.encode()) // 1024, "KB", "/ tier.html", len(tier.encode()) // 1024, "KB", "/ result.html", len(result.encode()) // 1024, "KB", "/ data.json", len(blob.encode()) // 1024, "KB")
