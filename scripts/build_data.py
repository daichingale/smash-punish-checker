#!/usr/bin/env python3
"""raw/*.csv（検証窓フレームシートの gviz CSV）→ data/data.json に整形する。

方針
- 数値は捏造しない。解釈できない値は null にして logs/convert_log.txt に残す。
- シートは結合セルを使うため、CSV では結合範囲の先頭行にしか値が無い。
  → 同じ技グループ内の継続行は「判定持続」「全体フレーム」の空欄を直前行から引き継ぐ（ガード硬直は引き継がない）。
- 1つの技グループを次の単位で別の技に分割する:
    * 連続技の段（弱1/弱2/弱3/百裂、ソラの横強1〜3・空N1〜3 など）
    * 強弱（リュウ等の 強/中/弱）
    * 素材（スティーブの 木材/石/鉄/金/ダイヤモンド/装備なし）
  キーを持たない行は「共通」として、キー付き行より前なら全分割先の先頭に、
  「共通」と書かれた行は全分割先に、それ以外は直前のキーの技に属させる。
- リュウ等のガード硬直「10F/(12F)」はボタン入力/コマンド入力。→ ボタン版・コマンド版の2技にする。
"""
import csv, json, re, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, OUT, LOG = ROOT / "raw", ROOT / "data", ROOT / "logs"
log_lines = []

# 公式更新データで個別調整されたファイター（シートの古さ判定用）
ADJUSTED = {
    "2021/10/19": ["プリン", "ドクターマリオ", "ゼルダ", "ルカリオ", "ロゼッタ&チコ", "リトル・マック", "リドリー",
                   "キングクルール", "しずえ", "ガオガエン", "ジョーカー", "勇者"],  # Ver.13.0.0
    "2021/12/02": ["ドンキーコング", "リンク", "ピーチ", "デイジー", "アイスクライマー", "ファルコ", "ミュウツー", "メタナイト",
                   "ワリオ", "アイク", "ロックマン", "ロゼッタ&チコ", "ルフレ", "クッパ Jr.", "リュウ", "クラウド", "インクリング",
                   "リドリー", "パックンフラワー", "ミェンミェン", "スティーブ／アレックス", "ホムラ", "ヒカリ", "ソラ"],  # Ver.13.0.1
}
MATERIALS = ["装備なし", "木材", "石", "鉄", "金", "ダイヤモンド"]
MAT_ALIAS = {"ダイヤ": "ダイヤモンド"}
STRENGTHS = ["弱", "中", "強"]
NUMPAD = {"前": "6", "前上": "9", "上": "8", "後上": "7", "後": "4", "後下": "1", "下": "2", "前下": "3"}

def log(char, move, field, raw, reason):
    log_lines.append(f"[{char}] {move} / {field}: {raw!r} → {reason}")

def clean(s):
    return (s or "").replace("\u3000", " ").strip()

def one_line(s):
    return re.sub(r"\s*\n\s*", " ", clean(s)).strip()

SPECIAL_KEY = re.compile(r"^(NB|横B|上B|下B)\s*\((.*?)\)?$")
SEQ_KEY = re.compile(r"^(弱\d|横強\d|空N\d|空前\d|百裂)")
RYU_JAB = re.compile(r"^(弱\d)\s*\((強|弱)\)")

def parse_active(raw):
    s = one_line(raw)
    if not s:
        return None
    rehit = "Rehit" in s
    s2 = re.sub(r"/?\s*\((Rehit|反射)[^)]*\)", "", s)
    s2 = s2.replace("/", " ").strip().rstrip(",")
    if not re.fullmatch(r"[\d\s,\-]+", s2):
        return None
    starts, end = [], None
    for p in [p.strip() for p in s2.split(",") if p.strip()]:
        m = re.fullmatch(r"(\d+)(?:\s*-\s*(\d+))?", p)
        if not m:
            return None
        a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else a
        starts.append(a); end = b
    return {"starts": starts, "end": end, "rehit": rehit}

def parse_total(raw):
    m = re.match(r"^(\d+)", one_line(raw))
    return int(m.group(1)) if m else None

def parse_frames_list(s):
    vals = []
    for p in s.split("/"):
        p = p.strip()
        if p in ("-", ""):
            continue
        m = re.fullmatch(r"(\d+)F", p)
        if not m:
            return None
        vals.append(int(m.group(1)))
    return vals or None

