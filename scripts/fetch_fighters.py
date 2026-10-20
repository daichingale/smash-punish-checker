#!/usr/bin/env python3
"""公式サイトのファイター切り抜きを取得し、表示用の小さい WebP にする。

入手元: https://www.smashbros.com/assets_v2/img/fighter/{file}/main.png
色2〜8は main2.png … main8.png（色1は main.png）。
Mii は公式の集合画像を個別に切り抜く。ポケモントレーナーとホムラ／ヒカリは集合のまま残す。
Mii は公式サイトに色違いの切り抜きが無いので、色1を 2〜8 にも使う。
"""
import json, pathlib, sys, urllib.request
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "fighters"
CACHE = pathlib.Path("/tmp/fighter-src")
BASE = "https://www.smashbros.com/assets_v2/img/fighter/{file}/{name}"
MAX_SIDE = 200
HIRES_SIDE = 1000
HIRES_Q = 84

# data.json の並び。file は公式 fighter.json の file 欄。
FILES = [
    "mario", "donkey_kong", "link", "samus", "dark_samus", "yoshi", "kirby", "fox", "pikachu", "luigi",
    "ness", "captain_falcon", "purin", "peach", "daisy", "koopa", "ice_climber", "sheik", "zelda", "dr_mario",
    "pichu", "falco", "marth", "lucina", "young_link", "ganondorf", "mewtwo", "roy", "chrom", "mr_game_and_watch",
    "meta_knight", "pit", "black_pit", "zero_suit_samus", "wario", "snake", "ike",
    "pokemon_trainer", "pokemon_trainer", "pokemon_trainer",
    "diddy_kong", "lucas", "sonic", "dedede", "pikmin_and_olimar", "lucario", "robot", "toon_link", "wolf",
    "murabito", "rockman", "wii_fit_trainer", "rosetta_and_chiko", "little_mac", "gekkouga",
    "mii_fighter", "mii_fighter", "mii_fighter",
    "palutena", "pac_man", "reflet", "shulk", "koopa_jr", "duck_hunt", "ryu", "ken", "cloud", "kamui",
    "bayonetta", "inkling", "ridley", "simon", "richter", "king_k_rool", "shizue", "gaogaen", "packun_flower",
    "joker", "dq_hero", "banjo_and_kazooie", "terry", "byleth", "minmin", "steve", "sephiroth",
    "homura", "homura",
    "kazuya", "sora",
]
# (x0, y0, x1, y1) は元画像に対する割合。集合レンダーだけ。
CROPS = {
    # ポケモントレーナーとホムラ／ヒカリは集合のまま使う。途中で切るとリザードンや相方が欠ける。
    55: (0.00, 0.00, 0.42, 1.00),
    56: (0.28, 0.00, 0.74, 1.00),
    57: (0.58, 0.00, 1.00, 1.00),
}


def src_name(color):
    return "main.png" if color == 1 else f"main{color}.png"


def download(file, color):
    dest = CACHE / file / f"{color}.png"
    if dest.exists() and dest.stat().st_size > 1000:
        return file, color, True, "cache"
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = BASE.format(file=file, name=src_name(color))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as res:
            data = res.read()
        if len(data) < 1000:
            return file, color, False, "short"
        dest.write_bytes(data)
        return file, color, True, "ok"
    except Exception as e:
        code = getattr(e, "code", type(e).__name__)
        return file, color, False, str(code)


def trim(im, pad):
    im = im.convert("RGBA")
    alpha = im.split()[-1].point(lambda p: 255 if p > 12 else 0)
    bb = alpha.getbbox()
    if not bb:
        return im
    l, t, r, b = bb
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit_side(im, side):
    w, h = im.size
    scale = side / max(w, h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    return im


def to_webp(im, dest):
    im = fit_side(trim(im, 4), MAX_SIDE)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=62, method=6)


def to_hires(im, dest):
    im = fit_side(trim(im, 8), HIRES_SIDE)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=HIRES_Q, method=4)


