#!/usr/bin/env python3
"""小さい切り抜きから、不透明部分の外接と顔の位置を data/focus.json に書く。

顔は、体の上側にある不透明ピクセルを上にあるほど重くした重心。
横に大きいキャラは、その重心が翼や殻に寄るので個別に上書きする。

複数体が1枚に写るキャラのうち、体が離れているものは体ごとの枠を bodies に書く。
ポケモントレーナーとホムラ／ヒカリは体が重なるので bodies にしない。
"""
import json
import pathlib
from PIL import Image

from fetch_fighters import CACHE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "fighters"
OUT = ROOT / "data" / "focus.json"

# (focusX, focusY) は画像に対する割合。頭が中央から外れている単体キャラ。
OVERRIDE = {
    1: (0.48, 0.14),   # ドンキーコング
    15: (0.42, 0.15),  # クッパ
    25: (0.50, 0.15),  # ガノンドロフ
    70: (0.70, 0.22),  # リドリー
    73: (0.50, 0.16),  # キングクルール
    76: (0.64, 0.18),  # パックンフラワー
    84: (0.34, 0.16),  # セフィロス
}

# 元PNGに対する割合。(left, top, right, bottom, faceX, faceY)。体は重なってよい。
# 枠は各体の大部分を覆い、顔の点はその体の頭に置く。
GROUPS = {
    "ice_climber": {
        "ids": [16],
        "bodies": [
            (0.00, 0.00, 0.62, 0.99, 0.42, 0.12),
            (0.40, 0.00, 1.00, 0.99, 0.72, 0.12),
        ],
    },
    "duck_hunt": {
        "ids": [63],
        "bodies": [
            (0.05, 0.18, 0.64, 0.99, 0.38, 0.32),  # 犬
            (0.46, 0.00, 1.00, 0.62, 0.77, 0.18),  # カモ
        ],
    },
    "rosetta_and_chiko": {
        "ids": [52],
        "bodies": [
            (0.06, 0.00, 0.72, 0.99, 0.38, 0.12),  # ロゼッタ
            (0.52, 0.12, 0.98, 0.72, 0.75, 0.35),  # チコ
        ],
    },
    "pikmin_and_olimar": {
        "ids": [44],
        "bodies": [
            (0.22, 0.02, 0.72, 0.99, 0.47, 0.14),  # オリマー
            (0.02, 0.08, 0.98, 0.96, 0.50, 0.42),  # ピクミン
        ],
    },
    "banjo_and_kazooie": {
        "ids": [79],
        "bodies": [
            (0.02, 0.08, 0.78, 0.99, 0.42, 0.20),  # バンジョー
            (0.28, 0.00, 0.88, 0.52, 0.55, 0.12),  # カズーイ
        ],
    },
}


def milli(v):
    return max(0, min(1000, int(round(v * 1000))))


