#!/usr/bin/env python3
"""公式の Mii 集合画像から、格闘・剣術・射撃を1体ずつ抜き出す。

smashbros.com のファイターページ、英語版、色違い、Miiコスチューム告知を探しても、
デフォルトの3体を1人ずつ描いた公式レンダーは無かった。あるのは集合の main.png だけ。

矩形では隣の体が残るので、色の種から不透明領域を辿り、各ピクセルを一番近い体へ渡す。
重なって隠れた部分は補わない。隣の体の色が境界に残ったら落とす。
"""
import heapq
import pathlib
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from fetch_fighters import CACHE, to_hires, to_webp  # noqa: E402

SRC = "https://www.smashbros.com/assets_v2/img/fighter/mii_fighter/main.png"
# ロスター順。画像の並びは左が射撃、中央が剣術、右が格闘。
ORDER = (("gunner", 57), ("sword", 56), ("brawler", 55))


def classify(rgb, alpha):
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    H, S, V = [hsv[:, :, i].astype(np.int16) for i in range(3)]
    R, G, B = [rgb[:, :, i].astype(np.int16) for i in range(3)]
    opaque = alpha > 20
    red = opaque & (((H <= 10) | (H >= 170)) & (S >= 80) & (V >= 50) & (R >= 100) & (G < 130) & (B < 120))
    gold = opaque & (R > 150) & (G > 90) & (B < 130) & (R > B + 30) & ~red
    cyan = opaque & (B > 140) & (G > 100) & (R < 170) & (B > R + 15)
    blue = opaque & (B > 70) & (B > R + 20) & (R < 160) & ~cyan
    return opaque, red, gold, cyan, blue