def parse_stun(raw):
    """戻り値 (button, command, note)。
    '7F' / '7F/6F' → ([7,6], None)。'10F/(12F)' → ([10],[12])（ボタン/コマンド）。
    '(16F)' → (None,[16])（コマンド専用技）。溜め依存 '~'、'+' 付き、その他は解釈しない。"""
    s = one_line(raw)
    if not s or s == "-":
        return None, None, None
    if "~" in s or "+" in s:
        return None, None, "溜め・状況依存"
    m = re.fullmatch(r"(\d+F(?:/\d+F)*)[\s/]*\((\d+F(?:/\d+F)*)\)", s)
    if m:
        return parse_frames_list(m.group(1)), parse_frames_list(m.group(2)), "cmd"
    m = re.fullmatch(r"\((\d+F)\)", s)
    if m:
        return None, parse_frames_list(m.group(1)), "cmdonly"
    if "(" in s:
        return None, None, "括弧付きの値"
    v = parse_frames_list(s)
    return v, None, (None if v else "解釈不能")

def parse_damage(raw):
    s = one_line(raw)
    if not s:
        return None
    s = re.sub(r"\(([\d.]+)\)", "", s).strip(" /")
    vals = []
    for p in s.split("/"):
        try:
            vals.append(float(p.strip()))
        except ValueError:
            return None
    return vals

def label_tokens(label):
    return [t.strip() for t in one_line(label).replace("/", ",").split(",") if t.strip()]

def split_key(label, group):
    """行ラベルから分割キーを返す。(種類, 値) or None"""
    lab = one_line(label)
    m = RYU_JAB.match(lab)
    if m:
        return ("seq", f"{m.group(1)}（{m.group(2)}）")
    toks = label_tokens(lab)
    if toks and SEQ_KEY.match(toks[0]) and group["category"] in ("ground", "aerial"):
        return ("seq", SEQ_KEY.match(toks[0]).group(1))
    for t in toks:
        t2 = MAT_ALIAS.get(t, t)
        if t2 in MATERIALS:
            return ("mat", t2)
    for t in toks:
        if t in STRENGTHS:
            return ("str", t)
    if group.get("_hasCmdRow"):
        for t in toks:
            if t in ("通常", "コマンド"):
                return ("inp", t)
    if "派生あり" in lab:
        return ("drv", "稲妻派生")
    if "派生なし" in lab:
        return ("drv", "派生なし")
    return None

def command_from_notes(notes):
    """備考から入力コマンド（テンキー表記）を抽出。シートに書かれている数字列だけを使う。"""
    cmds = []
    for line in notes.split("\n"):
        if "右向き時" in line or line.strip().startswith("もしくは"):
            for d, inl in re.findall(r"\((\d{2,})(\+[A-Za-z]+)?\)", line):
                suffix = inl or ""
                m = re.search(r"\(" + d + r"\)\s*\+\s*([^\s/]+)", line)
                if m and not suffix: suffix = "+" + m.group(1)
                cmds.append(d + suffix)
    return " / ".join(dict.fromkeys(cmds)) or None

INPUT_KEYWORDS = ("右向き時", "もしくは", "ステップ中に", "同時か", "ボタンを離す", "ボタンリリース", "短押し", "長押し")
def input_note(notes):
    lines = [l.strip() for l in notes.split("\n") if any(k in l for k in INPUT_KEYWORDS)]
    return " / ".join(lines) or None

