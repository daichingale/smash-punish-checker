#!/usr/bin/env python3
"""検証窓フレームシート（公開Googleスプレッドシート）から対象キャラのタブを gviz CSV で取得し raw/ に保存する。
低頻度・1回限りの取り込み用。サーバー負荷を避けるため 1.5 秒間隔で取得する。"""
import json, re, time, urllib.request, pathlib

SHEET_ID = "15SClMwvDIqovtO3DJnf1GGIteH35UX3IM7-mnbdG6eE"
ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
UA = {"User-Agent": "Mozilla/5.0 (smash-punish prototype; one-off import)"}

# 収録キャラ: 人気キャラのうち「シートの最終更新」が「そのキャラが最後に調整されたバージョン」より後のもの
# (最終バランス調整 Ver.13.0.1 = 2021/12/02)
TARGETS = ["1. マリオ", "2. ドンキーコング", "7. フォックス", "8. ピカチュウ", "21. マルス",
           "25. ロイ", "50. ゲッコウガ", "61. クラウド", "38. ソニック", "82. ソラ",
           "60. リュウ", "81. カズヤ", "77. スティーブ／アレックス"]
# スティーブはシート最終更新(2021/07/02)が最終調整(Ver.13.0.1)より前 → UIで「データが古い可能性」を表示する

import sys
ALL = "--all" in sys.argv  # 全ファイタータブ（ダッシュファイター・DLC・Mii を含む）

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf-8")

def main():
    RAW.mkdir(exist_ok=True)
    html = get(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/htmlview")
    tabs = {}
    for name, gid in re.findall(r'\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)', html):
        name = re.sub(r"\\x([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), name)
        tabs[name] = gid
    index = {}
    targets = [t for t in tabs if re.match(r"^\d+'?\. ", t)] if ALL else TARGETS
    for t in targets:
        gid = tabs.get(t)
        if not gid:
            print("タブが見つからない:", t); continue
        cached = RAW / f"{gid}.csv"
        if "--refresh" not in sys.argv and cached.exists():
            index[t] = gid; print("キャッシュ:", t); continue
        csv = get(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&gid={gid}")
        (RAW / f"{gid}.csv").write_text(csv, encoding="utf-8")
        index[t] = gid
        print("取得:", t, gid, len(csv), "bytes")
        time.sleep(1.5)
    (RAW / "index.json").write_text(json.dumps({"sheet_id": SHEET_ID, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "tabs": index}, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
