#!/usr/bin/env python3
"""小さい切り抜きから、不透明部分の外接と顔の位置を data/focus.json に書く。

顔は、体の上側にある不透明ピクセルを上にあるほど重くした重心。
横に大きいキャラは、その重心が翼や殻に寄るので個別に上書きする。
"""
import json
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "fighters"
OUT = ROOT / "data" / "focus.json"

# (focusX, focusY) は画像に対する割合。頭が中央から外れているキャラ。
OVERRIDE = {
    1: (0.48, 0.14),   # ドンキーコング
    15: (0.42, 0.15),  # クッパ
    25: (0.50, 0.15),  # ガノンドロフ
    39: (0.34, 0.13),  # リザードン
    70: (0.70, 0.22),  # リドリー
    73: (0.50, 0.16),  # キングクルール
    76: (0.64, 0.18),  # パックンフラワー
    84: (0.34, 0.16),  # セフィロス
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


def main():
    names = [c["name"] for c in json.loads((ROOT / "data" / "data.json").read_text(encoding="utf-8"))["chars"]]
    chars = []
    for i, name in enumerate(names):
        row = []
        for color in range(1, 9):
            vals = measure(SRC / str(i) / f"{color}.webp")
            if i in OVERRIDE:
                fx, fy = OVERRIDE[i]
                l, t, r, b = vals[0], vals[1], vals[2], vals[3]
                vals[4] = milli(min(r / 1000, max(l / 1000, fx)))
                vals[5] = milli(min(b / 1000, max(t / 1000, fy)))
            row.append(vals)
        chars.append(row)
    note = {
        "v": 1,
        "unit": "外接と焦点は画像幅・高さに対する千分率。末尾2つは計測した画像のピクセル幅と高さ。",
        "focus": "上から約42%の不透明ピクセルを、上にあるほど重くした重心。縦位置は外接の上から18%。",
        "minVisible": 0.6,
        "override": {str(k): {"name": names[k], "focus": list(v)} for k, v in OVERRIDE.items()},
        "layout": "[left, top, right, bottom, focusX, focusY, width, height]",
        "chars": chars,
    }
    OUT.write_text(json.dumps(note, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("focus", OUT, "chars", len(chars), "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