def parse_char(name, gid):
    rows = list(csv.reader(open(RAW / f"{gid}.csv", encoding="utf-8")))
    cname = re.sub(r"^\d+'?\.\s*", "", name)
    ch = {"name": cname, "sheetTab": name, "gid": gid, "lastUpdated": None, "jumpsquat": None,
          "stale": None, "moves": []}
    for i, r in enumerate(rows):
        for j, c in enumerate(r):
            c = clean(c)
            if c == "最終更新" and i + 1 < len(rows) and ch["lastUpdated"] is None:
                nxt = [clean(x) for x in rows[i + 1] if clean(x)]
                if nxt and re.match(r"\d{4}/\d{2}/\d{2}", nxt[0]):
                    ch["lastUpdated"] = nxt[0]
            if c == "ジャンプ踏切" and j + 1 < len(r):
                m = re.fullmatch(r"(\d+)F", clean(r[j + 1]))
                if m and ch["jumpsquat"] is None:
                    ch["jumpsquat"] = int(m.group(1))
    if ch["lastUpdated"] is None:  # 「最終更新」見出しが無いタブ: 冒頭8行にある日時セルを使う
        for r in rows[:8]:
            hit = [clean(x) for x in r if re.match(r"\d{4}/\d{2}/\d{2}", clean(x))]
            if hit:
                ch["lastUpdated"] = hit[0]; ch["lastUpdatedNote"] = "「最終更新」見出しなし。冒頭の日時セルを採用"
                log(cname, "-", "最終更新", hit[0], "見出しが無いため冒頭の日時セルを最終更新として採用")
                break
    if ch["jumpsquat"] is None:
        log(cname, "-", "ジャンプ踏切", None, "見つからない")
    lu = (ch["lastUpdated"] or "")[:10]
    for date, names in ADJUSTED.items():
        if cname in names and (not lu or lu < date):
            ch["stale"] = f"Ver.{'13.0.0' if date == '2021/10/19' else '13.0.1'}（{date}）で調整されたが、シートの最終更新は {lu or '不明'}。古い可能性あり"

    groups = []
    section, hdr, special, subsection, grp = None, None, None, None, None
    for i, raw_r in enumerate(rows):
        r = [clean(c) for c in raw_r] + [""] * 30
        c0 = r[0]
        if c0 in ("地上攻撃", "空中攻撃", "必殺ワザ", "つかみ・投げ"):
            section = {"地上攻撃": "ground", "空中攻撃": "aerial", "必殺ワザ": "special", "つかみ・投げ": "grab"}[c0]
            grp, subsection = None, None
            continue
        if c0 in ("投げ", "回避") or c0.startswith("共通動作") or c0 == "アイテム":
            section, grp = None, None
            continue
        if section is None:
            continue
        if "判定持続" in r:  # 見出し行
            hdr = {c: j for j, c in enumerate(r) if c}
            grp = None
            subsection = one_line(c0) or None
            if section == "special":
                m = SPECIAL_KEY.match(one_line(c0))
                special = {"key": m.group(1) if m else one_line(c0), "title": m.group(2) if m else "",
                           "projCol": hdr.get("飛び道具")}
            continue
        if hdr is None:
            continue
        if subsection == "その他" and section == "ground":
            continue  # アピール・作業台など
        idx = lambda k: hdr.get(k)
        if section == "grab":
            if c0 == "つかみ":
                grp = {"name": "つかみ", "category": "grab", "rows": [], "notes": ""}
                groups.append(grp)
            elif c0:
                grp = None
            if grp is None:
                continue
        elif section == "special":
            if c0:
                v = one_line(c0)
                vname = "地上" if re.fullmatch(r"地上\s*\(空中\)", v) else v
                grp = {"name": special["key"] if v == "地上・空中" else f"{special['key']}（{vname}）",
                       "category": "special", "group": special["key"], "variant": v, "title": special["title"],
                       "projectile": False, "rows": [], "notes": ""}
                groups.append(grp)
            if grp is None:
                continue
            if special["projCol"] is not None and r[special["projCol"]] == "TRUE":
                grp["projectile"] = True
        else:
            if c0:
                nm = one_line(c0).lstrip("/").strip()
                nm = re.sub(r"^\((.*)\)$", r"\1", nm)
                cat = section
                if section == "ground" and subsection in ("特殊コマンドワザ・その他", "特殊コマンドワザ"):
                    cat = "command"
                grp = {"name": nm, "category": cat, "rows": [], "notes": ""}
                groups.append(grp)
            if grp is None:
                continue
        prev = grp["rows"][-1] if grp["rows"] else None
        a_raw = raw_r[idx("判定持続")] if idx("判定持続") is not None else ""
        t_raw = raw_r[idx("全体フレーム")] if idx("全体フレーム") is not None else ""
        inh = []
        if not clean(a_raw) and prev and prev["activeRaw"]:
            a_raw = prev["activeRaw"]; inh.append("判定持続")
        if not clean(t_raw) and prev and prev["totalRaw"]:
            t_raw = prev["totalRaw"]; inh.append("全体フレーム")
        ll_raw = raw_r[idx("着地隙")] if (idx("着地隙") is not None and section == "aerial") else ""
        if section == "aerial" and not clean(ll_raw) and prev and prev.get("landingLagRaw"):
            ll_raw = prev["landingLagRaw"]; inh.append("着地隙")
        note = raw_r[idx("備考")] if idx("備考") is not None and idx("備考") < len(raw_r) else ""
        if section in ("aerial",):
            note = ""
        if note:
            grp["notes"] += ("\n" if grp["notes"] else "") + note
        grp["rows"].append({
            "label": one_line(r[1]), "activeRaw": one_line(a_raw), "totalRaw": one_line(t_raw),
            "damageRaw": one_line(raw_r[idx("基礎ダメージ")]) if idx("基礎ダメージ") is not None else "",
            "stunRaw": one_line(raw_r[idx("ガード硬直")]) if idx("ガード硬直") is not None and section != "grab" else "",
            "landingLagRaw": one_line(ll_raw),
            "inherited": inh, "rowNote": one_line(note),
        })

    # ---- 分割 ----
    moves = []
    for g in groups:
        g["_hasCmdRow"] = any("コマンド" in label_tokens(row["label"]) for row in g["rows"])
        keyed = [(row, split_key(row["label"], g)) for row in g["rows"]]
        kinds = {k[0] for _, k in keyed if k}
        if not kinds:
            parts = [(None, g["rows"])]
        else:
            order, buckets, prefix, common, cur = [], {}, [], [], None
            for row, k in keyed:
                if k:
                    cur = k[1]
                    if cur not in buckets:
                        buckets[cur] = list(prefix); order.append(cur)
                    buckets[cur].append(row)
                elif "共通" in row["label"]:
                    common.append(row)
                    for b in buckets.values(): b.append(row)
                elif cur is None:
                    prefix.append(row)
                else:
                    buckets[cur].append(row)
            # 「共通」行がキー行より前にある場合も全分割先へ
            kind = sorted(kinds)[0]
            if kind == "drv" and prefix and "派生なし" not in buckets:
                # 鉈落とし蹴り: キー無しの先頭行（Hit 1/2）は派生なし版。派生あり版には含めない
                for k in order:
                    buckets[k] = [x for x in buckets[k] if x not in prefix]
                buckets["派生なし"] = list(prefix); order.insert(0, "派生なし")
            parts = [(k, buckets[k]) for k in order]
            g["_kind"] = kind
        for key, rws in parts:
            m = {k: v for k, v in g.items() if k not in ("rows", "_kind", "_hasCmdRow")}
            m["rows"] = [dict(x) for x in rws]
            if key:
                kind = g.get("_kind")
                if kind == "seq":
                    m["name"] = key; m["seqOf"] = g["name"]
                elif kind == "mat":
                    m["material"] = key
                elif kind == "str":
                    m["strength"] = key
                    m["name"] = f"{g['name']}（{key}）"
                elif kind == "inp":
                    m["input"] = "button" if key == "通常" else "command"
                    m["name"] = f"{g['name']}［{'ボタン' if key == '通常' else 'コマンド'}］"
                elif kind == "drv":
                    m["name"] = f"{g['name']}（{key}）"
            moves.append(m)

    # ---- 値の解釈・コマンド版の生成 ----
    group_notes = {}
    for g in groups:
        if g["category"] == "special":
            group_notes.setdefault((g["group"], g.get("title")), []).append(g.get("notes") or "")
    final = []
    for m in moves:
        notes = m.pop("notes", "") or ""
        gnotes = "\n".join(group_notes.get((m.get("group"), m.get("title")), [])) if m["category"] == "special" else ""
        m["command"] = command_from_notes(notes) or (command_from_notes(gnotes) if gnotes else None)
        m["inputNote"] = input_note(notes) or (input_note(gnotes) if gnotes else None)
        m["specialShield"] = ("ガードさせた際に特殊仕様" in notes) or ("シールドヒット時に特殊仕様" in notes)
        m["guardNote"] = None
        if "シールド不可" in notes or "ガード不可" in notes:
            m["guardNote"] = "シールド（ガード）不可の判定を含む"
        # Kazuya の強攻撃: 方向をテンキー表記に（右向き基準）
        mm = re.match(r"^(強攻撃|しゃがみ), (前上|前下|後上|後下|前|上|後|下)", m["name"])
        if mm and not m["command"]:
            m["command"] = ("しゃがみ中 " if mm.group(1) == "しゃがみ" else "") + NUMPAD[mm.group(2)] + "+攻撃"
            m["commandDerived"] = True
        has_cmd = False
        for row in m["rows"]:
            lbl = f"{m['name']}{' '+row['label'] if row['label'] else ''}"
            row["active"] = parse_active(row["activeRaw"])
            if row["activeRaw"] and row["active"] is None:
                log(ch["name"], lbl, "判定持続", row["activeRaw"], "解釈不能（この行は計算に使わない）")
            row["total"] = parse_total(row["totalRaw"])
            if row["totalRaw"] and row["total"] is None:
                log(ch["name"], lbl, "全体フレーム", row["totalRaw"], "数値で始まらない（不明扱い）")
            row["damage"] = parse_damage(row["damageRaw"])
            if row["damageRaw"] and row["damage"] is None:
                log(ch["name"], lbl, "基礎ダメージ", row["damageRaw"], "解釈不能")
            b, c, why = parse_stun(row["stunRaw"])
            row["stun"], row["stunCmd"] = b, c
            if c is not None:
                has_cmd = True
            if row["stunRaw"] and b is None and c is None:
                log(ch["name"], lbl, "ガード硬直", row["stunRaw"], f"解釈不能（{why}）→ この行は硬直差計算に使わない")
            ll = row.pop("landingLagRaw", "")
            row["landingLag"] = int(ll) if re.fullmatch(r"\d+", ll or "") else None
            if ll and row["landingLag"] is None:
                log(ch["name"], lbl, "着地隙", ll, "解釈不能")
        if m["category"] == "aerial":
            m["landingLag"] = next((x["landingLag"] for x in m["rows"] if x["landingLag"] is not None), None)
            if m["landingLag"] is None:
                log(ch["name"], m["name"], "着地隙", None, "見つからない → 相手側の硬直差は計算しない")
        if has_cmd:
            only_cmd = all(r["stun"] is None for r in m["rows"] if r["stunCmd"] is not None)
            if not only_cmd:
                btn = json.loads(json.dumps(m)); btn["input"] = "button"; btn["name"] += "［ボタン］"
                btn["command"] = None
                for r in btn["rows"]: r.pop("stunCmd", None)
                final.append(btn)
            cmd = json.loads(json.dumps(m)); cmd["input"] = "command"
            if not only_cmd:
                cmd["name"] += "［コマンド］"
            for r in cmd["rows"]:
                if r.get("stunCmd") is not None:
                    r["stun"] = r["stunCmd"]
                r.pop("stunCmd", None)
            final.append(cmd)
        else:
            for r in m["rows"]: r.pop("stunCmd", None)
            if m.get("input") is None:
                m["input"] = "command" if m["category"] == "command" else None
            if m["input"] == "button":
                m["command"] = None
            final.append(m)
    # 風神ステップ派生（カズヤ）: シート記載の「風神ステップ(623)中に…」を入力表記にまとめる
    step = next((m for m in final if m["name"] == "風神ステップ" and m.get("command")), None)
    for m in final:
        note = m.get("inputNote") or ""
        if step and not m.get("command") and "風神ステップ中に" in note:
            m["command"] = f"{step['command']}（風神ステップ）中に " + note.split("風神ステップ中に", 1)[1].split(" / ")[0].strip()
            m["commandDerived"] = True
        elif step and not m.get("command") and "3と同時か1F後" in note:
            m["command"] = f"{step['command']}+攻撃（" + note.split(" / ")[0].strip() + "）"
            m["commandDerived"] = True
        if m["category"] == "special" and m.get("input") is None:
            gn = "\n".join(group_notes.get((m.get("group"), m.get("title")), []))
            if m.get("variant") == "通常" and "下溜め + 攻撃" in gn:
                m["input"], m["command"] = "button", None
            elif m.get("variant") == "コマンド" and "下溜め + 攻撃" in gn:
                m["input"], m["command"] = "command", "下溜め + 攻撃 or 必殺"
            elif m.get("command"):
                m["input"] = "command"  # 超必殺ワザ・灼熱波動拳などコマンド専用
        if "下B入力" in (m.get("variant") or ""):
            m["command"], m["inputNote"], m["commandDerived"] = "下B（ボタン）", None, False
    for k, m in enumerate(final):
        m["id"] = f"{ch['gid']}-{k}"
    ch["moves"] = [m for m in final if m["rows"]]
    ch["materials"] = [x for x in MATERIALS if any(m.get("material") == x for m in ch["moves"])]
    return ch