def encode_hires(job):
    i, file, color, use, box = job
    dest = OUT / "hires" / str(i) / f"{color}.webp"
    if dest.exists() and dest.stat().st_size > 8000:
        return "skip"
    im = Image.open(CACHE / file / f"{use}.png")
    if box:
        w, h = im.size
        im = im.crop((int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])))
    to_hires(im, dest)
    im.close()
    return "ok"


def main():
    names = [c["name"] for c in json.loads((ROOT / "data" / "data.json").read_text(encoding="utf-8"))["chars"]]
    if len(names) != len(FILES):
        raise SystemExit(f"roster {len(names)} != files {len(FILES)}")
    needed = sorted({(FILES[i], c) for i in range(len(FILES)) for c in range(1, 9)})
    print("download", len(needed))
    got = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futs = [pool.submit(download, f, c) for f, c in needed]
        for n, fut in enumerate(as_completed(futs), 1):
            file, color, ok, note = fut.result()
            got[(file, color)] = ok
            if not ok or n % 80 == 0:
                print(f"  {n}/{len(needed)} {file} {color} {note}")
    missing = []
    jobs = []
    for i, file in enumerate(FILES):
        for color in range(1, 9):
            use = color
            if not got.get((file, color)):
                use = 1
                if not got.get((file, 1)):
                    raise SystemExit(f"missing base {file}")
                missing.append({"id": i, "name": names[i], "file": file, "color": color, "fallback": 1})
            jobs.append((i, file, color, use, CROPS.get(i)))
    if "--hires" in sys.argv:
        done = 0
        with ProcessPoolExecutor(max_workers=4) as pool:
            futs = [pool.submit(encode_hires, job) for job in jobs]
            for fut in as_completed(futs):
                done += 1
                if done % 40 == 0 or done == len(futs):
                    print("hires", done, "/", len(futs), fut.result())
    else:
        for i, file, color, use, box in jobs:
            im = Image.open(CACHE / file / f"{use}.png")
            if box:
                w, h = im.size
                im = im.crop((int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])))
            to_webp(im, OUT / str(i) / f"{color}.webp")
            im.close()
    note = {
        "sourceSite": "https://www.smashbros.com/",
        "sourcePage": "https://www.smashbros.com/ja_JP/fighter/index.html",
        "urlPattern": "https://www.smashbros.com/assets_v2/img/fighter/{file}/main.png （色1）および main2.png〜main8.png（色2〜8）",
        "fighterList": "https://www.smashbros.com/assets_v2/data/fighter.json",
        "fetched": "2026-10-20",
        "format": "画面用は WebP quality 62・最長辺200px。書き出し用は fighters/hires/ に quality 84・最長辺1000px。どちらも透過を詰めた WebP。元PNGは同梱しない。",
        "layout": "fighters/{rosterIndex}/{color}.webp と fighters/hires/{rosterIndex}/{color}.webp。color は 1-8",
        "crops": {
            "37-39": "ポケモントレーナーは公式集合画像（pokemon_trainer）のまま。トレーナー・ゼニガメ・フシギソウ・リザードンを途中で切らない",
            "55-57": "Miiファイターの公式集合画像（mii_fighter）から 格闘 / 剣術 / 射撃 を切り出し。公式サイトに色違いの切り抜きが無いため色2〜8は色1と同じ",
            "85-86": "ホムラ／ヒカリは公式集合画像（homura、英語ページの pyra と同一）のまま。二人を途中で切らない",
        },
        "copyright": "© Nintendo / HAL Laboratory, Inc. 画像の権利は権利者に帰属します。この同梱は非公式のファン制作です。",
        "roster": [{"id": i, "name": names[i], "file": FILES[i], "crop": i in CROPS} for i in range(len(FILES))],
        "missingColors": missing,
    }
    (OUT / "SOURCES.json").write_text(json.dumps(note, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.rglob("*.webp"))
    print("webp", total // 1024, "KB", "files", len(list(OUT.rglob("*.webp"))), "missing", len(missing))


if __name__ == "__main__":
    main()