def segment(rgb, alpha):
    """半解像度で辿り、各ピクセルを gunner=1 / sword=2 / brawler=3 にする。"""
    small = cv2.resize(np.dstack([rgb, alpha]), (rgb.shape[1] // 2, rgb.shape[0] // 2), interpolation=cv2.INTER_AREA)
    opaque, red, gold, cyan, blue = classify(small[:, :, :3], small[:, :, 3])
    h, w = opaque.shape
    ys, xs = np.indices((h, w))
    seed = np.zeros((h, w), np.uint8)
    seed[cyan | (gold & (xs < 260))] = 1
    seed[red & (xs > 200) & (xs < 470)] = 2
    seed[(blue & (xs > 430)) | ((small[:, :, 0] > 180) & (small[:, :, 1] > 140) & (small[:, :, 2] > 120) & (xs > 470) & (ys < 180))] = 3
    sig = np.zeros((h, w), np.uint8)
    sig[gold & (xs < 320)] = 1
    sig[cyan] = 1
    sig[red & (xs > 190) & (xs < 480)] = 2
    sig[blue & (xs > 400)] = 3
    dist = np.full((h, w), 10 ** 9, np.int32)
    lab = np.zeros((h, w), np.uint8)
    pq = []
    for y, x in zip(*np.where(seed > 0)):
        dist[y, x] = 0
        lab[y, x] = seed[y, x]
        pq.append((0, int(y), int(x)))
    heapq.heapify(pq)
    nbr = ((1, 0), (-1, 0), (0, 1), (0, -1))
    while pq:
        d, y, x = heapq.heappop(pq)
        if d != dist[y, x]:
            continue
        here = lab[y, x]
        for dy, dx in nbr:
            ny, nx = y + dy, x + dx
            if ny < 0 or nx < 0 or ny >= h or nx >= w or not opaque[ny, nx]:
                continue
            cost = 3
            s = int(sig[ny, nx])
            if s and s != here:
                cost += 28
            if here == 1 and nx > 340:
                cost += 6
            if here == 3 and nx < 360:
                cost += 6
            if here == 2 and (nx < 180 or nx > 500):
                cost += 8
            nd = d + cost
            if nd < dist[ny, nx]:
                dist[ny, nx] = nd
                lab[ny, nx] = here
                heapq.heappush(pq, (nd, ny, nx))
    lab[cyan | (gold & (xs < 240))] = 1
    lab[red & (xs > 210) & (xs < 450)] = 2
    lab[blue & (xs > 450)] = 3
    full = cv2.resize(lab, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_NEAREST)
    full[alpha <= 20] = 0
    # フル解像度でも、体の色は持ち主に固定する
    opaque, red, gold, cyan, blue = classify(rgb, alpha)
    ys, xs = np.indices(opaque.shape)
    full[cyan | (gold & (xs < rgb.shape[1] * 0.42))] = 1
    full[red & (xs > rgb.shape[1] * 0.30) & (xs < rgb.shape[1] * 0.68)] = 2
    full[blue & (xs > rgb.shape[1] * 0.62)] = 3
    return full, red, blue, cyan


def largest(mask):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == i


def drop_loose_shadow(mask, rgb):
    """体から離れた黒い床影だけ外す。剣の赤い刃は残す。"""
    dark = mask & (rgb[:, :, 0] < 28) & (rgb[:, :, 1] < 28) & (rgb[:, :, 2] < 28)
    core = (mask & ~dark).astype(np.uint8)
    if not core.any():
        return mask
    inv = np.where(core, 0, 255).astype(np.uint8)
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 3)
    return mask & ~(dark & (dist > 36))


def cut(src):
    rgb = src[:, :, :3]
    alpha = src[:, :, 3]
    lab, red, blue, cyan = segment(rgb, alpha)
    masks = {1: largest(lab == 1), 2: largest(lab == 2), 3: largest(lab == 3)}
    # 境界に乗った隣の体の色を落とす
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k12 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    near_g = cv2.dilate(masks[1].astype(np.uint8), k12) > 0
    near_s = cv2.dilate(masks[2].astype(np.uint8), k12) > 0
    near_b = cv2.dilate(masks[3].astype(np.uint8), k12) > 0
    # 境目に乗った隣の体の色だけ落とす。自分の服の色は残す。
    masks[1] = masks[1] & ~(red & near_s)
    masks[1] = masks[1] & ~(blue & near_b)
    masks[2] = masks[2] & ~(cyan & near_g)
    masks[2] = masks[2] & ~(blue & (near_g | near_b))
    masks[3] = masks[3] & ~(red & near_s)
    masks[3] = masks[3] & ~(cyan & near_g)
    # 剣術の左端に残る射撃側の青い断片。剣術自身の紺はもっと右にある。
    xs = np.indices(blue.shape)[1]
    masks[2] = masks[2] & ~(blue & (xs < 520))
    out = {}
    for key, name in ((1, "gunner"), (2, "sword"), (3, "brawler")):
        m = largest(drop_loose_shadow(masks[key], rgb))
        out[name] = m
    return out


def trim(src, mask, pad=4):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise SystemExit("empty mask")
    h, w = mask.shape
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + 1 + pad)
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + 1 + pad)
    crop = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    part = src[y0:y1, x0:x1]
    m = mask[y0:y1, x0:x1]
    crop[m] = part[m]
    return crop


def write_webps(layers):
    ids = {"brawler": 55, "sword": 56, "gunner": 57}
    for name, im in layers.items():
        i = ids[name]
        for color in range(1, 9):
            to_webp(im, ROOT / "fighters" / str(i) / f"{color}.webp")
            to_hires(im, ROOT / "fighters" / "hires" / str(i) / f"{color}.webp")
        print(name, i, im.size)


def main():
    if "--write" not in sys.argv:
        print("Mii の同梱画像は SmashWiki の公式絵。この輪郭抜きでは上書きしない。")
        return
    path = CACHE / "mii_fighter" / "1.png"
    if not path.exists():
        raise SystemExit(f"missing {path} (download {SRC})")
    src = np.array(Image.open(path).convert("RGBA"))
    masks = cut(src)
    # 重なりが残っていないこと
    names = ("gunner", "sword", "brawler")
    for a, b in (("gunner", "sword"), ("gunner", "brawler"), ("sword", "brawler")):
        both = int((masks[a] & masks[b]).sum())
        if both:
            raise SystemExit(f"overlap {a} {b} {both}")
    layers = {name: Image.fromarray(trim(src, masks[name])) for name in names}
    write_webps(layers)
    for name, im in layers.items():
        im.save(f"/tmp/mii-src/final-{name}.png")
        print("final", name, im.size)


if __name__ == "__main__":
    main()