def main():
    idx = json.load(open(RAW / "index.json", encoding="utf-8"))
    chars = [parse_char(n, g) for n, g in idx["tabs"].items()]
    data = {
        "meta": {
            "source": "スマブラSP フレームデータ（スマブラSPECIAL 検証wiki / 検証窓 フレームシート）",
            "sourceUrl": f"https://docs.google.com/spreadsheets/d/{idx['sheet_id']}/edit",
            "wikiUrl": "https://w.atwiki.jp/smashsp_kensyou/",
            "fetchedAt": idx["fetched_at"],
            "builtAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "gameVersionNote": "最終バランス調整は Ver.13.0.1 (2021/12/02)。",
        },
        "chars": chars,
    }
    OUT.mkdir(exist_ok=True); LOG.mkdir(exist_ok=True)
    (OUT / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (LOG / "convert_log.txt").write_text(
        f"# 変換ログ（{data['meta']['builtAt']}）: 解釈できず計算に使わなかった値の一覧\n" + "\n".join(log_lines) + "\n", encoding="utf-8")
    for c in chars:
        print(c["name"], c["lastUpdated"], "JS", c["jumpsquat"], "moves", len(c["moves"]), "stale" if c["stale"] else "", c["materials"] or "")
    print("log lines:", len(log_lines))

if __name__ == "__main__":
    main()