def measure(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    alpha = im.split()[-1].point(lambda p: 255 if p > 16 else 0)
    bb = alpha.getbbox()
    if not bb:
        return [0, 0, 1000, 1000, 500, 180, w, h]
    l, t, r, b = bb
    bh = max(1, b - t)
    y1 = t + max(3, int(bh * 0.42))
    sx = sw = 0
    for y in range(t, y1):
        wt = float((y1 - y) ** 2)
        for x in range(l, r):
            if px[x, y][3] > 16:
                sx += x * wt
                sw += wt
    fx = (sx / sw) if sw else (l + r) / 2
    fy = t + bh * 0.18
    return [milli(l / w), milli(t / h), milli(r / w), milli(b / h), milli(fx / w), milli(fy / h), w, h]


def trim_rect(im, pad):
    alpha = im.split()[-1].point(lambda p: 255 if p > 12 else 0)
    bb = alpha.getbbox()
    if not bb:
        return 0, 0, im.width, im.height
    l, t, r, b = bb
    return (
        max(0, l - pad),
        max(0, t - pad),
        min(im.width, r + pad),
        min(im.height, b + pad),
    )


def map_bodies(im, bodies):
    """画面用 WebP と同じ pad 4 のトリム後の千分率に変換する。"""
    l, t, r, b = trim_rect(im, 4)
    tw = max(1, r - l)
    th = max(1, b - t)
    w, h = im.size
    out = []
    for bl, bt, br, bb, fx, fy in bodies:
        def nx(v):
            return (v * w - l) / tw

        def ny(v):
            return (v * h - t) / th

        left, top, right, bottom = nx(bl), ny(bt), nx(br), ny(bb)
        face_x, face_y = nx(fx), ny(fy)
        left, right = sorted((max(0.0, left), min(1.0, right)))
        top, bottom = sorted((max(0.0, top), min(1.0, bottom)))
        if right - left < 0.04:
            right = min(1.0, left + 0.04)
        if bottom - top < 0.04:
            bottom = min(1.0, top + 0.04)
        face_x = min(right, max(left, face_x))
        face_y = min(bottom, max(top, face_y))
        out.append([milli(left), milli(top), milli(right), milli(bottom), milli(face_x), milli(face_y)])
    return out


def main():
    names = [c["name"] for c in json.loads((ROOT / "data" / "data.json").read_text(encoding="utf-8"))["chars"]]
    by_id = {}
    for file, spec in GROUPS.items():
        for i in spec["ids"]:
            by_id[i] = (file, spec["bodies"])

    chars = []
    bodies_out = {}
    for i, name in enumerate(names):
        row = []
        body_row = []
        for color in range(1, 9):
            path = SRC / str(i) / f"{color}.webp"
            vals = measure(path)
            if i in OVERRIDE:
                fx, fy = OVERRIDE[i]
                l, t, r, b = vals[0], vals[1], vals[2], vals[3]
                vals[4] = milli(min(r / 1000, max(l / 1000, fx)))
                vals[5] = milli(min(b / 1000, max(t / 1000, fy)))
            if i in by_id:
                file, raw = by_id[i]
                src = Image.open(CACHE / file / f"{color}.png")
                mapped = map_bodies(src, raw)
                src.close()
                body_row.append(mapped)
                ls = [b[0] for b in mapped]
                ts = [b[1] for b in mapped]
                rs = [b[2] for b in mapped]
                bs = [b[3] for b in mapped]
                vals[0] = min(vals[0], min(ls))
                vals[1] = min(vals[1], min(ts))
                vals[2] = max(vals[2], max(rs))
                vals[3] = max(vals[3], max(bs))
                vals[4] = milli(sum(b[4] for b in mapped) / len(mapped) / 1000)
                vals[5] = milli(sum(b[5] for b in mapped) / len(mapped) / 1000)
                vals[4] = min(vals[2], max(vals[0], vals[4]))
                vals[5] = min(vals[3], max(vals[1], vals[5]))
            row.append(vals)
        chars.append(row)
        if body_row:
            bodies_out[str(i)] = body_row
    note = {
        "v": 1,
        "unit": "外接と焦点は画像幅・高さに対する千分率。末尾2つは計測した画像のピクセル幅と高さ。",
        "focus": "上から約42%の不透明ピクセルを、上にあるほど重くした重心。縦位置は外接の上から18%。",
        "minVisible": 0.6,
        "groupMinVisible": 0.7,
        "bodiesNote": "複数体が1枚に写るキャラだけ。色ごとに [left, top, right, bottom, faceX, faceY] の配列。各体の顔が枠に入り、各体が7割以上見えるように収める。",
        "override": {str(k): {"name": names[k], "focus": list(v)} for k, v in OVERRIDE.items()},
        "layout": "[left, top, right, bottom, focusX, focusY, width, height]",
        "chars": chars,
        "bodies": bodies_out,
    }
    OUT.write_text(json.dumps(note, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("focus", OUT, "chars", len(chars), "groups", len(bodies_out), "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
