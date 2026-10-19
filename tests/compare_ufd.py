#!/usr/bin/env python3
"""Ultimate Frame Data（英語圏の公開フレームデータ）と、data.json＋calc.js の計算結果を照合する。
UFD のページは一度だけ取得して tests/ufd_cache/ に保存（再実行時はキャッシュを使う）。
照合項目: 発生F・全体F（地上技）、ガード硬直差（UFD の advantage 列の先頭値、= 最速判定/最初の判定）。"""
import json, re, subprocess, time, urllib.request, pathlib, html
ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tests" / "ufd_cache"
SLUG = {"マリオ": "mario", "ドンキーコング": "donkey_kong", "フォックス": "fox", "ピカチュウ": "pikachu", "マルス": "marth",
        "ロイ": "roy", "ゲッコウガ": "greninja", "クラウド": "cloud", "ソニック": "sonic", "ソラ": "sora",
        "リュウ": "ryu", "カズヤ": "kazuya", "スティーブ／アレックス": "steve",
        # 全キャラ収録で追加したキャラからの抜き取り
        "ケン": "ken", "テリー": "terry", "ルキナ": "lucina", "ピーチ": "peach", "ジョーカー": "joker",
        "ガオガエン": "incineroar", "ベヨネッタ": "bayonetta", "格闘Mii": "mii_brawler"}
NEW = {"ケン", "テリー", "ルキナ", "ピーチ", "ジョーカー", "ガオガエン", "ベヨネッタ", "格闘Mii"}
NAME = {"Jab 1": "弱1", "Forward Tilt": "横強", "Up Tilt": "上強", "Down Tilt": "下強", "Dash Attack": "ダッシュ攻撃",
        "Forward Smash": "横スマッシュ", "Up Smash": "上スマッシュ", "Down Smash": "下スマッシュ",
        "Neutral Air": "空N", "Forward Air": "空前", "Back Air": "空後", "Up Air": "空上", "Down Air": "空下"}

def ufd(slug):
    f = CACHE / f"{slug}.html"
    if not f.exists():
        req = urllib.request.Request(f"https://ultimateframedata.com/{slug}", headers={"User-Agent": "Mozilla/5.0"})
        f.write_text(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"), encoding="utf-8")
        time.sleep(1.5)
    s = f.read_text(encoding="utf-8")
    out = {}
    for blk in s.split('<div class="movecontainer')[1:]:
        g = lambda c: (lambda m: html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else "")(re.search(r'<div class="' + c + r'">(.*?)</div>', blk, re.S))
        nm = g("movename")
        if nm in NAME and nm not in out:
            out[nm] = {"startup": g("startup"), "total": g("totalframes"), "adv": g("advantage"), "stun": g("shieldstun")}
    return out

def first_int(s):
    m = re.search(r"-?\d+", s or "")
    return int(m.group(0)) if m else None

def main():
    ours = json.loads(subprocess.check_output(["node", str(ROOT / "tests" / "dump_calc.js")], text=True))
    rows, agree, total = [], 0, 0
    per = {}
    for ch, slug in SLUG.items():
        try:
            u = ufd(slug)
        except Exception as e:
            print("UFD 取得失敗:", ch, slug, e); continue
        for en, jp in NAME.items():
            if en not in u or jp not in ours.get(ch, {}):
                continue
            o = ours[ch][jp]; x = u[en]
            for field, uv, ov in (("発生", first_int(x["startup"]), o["startup"]), ("全体", first_int(x["total"]), o["total"]),
                                  ("硬直差", first_int(x["adv"]), (-o["first"] if o["first"] is not None else None))):
                if uv is None or ov is None:
                    continue
                total += 1; ok = uv == ov; agree += ok
                pc = per.setdefault(ch, [0, 0]); pc[0] += 1; pc[1] += ok
                if not ok:
                    rows.append(f"| {ch} | {jp} | {field} | UFD {uv} | 本サイト {ov} | UFDガード硬直 {x['stun']} / 検証窓 {o['stun']} |")
    report = [f"# Ultimate Frame Data との照合結果", "",
              f"- 照合項目数: {total} / 一致: {agree} / 不一致: {total-agree}（一致率 {agree/total*100:.1f}%）",
              "- 硬直差は UFD の advantage 列の先頭値と、画面と同じ有利（多段は通常の最終段、硬直は大きい方、前と後ろがある技は正面、ヒット時のバウンドは全体F、アルセーヌは主数値にしない）を比較。",
              "- UFD が複数の硬直差を並べているときは先頭の一つだけと比べる。画面がそのうちの別の段と一致していても、先頭と違えば不一致になる。", "",
              "## キャラ別", "", "| キャラ | 照合数 | 一致 | 一致率 | 備考 |", "|---|---|---|---|---|"] + [
              f"| {c} | {n} | {k} | {k/n*100:.0f}% | {'今回追加' if c in NEW else ''} |" for c, (n, k) in per.items()] + ["",
              "## 不一致一覧", "", "| キャラ | 技 | 項目 | UFD | 本サイト | 備考 |", "|---|---|---|---|---|---|"] + rows
    (ROOT / "tests" / "ufd_compare.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report[:4])); print("\n".join(l for l in report if l.startswith("| ") and "%" in l))

if __name__ == "__main__":
    main()
