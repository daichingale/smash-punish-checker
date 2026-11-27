// 計算ロジックの単体テスト（node --test tests/）
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/calc.js");
const data = require("../data/data.json");

const row = (o) => ({ label: "", damage: [5], stun: null, total: null, active: null, ...o });
const act = (starts, end, rehit = false) => ({ starts, end, rehit });

test("wiki の例: スネーク上強（発生6F・全体37F・ガード硬直13F）→ ガード側18F有利", () => {
  const mv = { name: "上強", category: "ground", rows: [row({ active: act([6], 6), total: 37, stun: [13] })] };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.ok, true);
  assert.equal(a.primary, 18);
});

test("wiki の例: 空中攻撃は 着地隙 − ガード硬直（ピーチ空前先端 着地隙13F・硬直5F → 8F）", () => {
  const mv = { name: "空前", category: "aerial", landingLag: 13, rows: [row({ active: act([15], 18), stun: [5] })] };
  assert.equal(C.shieldAdvantage(mv).primary, 8);
});

test("wiki の例: 18F有利なら シールド解除の技は発生7Fまで・ガーキャンつかみは14Fまで・ガーキャン空中は15Fまで", () => {
  const att = { name: "A", moves: [] };
  const mv = { name: "X", category: "ground", rows: [row({ active: act([6], 6), total: 37, stun: [13] })] };
  const mk = (name, category, s, extra = {}) => ({ name, category, rows: [row({ active: act([s], s + 1), label: extra.label || "" })], ...extra });
  const def = { name: "D", jumpsquat: 3, moves: [
    mk("弱1", "ground", 7), mk("横強", "ground", 8),
    { name: "つかみ", category: "grab", rows: [row({ label: "その場", active: act([14], 15), damage: null })] },
    { name: "つかみB", category: "grab", rows: [row({ label: "その場", active: act([15], 16), damage: null })] },
    mk("空N", "aerial", 15), mk("空前", "aerial", 16),
    mk("上スマッシュ", "ground", 18), mk("上B", "special", 19, { group: "上B", variant: "地上・空中" }),
  ] };
  const r = C.evaluate(att, mv, def, {});
  const st = Object.fromEntries(r.list.map((x) => [x.move.name, x.status]));
  assert.equal(st["弱1"], "sure");  // 猶予0F
  assert.equal(st["横強"], "impossible");
  assert.equal(st["つかみ"], "sure");
  assert.equal(st["つかみB"], "impossible");
  assert.equal(st["空N"], "sure");
  assert.equal(st["空前"], "impossible");
  assert.equal(st["上スマッシュ"], "sure");
  assert.equal(st["上B"], "impossible");
  const m = Object.fromEntries(r.list.map((x) => [x.move.name, x.margin]));
  assert.equal(m["弱1"], 0); assert.equal(m["上スマッシュ"], 0); assert.equal(m["空N"], 0);
});

test("ジャストシールド: 攻撃側+3F・解除11F/つかみ4F不要（wiki: 18F有利→地上技21F・つかみ21F・空中18Fまで）", () => {
  const mv = { name: "X", category: "ground", rows: [row({ active: act([6], 6), total: 37, stun: [13] })] };
  const mk = (name, category, s) => ({ name, category, rows: [row({ active: act([s], s), label: category === "grab" ? "その場" : "", damage: category === "grab" ? null : [5] })] });
  const def = { name: "D", jumpsquat: 3, moves: [mk("弱1", "ground", 21), mk("つかみ", "grab", 21), mk("空N", "aerial", 18), mk("空前", "aerial", 19)] };
  const st = Object.fromEntries(C.evaluate({ name: "A" }, mv, def, { perfectShield: true }).list.map((x) => [x.move.name, x.status]));
  assert.deepEqual(st, { "弱1": "sure", "つかみ": "sure", "空N": "sure", "空前": "impossible" });
});

test("密着前提: フレームが間に合えば『確定』、足りなければ『不可』", () => {
  const mv = { name: "X", category: "ground", rows: [row({ active: act([5], 5), total: 40, stun: [5] })] };
  const def = { name: "D", jumpsquat: 3, moves: [
    { name: "上スマッシュ", category: "ground", rows: [row({ active: act([30], 31) })] },
    { name: "横スマッシュ", category: "ground", rows: [row({ active: act([20], 21) })] },
  ] };
  const st = Object.fromEntries(C.evaluate({ name: "A" }, mv, def, {}).list.map((x) => [x.move.name, x.status]));
  assert.deepEqual(st, { "上スマッシュ": "sure", "横スマッシュ": "impossible" });
});

test("猶予ラベル: 0〜THRESHOLDS.severeMax はシビア、THRESHOLDS.easyMin 以上は余裕、その間と負はラベルなし", () => {
  const T = C.THRESHOLDS;
  assert.equal(T.severeMax, 2); assert.equal(T.easyMin, 8);
  assert.equal(C.marginTier(0), "severe"); assert.equal(C.marginTier(T.severeMax), "severe");
  assert.equal(C.marginTier(T.severeMax + 1), null); assert.equal(C.marginTier(T.easyMin - 1), null);
  assert.equal(C.marginTier(T.easyMin), "easy"); assert.equal(C.marginTier(-1), null);
});

test("並び順: 確定を猶予の大きい順、その後に不可", () => {
  const mv = { name: "X", category: "ground", rows: [row({ active: act([5], 5), total: 40, stun: [5] })] }; // 30F有利
  const mk = (n, s) => ({ name: n, category: "ground", rows: [row({ active: act([s], s) })] });
  const def = { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 20), mk("弱1", 5), mk("横強", 15), mk("下強", 40)] };
  const r = C.evaluate({ name: "A" }, mv, def, {}).list;
  assert.deepEqual(r.map((x) => x.move.name), ["弱1", "上スマッシュ", "横強", "下強"]);
  for (let i = 1; i < r.length; i++) if (r[i].status === r[i - 1].status) assert.ok(r[i - 1].margin >= r[i].margin);
});

test("注意バッジは廃止: 結果に caution が無く、cautions も公開しない", () => {
  const mv = { name: "横スマ", category: "ground", rows: [row({ active: act([10], 12), total: 60, stun: [20] })] };
  const def = { name: "D", jumpsquat: 3, moves: [
    { name: "上スマッシュ", category: "ground", rows: [row({ active: act([5], 6) })] },
    { name: "風神拳", category: "command", input: "command", rows: [row({ active: act([8], 11) })] },
  ] };
  const r = C.evaluate({ name: "A" }, mv, def, {}).list;
  assert.ok(r.length === 2 && r.every((x) => x.status === "sure" && !("caution" in x)));
  assert.equal(C.cautions, undefined); assert.equal(C.THRESHOLDS.longStun, undefined);
});

test("不可にはラベルを付けない", () => {
  const mv = { name: "X", category: "ground", rows: [row({ active: act([5], 5), total: 12, stun: [5] })] };
  const def = { name: "D", jumpsquat: 3, moves: [{ name: "風神拳", category: "command", input: "command", rows: [row({ active: act([8], 11) })] }] };
  const x = C.evaluate({ name: "A" }, mv, def, {}).list[0];
  assert.equal(x.status, "impossible"); assert.equal(x.tier, null);
});

test("多段技は最終段、複数のガード硬直は大きい方（ガード側に不利な側）を採用", () => {
  const mv = { name: "下スマッシュ", category: "ground", rows: [
    row({ label: "Hit 1", active: act([5], 6), total: 43, stun: [7] }),
    row({ label: "Hit 2", active: act([14], 14), stun: [8, 9], total: 43 }),
  ] };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.primary, 43 - 14 - 9);
  assert.equal(a.multiHit, true);
});

test("判定の終わり際（持続の最後）でガードした場合の値 worst を併記", () => {
  const mv = { name: "DA", category: "ground", rows: [row({ active: act([6], 9), total: 37, stun: [14] }), row({ label: "持続", active: act([10], 25), total: 37, stun: [11] })] };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.primary, 17);
  assert.equal(a.worst, 37 - 25 - 11);
});

test("20-* は開始Fだけ使い、終わり際の有利Fは作らない", () => {
  const mv = { name: "空下", category: "aerial", landingLag: 18, rows: [
    row({ active: { starts: [20], end: 20, rehit: false, open: true }, stun: [6], damage: [18] }),
    row({ label: "着地, 対地のみ", active: act([1], 2), stun: [3], damage: [8] }),
    row({ label: "失敗", active: act([1], 2), damage: null, stun: null }),
  ] };
  assert.equal(C.startupOf(mv), 20);
  const a = C.shieldAdvantage(mv);
  assert.equal(a.primary, 12);
  assert.equal(a.lateUnknown, true);
  assert.equal(a.worst, 12);
});

test("開始が全体Fより後の窓は、より早い窓があるときだけ捨てる", () => {
  const charged = { name: "横スマ", category: "ground", rows: [
    row({ label: "横スマ1", active: act([17], 18), total: 50, stun: [10] }),
    row({ label: "最大", active: act([79], 126), total: 50, stun: [9] }),
  ] };
  const a = C.shieldAdvantage(charged);
  assert.equal(a.primary, 23);
  assert.equal(a.worst, 22);
  const onlyLate = { name: "下B", category: "special", rows: [row({ active: act([79], 79), total: 41, stun: [3] })] };
  const b = C.shieldAdvantage(onlyLate);
  assert.equal(b.ok, true);
  assert.equal(b.primary, 41 - 79 - 3);
});

test("空中着地の必殺は着地隙−ガード硬直で、反撃手段には入れない", () => {
  const mv = { name: "横B", category: "special", group: "横B", variant: "地上・空中", landingVariant: "空中（着地）", landingLag: 12, rows: [row({ active: act([18], 37), total: 55, stun: [3] })] };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.ok, true);
  assert.equal(a.aerial, true);
  assert.equal(a.landingLag, 12);
  assert.equal(a.primary, 9);
  const ch = { name: "N", jumpsquat: 3, moves: [mv, { name: "上B", category: "special", group: "上B", variant: "地上・空中", rows: [row({ active: act([5], 6) })] }] };
  assert.deepEqual(C.punishOptions(ch).map((o) => o.move.name), ["上B"]);
});

test("硬直の幅は両端の有利。確定・猶予ラベルはきびしい端で、変わるときだけ補足", () => {
  const mv = { name: "NB", category: "special", rows: [row({ label: "溜めなし", active: act([19], 20), total: 62, stun: [10, 24], stunSpan: true, damage: [10, 28] })] };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.ok, true);
  assert.equal(a.primary, 19); // 62 − 19 − 24
  assert.equal(a.loose, 33); // 62 − 19 − 10
  assert.equal(a.hitboxes, null);
  assert.equal(a.advMin, 19);
  assert.equal(a.advMax, 33);
  assert.equal(a.stunLo, 10);
  assert.equal(a.stunHi, 24);
  const mk = (name, category, s, extra = {}) => ({ name, category, rows: [row({ active: act([s], s), label: extra.label || "" })], ...extra });
  const def = { name: "D", jumpsquat: 3, moves: [
    mk("上B", "special", 5, { group: "上B", variant: "地上" }),
    mk("上スマッシュ", "ground", 22),
    mk("横スマッシュ", "ground", 40),
  ] };
  const list = Object.fromEntries(C.evaluate({ name: "A" }, mv, def, {}).list.map((x) => [x.move.name, x]));
  assert.equal(list["上B"].status, "sure");
  assert.equal(list["上B"].spanNote, "");
  assert.equal(list["上B"].tier, "easy"); // 猶予 14F。ゆるい端ではさらに大きいが、ラベルはきびしい端
  assert.equal(list["上B"].margin, 14);
  assert.equal(list["上スマッシュ"].status, "impossible");
  assert.equal(list["上スマッシュ"].spanNote, "溜め・状況しだい");
  assert.equal(list["上スマッシュ"].tier, null);
  assert.equal(list["上スマッシュ"].margin, -3);
  assert.ok(list["上スマッシュ"].marginLoose >= 0);
  assert.equal(list["横スマッシュ"].status, "impossible");
  assert.equal(list["横スマッシュ"].spanNote, "");
});

test("全体Fの幅も両端。硬直と全体Fが両方幅のときは対応を作らない", () => {
  const total = { name: "横B", category: "special", rows: [row({ active: act([16], 18), total: 48, totalHi: 66, stun: [8] })] };
  const a = C.shieldAdvantage(total);
  assert.equal(a.primary, 24); // 48 − 16 − 8
  assert.equal(a.loose, 42); // 66 − 16 − 8
  assert.equal(a.totalHi, 66);
  const both = { name: "NB", category: "special", rows: [row({ active: act([19], 20), total: 48, totalHi: 66, stun: [10, 24], stunSpan: true })] };
  const b = C.shieldAdvantage(both);
  assert.equal(b.primary, 5); // 小さい全体Fと大きい硬直。きびしい端だけ
  assert.equal(b.loose, null);
});

test("着地隙の幅は両端。硬直も幅なら着地の対応は作らない", () => {
  const lag = { name: "空前", category: "aerial", landingLag: 10, landingLagHi: 18, rows: [row({ active: act([6], 8), stun: [4] })] };
  const a = C.shieldAdvantage(lag);
  assert.equal(a.primary, 6);
  assert.equal(a.loose, 14);
  const both = { name: "空前", category: "aerial", landingLag: 10, landingLagHi: 18, rows: [row({ active: act([6], 8), stun: [4, 8], stunSpan: true })] };
  const b = C.shieldAdvantage(both);
  assert.equal(b.primary, 2); // 着地隙10 − 硬直8
  assert.equal(b.loose, null);
});

test("幅でない複数硬直は、これまでどおり大きい方を一つの有利にする", () => {
  const mv = { name: "下強", category: "ground", rows: [row({ active: act([5], 7), total: 27, stun: [7, 6], damage: [7, 5] })] };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.primary, 15); // 27 − 5 − 7
  assert.equal(a.loose, null);
  assert.equal(a.hitboxes.length, 2);
});

test("飛び道具・ガード時特殊仕様・全体F不明は計算対象外（数値を作らない）", () => {
  assert.equal(C.shieldAdvantage({ name: "NB", category: "special", projectile: true, rows: [] }).ok, false);
  assert.equal(C.shieldAdvantage({ name: "最速風神拳", category: "command", specialShield: true, rows: [] }).ok, false);
  const noTotal = { name: "上B", category: "special", rows: [row({ active: act([3], 6), stun: [6], total: null })] };
  assert.equal(C.shieldAdvantage(noTotal).ok, false);
});

// --- 実データでの確認（検証窓シート由来） ---
const ch = (n) => data.chars.find((c) => c.name === n);
const mv = (c, n) => c.moves.find((m) => m.name === n);

test("実データ: マリオ 上強 = ガード側18F有利（UFD -18 と一致）", () => {
  assert.equal(C.shieldAdvantage(mv(ch("マリオ"), "上強")).primary, 18);
});
test("実データ: マリオ 弱1 14F / 横強 13F / 空N 2F（UFD と一致）", () => {
  const M = ch("マリオ");
  assert.equal(C.shieldAdvantage(mv(M, "弱1")).primary, 14);
  assert.equal(C.shieldAdvantage(mv(M, "横強")).primary, 13);
  assert.equal(C.shieldAdvantage(mv(M, "空N")).primary, 2);
});
test("実データ: マリオのガーキャン手段（UFD: 上B 3F / 空N 6F / 空上 7F / つかみ 10F）", () => {
  const M = ch("マリオ");
  const opts = C.punishOptions(M);
  const need = (n) => { const o = opts.find((x) => x.move.name === n); return o.startup + C.routeCost(o.route, M.jumpsquat, false); };
  assert.equal(need("上B"), 3); assert.equal(need("空N"), 6); assert.equal(need("空上"), 7); assert.equal(need("つかみ"), 10);
});
test("実データ: カズヤのジャンプ踏切はシート値 7F を使う", () => {
  assert.equal(ch("カズヤ").jumpsquat, 7);
});
test("実データ: リュウの必殺ワザはボタン版とコマンド版が別の技、コマンド版はガード硬直が大きい", () => {
  const R = ch("リュウ");
  const b = mv(R, "上B（地上）（強）［ボタン］"), c = mv(R, "上B（地上）（強）［コマンド］");
  assert.ok(b && c);
  assert.ok(c.command.includes("623"));
  assert.ok(c.rows[0].stun[0] > b.rows[0].stun[0]);
});
test("実データ: リュウの強攻撃は 強/弱 が別の技", () => {
  const R = ch("リュウ");
  assert.ok(mv(R, "横強（強）") && mv(R, "横強（弱）"));
});
test("実データ: スティーブは素材ごとに別の技・シートが古い警告つき", () => {
  const S = ch("スティーブ／アレックス");
  assert.ok(S.stale);
  const fs = S.moves.filter((m) => m.name === "横スマッシュ").map((m) => m.material);
  assert.deepEqual(fs.sort(), ["ダイヤモンド", "木材", "石", "装備なし", "金", "鉄"].sort());
  const opts = C.punishOptions(S, "鉄").filter((o) => o.move.name === "横スマッシュ");
  assert.equal(opts.length, 1); assert.equal(opts[0].move.material, "鉄");
});
test("実データ: カズヤ 最速風神拳はガード時特殊仕様のため相手側の計算対象外、反撃手段としては使える", () => {
  const K = ch("カズヤ");
  const e = mv(K, "最速風神拳");
  assert.equal(C.shieldAdvantage(e).ok, false);
  assert.ok(C.punishOptions(K).some((o) => o.move.name === "最速風神拳" && o.route === "drop"));
});

test("実データ: クラウドがマリオ上強(+18F)をガード → 上B 猶予+11F で確定・余裕", () => {
  const r = C.evaluate(ch("マリオ"), mv(ch("マリオ"), "上強"), ch("クラウド"), {});
  const ub = r.list.find((x) => x.move.name === "上B（通常）");
  assert.equal(ub.status, "sure"); assert.equal(ub.margin, 11); assert.equal(ub.tier, "easy");
});
test("実データ: リュウがカズヤ雷神拳をガード → ボタン版・コマンド版の昇龍拳が別々に並ぶ", () => {
  const r = C.evaluate(ch("カズヤ"), mv(ch("カズヤ"), "雷神拳"), ch("リュウ"), {});
  const cmd = r.list.find((x) => x.move.name === "上B（地上）（強）［コマンド］");
  const btn = r.list.find((x) => x.move.name === "上B（地上）（強）［ボタン］");
  assert.ok(cmd && btn); assert.equal(cmd.move.input, "command"); assert.equal(btn.move.input, "button");
});

// ---- 全キャラ収録（ロスター拡張） ----
test("実データ: 全ファイタータブ（ダッシュファイター・DLC・Mii 含む）を収録", () => {
  assert.equal(data.chars.length, 89);
  for (const n of ["ダークサムス", "デイジー", "ルキナ", "クロム", "ブラックピット", "ケン", "リヒター", "格闘Mii", "剣術Mii", "射撃Mii", "ソラ", "カズヤ"])
    assert.ok(ch(n), n);
  for (const c of data.chars) { assert.ok(c.moves.length > 10, c.name); assert.ok(c.lastUpdated, c.name); }
});
test("実データ: データが古い可能性の警告は ピーチ・デイジー・ロゼッタ&チコ・ジョーカー・スティーブ・ヒカリ", () => {
  const st = data.chars.filter((c) => c.stale).map((c) => c.name).sort();
  assert.deepEqual(st, ["ピーチ", "デイジー", "ロゼッタ&チコ", "ジョーカー", "スティーブ／アレックス", "ヒカリ"].sort());
});
test("実データ: ケンのコマンド技（ボタン/コマンド版・コマンド専用ワザ）", () => {
  const K = ch("ケン");
  const b = mv(K, "上B（地上）（強）［ボタン］"), c = mv(K, "上B（地上）（強）［コマンド］");
  assert.equal(b.input, "button"); assert.equal(c.input, "command"); assert.match(c.command, /623/);
  const n = mv(K, "鉈落とし蹴り（派生なし）"), i = mv(K, "鉈落とし蹴り（稲妻派生）");
  assert.equal(n.category, "command"); assert.equal(n.command, "632+A");
  assert.equal(i.rows.length, 2); assert.equal(n.rows.length, 2);
  assert.equal(mv(K, "大外回し蹴り（派生なし）").command, "41236+A");
});
test("実データ: テリーのコマンド技（バーンナックル等のボタン/コマンド、ライジングタックルの下溜め、超必殺）", () => {
  const T = ch("テリー");
  const bb = mv(T, "前B(バーンナックル)（地上, 弱）［ボタン］"), bc = mv(T, "前B(バーンナックル)（地上, 弱）［コマンド］");
  assert.equal(bb.input, "button"); assert.equal(bb.command, null);
  assert.equal(bc.input, "command"); assert.equal(bc.command, "236+攻撃");
  assert.notDeepEqual(bb.rows.map((r) => r.stun), bc.rows.map((r) => r.stun)); // コマンド版はガード硬直が大きい
  assert.equal(mv(T, "上B（通常）（強）").input, "button");
  assert.equal(mv(T, "上B（コマンド）（強）").input, "command");
  assert.equal(mv(T, "パワーゲイザー（地上）").input, "command");
  assert.equal(mv(T, "下B（強）［コマンド］").command, "623+攻撃");
});
test("実データ: テリーのコマンド版の反撃も一覧に出る（注意バッジなし）", () => {
  const r = C.evaluate(ch("マリオ"), mv(ch("マリオ"), "横スマッシュ"), ch("テリー"), {});
  const cmd = r.list.filter((x) => x.status === "sure" && x.move.input === "command");
  assert.ok(cmd.length > 0); assert.ok(cmd.every((x) => !("caution" in x)));
});
test("実データ: 全キャラ×全技で evaluate が例外を出さない", () => {
  for (const a of data.chars) for (const m of a.moves) { if (m.category === "grab") continue; for (const d of [data.chars[0], ch("カズヤ"), ch("スティーブ／アレックス")]) C.evaluate(a, m, d, {}); }
});

test("基礎ダメージの複数値は行ラベルがあるときだけ括弧にし、メモの先端は付けない", () => {
  const dtilt = mv(ch("マリオ"), "下強");
  const off = C.formatHitboxes(dtilt, false);
  assert.equal(off.text, "hit1 7 / hit2 5");
  assert.equal(off.text.includes("先端"), false);
  assert.deepEqual(off.items[0].stuns, [7, 6]);
  const fsmash = mv(ch("マリオ"), "横スマッシュ");
  assert.equal(C.formatHitboxes(fsmash, false).text, "14.7 / 17.8 (全シフト)");
  assert.equal(C.formatHitboxes(fsmash, false).text.includes("先端"), false);
  const nair = mv(ch("マリオ"), "空N");
  assert.equal(C.formatHitboxes(nair, false).text, "8 · 5 (持続)");
  const luc = ch("リュカ").moves.find((m) => (m.rows || []).some((r) => r.label === "火柱" && r.damage && r.damage.length === 2));
  const side = C.formatHitboxes(luc, false).text;
  assert.ok(side.includes("3 (炎)"));
  assert.ok(side.includes("7 / 4 (火柱)"));
  const samus = ch("サムス").moves.find((m) => m.name === "横強");
  const ft = C.formatHitboxes(samus, false).text;
  assert.ok(ft.includes("9 / 10 / 11 (上シフト)"));
  assert.ok(ft.includes("8 / 9 / 10 (無シフト)"));
  assert.ok(ft.includes("9 / 10 / 11 (下シフト)"));
});

test("1on1補正は表示ダメージだけ1.2倍し、硬直と有利は変えない", () => {
  const utilt = mv(ch("マリオ"), "上強");
  assert.equal(C.formatHitboxes(utilt, false).text, "5.5");
  assert.equal(C.formatHitboxes(utilt, true).text, "6.6");
  const adv = C.shieldAdvantage(utilt);
  assert.equal(adv.primary, 18);
  assert.equal(adv.primaryStun, 6);
  const dtilt = C.formatHitboxes(mv(ch("マリオ"), "下強"), true);
  assert.equal(dtilt.text, "hit1 8.4 / hit2 6");
  assert.deepEqual(dtilt.items[0].stuns, [7, 6]);
  assert.deepEqual(dtilt.items[0].base, [7, 5]);
  const floorStun = (d, mult) => Math.floor(d * 0.8 * mult) + 2;
  assert.equal(floorStun(5.5, 1), 6);
  assert.equal(floorStun(7, 1), 7);
  assert.equal(floorStun(5, 1), 6);
  assert.equal(floorStun(14.7, 0.725), 10);
  assert.equal(floorStun(17.8, 0.725), 12);
  assert.equal(floorStun(8, 0.33), 4);
  assert.notEqual(floorStun(5.5 * 1.2, 1), 6);
});

test("アルセーヌと後ろ側の段は密着の有利に使わない。バウンド行の全体Fは空振りの着地隙より優先する", () => {
  const joker = ch("ジョーカー");
  const ft = C.shieldAdvantage(mv(joker, "横強"));
  assert.equal(ft.primaryLabel, "全シフト, Hit 2");
  assert.equal(ft.primary, 15);
  assert.ok(ft.alt.some((x) => x.label.includes("アルセーヌ") && x.adv === 11));
  const ut = C.shieldAdvantage(mv(joker, "上強"));
  assert.equal(ut.primaryLabel, "〆");
  assert.equal(ut.primary, 18);
  const steve = ch("スティーブ／アレックス");
  const ds = C.shieldAdvantage(mv(steve, "下スマッシュ"));
  assert.equal(ds.primaryLabel, "〆1（前）");
  assert.equal(ds.primary, 29);
  assert.ok(ds.alt.some((x) => x.label === "〆2（後）"));
  const gren = C.shieldAdvantage(mv(ch("ゲッコウガ"), "空下"));
  assert.equal(gren.bounceLag, 20);
  assert.equal(gren.landingLag, 30);
  assert.equal(gren.primary, 16);
  const simon = C.shieldAdvantage(mv(ch("シモン"), "空下"));
  assert.equal(simon.bounceLag, 26);
  assert.equal(simon.primary, 21);
  const marth = C.shieldAdvantage(mv(ch("マルス"), "下スマッシュ"));
  assert.equal(marth.primaryLabel, "Hit 2");
  assert.equal(marth.primary, 23);
});

test("硬直の個数がダメージと合わない行は対応づけない", () => {
  const mv = { name: "x", rows: [{ label: "炎", damage: [3, 1], stun: [2] }] };
  const f = C.formatHitboxes(mv, false);
  assert.equal(f.text, "3 / 1 (炎)");
  assert.equal(f.items[0].stuns, null);
  assert.equal(f.items[0].stuns ? "硬直あり" : "—", "—");
});

test("マルス弱1と横強は同じ段の判定ごとに有利が違い、主数値は硬直が大きい方", () => {
  const jab = C.shieldAdvantage(mv(ch("マルス"), "弱1"));
  assert.equal(jab.primary, 14);
  assert.equal(jab.primaryStun, 6);
  assert.deepEqual(jab.hitboxes.map((h) => h.stun), [4, 4, 6, 6]);
  assert.deepEqual(jab.hitboxes.map((h) => h.adv), [16, 16, 14, 14]);
  assert.deepEqual(jab.hitboxes.map((h) => h.name), ["hit1", "hit2", "hit3", "hit4"]);
  assert.equal(jab.advMin, 14);
  assert.equal(jab.advMax, 16);
  assert.ok(jab.hitboxes.every((h) => !/先端|根元|弱/.test(h.name)));
  const ft = C.shieldAdvantage(mv(ch("マルス"), "横強"));
  assert.equal(ft.primary, 14);
  assert.equal(ft.primaryStun, 11);
  assert.deepEqual(ft.hitboxes.map((h) => h.damage), [9, 9, 12]);
  assert.deepEqual(ft.hitboxes.map((h) => h.stun), [9, 9, 11]);
  assert.deepEqual(ft.hitboxes.map((h) => h.adv), [16, 16, 14]);
  assert.deepEqual(ft.hitboxes.map((h) => h.name), ["hit1", "hit2", "hit3"]);
  assert.equal(ft.advMin, 14);
  assert.equal(ft.advMax, 16);
  const utilt = C.shieldAdvantage(mv(ch("マルス"), "上強"));
  assert.equal(utilt.primary, 17);
  assert.equal(utilt.hitboxes.length, 4);
  assert.deepEqual(utilt.hitboxes.map((h) => h.adv), [21, 21, 21, 17]);
});

test("シートが判定名を個数ぶん書いているときだけその名前を使う", () => {
  const move = { name: "横強", category: "ground", rows: [row({ label: "先端、根元", active: act([8], 11), total: 33, damage: [12, 9], stun: [11, 9] })] };
  const a = C.shieldAdvantage(move);
  assert.equal(a.primary, 14);
  assert.deepEqual(a.hitboxes.map((h) => [h.name, h.stun, h.adv]), [["先端", 11, 14], ["根元", 9, 16]]);
  const mk = (name, s) => ({ name, category: "ground", rows: [row({ active: act([s], s), damage: [1], stun: [1], total: 40 })] });
  const def = { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 14), mk("上スマッシュB", 15), mk("上スマッシュC", 17)] };
  const r = C.evaluate({ name: "A", moves: [] }, move, def, {});
  const by = Object.fromEntries(r.list.map((x) => [x.move.name, x]));
  assert.equal(by["上スマッシュ"].status, "sure");
  assert.equal(by["上スマッシュ"].weakNote, "");
  assert.equal(by["上スマッシュ"].margin, 0);
  assert.equal(by["上スマッシュB"].status, "impossible");
  assert.equal(by["上スマッシュB"].weakNote, "根元なら確定");
  assert.equal(by["上スマッシュB"].tier, null);
  assert.equal(by["上スマッシュC"].status, "impossible");
  assert.equal(by["上スマッシュC"].weakNote, "");
  const ps = C.evaluate({ name: "A", moves: [] }, move, def, { perfectShield: true });
  const psB = ps.list.find((x) => x.move.name === "上スマッシュB");
  assert.equal(psB.status, "sure");
  assert.equal(psB.weakNote, "");
});

test("弱い判定だけで間に合う補足は逆向きでも同じ（evaluate が共通）", () => {
  const move = mv(ch("マルス"), "横強");
  const mk = (name, s) => ({ name, category: "ground", rows: [row({ active: act([s], s), damage: [1], stun: [1], total: 40 })] });
  const def = { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 15), mk("上スマッシュ遅", 16), mk("上スマッシュ不可", 17)] };
  const r = C.evaluate(ch("マルス"), move, def, {});
  const by = Object.fromEntries(r.list.map((x) => [x.move.name, x]));
  assert.equal(by["上スマッシュ"].status, "impossible");
  assert.equal(by["上スマッシュ"].weakNote, "hit1・hit2なら確定");
  assert.equal(by["上スマッシュ"].margin, -1);
  assert.equal(by["上スマッシュ遅"].weakNote, "hit1・hit2なら確定");
  assert.equal(by["上スマッシュ遅"].margin, -2);
  assert.equal(by["上スマッシュ不可"].weakNote, "");
  assert.ok(r.list.filter((x) => x.status === "sure").every((x) => x.weakNote === ""));
});

test("判定が1つだけの技は有利の幅も補足も出さない", () => {
  const u = C.shieldAdvantage(mv(ch("マリオ"), "上強"));
  assert.equal(u.primary, 18);
  assert.equal(u.primaryStun, 6);
  assert.equal(u.hitboxes.length, 1);
  assert.equal(u.hitboxes[0].adv, 18);
  assert.equal(u.advMin, 18);
  assert.equal(u.advMax, 18);
  const frames = C.listFrames(mv(ch("マリオ"), "上強"));
  assert.equal(frames.adv, 18);
  assert.equal(frames.advMin, 18);
  assert.equal(frames.advMax, 18);
  const r = C.evaluate(ch("マリオ"), mv(ch("マリオ"), "上強"), ch("マルス"), {});
  assert.ok(r.list.every((x) => x.weakNote === ""));
});

test("ダメージと硬直の個数が合わない行は判定ごとの有利を出さず、画面の硬直は —", () => {
  const move = { name: "x", category: "ground", rows: [row({ label: "炎", active: act([5], 6), total: 20, damage: [3, 1], stun: [2] })] };
  const a = C.shieldAdvantage(move);
  assert.equal(a.ok, true);
  assert.equal(a.primary, 13);
  assert.equal(a.hitboxes, null);
  assert.equal(a.advMin, 13);
  assert.equal(a.advMax, 13);
  const f = C.formatHitboxes(move, false);
  assert.equal(f.items[0].stuns, null);
  assert.equal(f.items[0].stuns ? "硬直あり" : "—", "—");
  const mk = (name, s) => ({ name, category: "ground", rows: [row({ active: act([s], s), damage: [1], stun: [1], total: 40 })] });
  const r = C.evaluate({ name: "A", moves: [] }, move, { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 14)] }, {});
  assert.equal(r.list[0].status, "impossible");
  assert.equal(r.list[0].weakNote, "");
});

test("アルセーヌありはアルセーヌ行の硬直と全体Fで有利と確定が変わり、なしとジョーカー以外は変わらない", () => {
  const joker = ch("ジョーカー");
  const ft = mv(joker, "横強");
  const off = C.shieldAdvantage(ft);
  const on = C.shieldAdvantage(ft, { arsene: true });
  assert.equal(off.primary, 15);
  assert.equal(off.primaryStun, 6);
  assert.equal(off.usedArsene, false);
  assert.equal(off.primaryLabel, "全シフト, Hit 2");
  assert.equal(on.usedArsene, true);
  assert.equal(on.primary, 11);
  assert.equal(on.primaryStun, 10);
  assert.equal(on.total, 34);
  assert.equal(on.primaryLabel, "全シフト, Hit 2, アルセーヌ");
  assert.equal(on.advMin, 11);
  assert.equal(on.advMax, 11);
  const mario = ch("マリオ");
  const jab = C.evaluate(joker, ft, mario, {}).list.find((x) => x.move.name === "弱1" && x.route === "drop");
  const jabOn = C.evaluate(joker, ft, mario, { arsene: true }).list.find((x) => x.move.name === "弱1" && x.route === "drop");
  assert.equal(jab.status, "sure");
  assert.equal(jab.margin, 2);
  assert.equal(jabOn.status, "impossible");
  assert.equal(jabOn.margin, -2);
  assert.equal(jabOn.weakNote, "");

  const ut = mv(joker, "上強");
  assert.equal(C.shieldAdvantage(ut).primary, 18);
  assert.equal(C.shieldAdvantage(ut, { arsene: true }).primary, 15);
  assert.equal(C.shieldAdvantage(ut, { arsene: true }).primaryLabel, "〆, アルセーヌ");
  assert.equal(C.shieldAdvantage(ut, { arsene: true }).primaryStun, 5);

  const bair = mv(joker, "空後");
  assert.equal(C.shieldAdvantage(bair).primary, 5);
  assert.equal(C.shieldAdvantage(bair, { arsene: true }).primary, 6);
  assert.equal(C.shieldAdvantage(bair, { arsene: true }).primaryStun, 3);
  const nairOff = C.evaluate(joker, bair, mario, {}).list.find((x) => x.move.name === "空N" && x.route === "jump");
  const nairOn = C.evaluate(joker, bair, mario, { arsene: true }).list.find((x) => x.move.name === "空N" && x.route === "jump");
  assert.equal(nairOff.status, "impossible");
  assert.equal(nairOn.status, "sure");
  assert.equal(nairOn.margin, 0);

  const jab1 = mv(joker, "弱1");
  assert.equal(C.shieldAdvantage(jab1).primary, C.shieldAdvantage(jab1, { arsene: true }).primary);
  assert.equal(C.shieldAdvantage(jab1, { arsene: true }).usedArsene, true);
  const gun = joker.moves.find((m) => m.name === "NB（ガン）");
  const gunOff = C.shieldAdvantage(gun);
  const gunOn = C.shieldAdvantage(gun, { arsene: true });
  assert.equal(gunOn.primary, gunOff.primary);
  assert.equal(gunOn.usedArsene, false);
  assert.equal(gunOn.primaryStun, gunOff.primaryStun);

  const dtilt = mv(joker, "下強");
  assert.equal(C.shieldAdvantage(dtilt, { arsene: true }).primary, 19);
  assert.equal(C.shieldAdvantage(dtilt, { arsene: true }).primaryStun, 10);
  assert.equal(C.shieldAdvantage(dtilt, { arsene: true }).worst, 13);

  const marioU = C.shieldAdvantage(mv(mario, "上強"), { arsene: true });
  assert.equal(marioU.primary, 18);
  assert.equal(marioU.primaryStun, 6);
  assert.equal(marioU.usedArsene, false);
  const marth = mv(ch("マルス"), "横強");
  const marthOn = C.shieldAdvantage(marth, { arsene: true });
  assert.equal(marthOn.primary, 14);
  assert.deepEqual(marthOn.hitboxes.map((h) => h.adv), [16, 16, 14]);
  const mk = (name, s) => ({ name, category: "ground", rows: [row({ active: act([s], s), damage: [1], stun: [1], total: 40 })] });
  const def = { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 15)] };
  const note = C.evaluate(ch("マルス"), marth, def, { arsene: true }).list[0];
  assert.equal(note.status, "impossible");
  assert.equal(note.weakNote, "hit1・hit2なら確定");
  assert.equal(C.evaluate(ch("マルス"), marth, def, {}).list[0].weakNote, "hit1・hit2なら確定");

  const split = {
    name: "横強", category: "ground", rows: [
      row({ label: "通常", active: act([8], 10), total: 30, damage: [10], stun: [8] }),
      row({ label: "アルセーヌ, 先端、根元", active: act([8], 10), total: 30, damage: [12, 9], stun: [12, 9] }),
    ],
  };
  assert.equal(C.shieldAdvantage(split).primary, 14);
  assert.equal(C.shieldAdvantage(split).usedArsene, false);
  const splitOn = C.shieldAdvantage(split, { arsene: true });
  assert.equal(splitOn.primary, 10);
  assert.equal(splitOn.usedArsene, true);
  assert.deepEqual(splitOn.hitboxes.map((h) => [h.name, h.stun, h.adv]), [["アルセーヌ, 先端", 12, 10], ["根元", 9, 13]]);
  const pun = { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 10), mk("上スマッシュB", 11), mk("上スマッシュC", 14)] };
  const by = Object.fromEntries(C.evaluate({ name: "A", moves: [] }, split, pun, { arsene: true }).list.map((x) => [x.move.name, x]));
  assert.equal(by["上スマッシュ"].status, "sure");
  assert.equal(by["上スマッシュ"].weakNote, "");
  assert.equal(by["上スマッシュB"].status, "impossible");
  assert.equal(by["上スマッシュB"].weakNote, "根元なら確定");
  assert.equal(by["上スマッシュC"].weakNote, "");
  const byOff = Object.fromEntries(C.evaluate({ name: "A", moves: [] }, split, pun, {}).list.map((x) => [x.move.name, x]));
  assert.equal(byOff["上スマッシュB"].status, "sure");
  assert.equal(byOff["上スマッシュB"].weakNote, "");

  const missing = {
    name: "x", category: "ground", rows: [
      row({ label: "通常", active: act([5], 6), total: 20, stun: [4] }),
      row({ label: "アルセーヌ", active: act([5], 6), total: 20, stun: null }),
    ],
  };
  const miss = C.shieldAdvantage(missing, { arsene: true });
  assert.equal(miss.ok, true);
  assert.equal(miss.primary, 11);
  assert.equal(miss.usedArsene, false);

  const sureKey = (list) => list.filter((x) => x.status === "sure").map((x) => x.move.id + "|" + x.route).sort().join(",");
  const changed = [];
  for (const m of joker.moves) {
    if (m.category === "grab") continue;
    const a = C.shieldAdvantage(m);
    const b = C.shieldAdvantage(m, { arsene: true });
    if (!a.ok || !b.ok || a.primary === b.primary) continue;
    let diff = false;
    for (const d of data.chars) {
      if (sureKey(C.evaluate(joker, m, d, {}).list) !== sureKey(C.evaluate(joker, m, d, { arsene: true }).list)) { diff = true; break; }
    }
    if (diff) changed.push(m.name);
  }
  assert.deepEqual(changed, ["ダッシュ攻撃", "横強", "上強", "下強", "横スマッシュ", "上スマッシュ", "下スマッシュ", "空前", "空後", "空上"]);
  for (const c of data.chars) {
    if (c.name === "ジョーカー") continue;
    for (const m of c.moves) {
      const a = C.shieldAdvantage(m);
      const b = C.shieldAdvantage(m, { arsene: true });
      assert.equal(b.ok, a.ok);
      assert.equal(b.primary, a.primary);
      assert.equal(b.worst, a.worst);
      assert.equal(b.primaryStun, a.primaryStun);
      assert.equal(!!b.usedArsene, false);
    }
  }
});

test("主数値は最大硬直のまま。1on1では判定ごとの有利は変わらない", () => {
  let spread = 0;
  for (const ch of data.chars) for (const m of ch.moves) {
    const a = C.shieldAdvantage(m);
    if (!a.ok) continue;
    const lands = (a.landingCases || []).map((c) => c.adv);
    if (a.hitboxes) {
      const advs = a.hitboxes.map((h) => h.adv);
      assert.equal(a.primary, Math.min.apply(null, advs));
      assert.equal(a.advMin, a.primary);
      assert.equal(a.advMax, Math.max.apply(null, advs.concat(lands)));
      if (a.advMin !== a.advMax) spread++;
    } else if (lands.length) {
      assert.equal(a.primary, Math.min.apply(null, lands));
      assert.equal(a.advMin, a.primary);
      assert.equal(a.advMax, Math.max.apply(null, lands));
      if (a.advMin !== a.advMax) spread++;
    } else if (a.loose != null) {
      assert.equal(a.advMin, a.primary);
      assert.ok(a.loose > a.primary);
      assert.equal(a.advMax, a.loose);
      spread++;
    } else {
      assert.equal(a.advMin, a.primary);
      assert.equal(a.advMax, a.primary);
    }
  }
  assert.ok(spread > 10);
  const ft = C.shieldAdvantage(mv(ch("マルス"), "横強"));
  assert.deepEqual(ft.hitboxes.map((h) => h.adv), [16, 16, 14]);
  assert.equal(C.scaleDamage(ft.hitboxes[0].damage, true), 10.8);
  assert.equal(ft.hitboxes[0].adv, 16);
});

test("着地の条件が1つで行が指定されているときは、その行の硬直だけを引く", () => {
  const mv = {
    name: "下B", category: "special", landingVariant: "空中（着地）", landingLag: 35,
    landingCases: [{ name: "攻撃", lag: 35, labels: ["攻撃, 対地"] }],
    rows: [
      row({ label: "踏みつけ", active: act([1], 2), stun: [8], damage: [8] }),
      row({ label: "攻撃, 対地", active: act([9], 12), stun: [13], damage: [14] }),
    ],
  };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.ok, true);
  assert.equal(a.primary, 22);
  assert.equal(a.landingLag, 35);
  assert.equal(a.landingName, "攻撃");
  assert.deepEqual(a.landingCases.map((c) => [c.name, c.lag, c.adv]), [["攻撃", 35, 22]]);
  assert.deepEqual(a.detail.map((d) => d.label), ["攻撃, 対地"]);
});

test("条件つき着地隙は条件ごとに有利を出し、表示と確定はいちばんきびしい着地", () => {
  const mv = {
    name: "上B", category: "special", landingVariant: "空中（着地）", landingLag: 20,
    landingCases: [{ name: "空振り", lag: 20 }, { name: "ヒット時", lag: 28 }],
    rows: [row({ active: act([10], 12), stun: [5], damage: [8] })],
  };
  const a = C.shieldAdvantage(mv);
  assert.equal(a.ok, true);
  assert.equal(a.primary, 15);
  assert.equal(a.landingLag, 20);
  assert.equal(a.landingName, "空振り");
  assert.deepEqual(a.landingCases.map((c) => [c.name, c.lag, c.adv]), [["空振り", 20, 15], ["ヒット時", 28, 23]]);
  assert.equal(a.advMin, 15);
  assert.equal(a.advMax, 23);
  assert.equal(a.bounceLag, null);
  const withBounce = {
    name: "上B", category: "special", landingVariant: "空中（着地）", landingLag: 20,
    landingCases: [{ name: "空振り", lag: 20 }, { name: "ヒット時", lag: 28 }],
    rows: [
      row({ active: act([10], 12), stun: [5], damage: [8] }),
      row({ label: "バウンド", active: null, damage: null, stun: null, total: 40 }),
    ],
  };
  assert.equal(C.shieldAdvantage(withBounce).primary, 15);
  const mk = (name, s) => ({ name, category: "ground", rows: [row({ active: act([s], s), damage: [1], stun: [1], total: 40 })] });
  const def = { name: "D", jumpsquat: 3, moves: [mk("上スマッシュ", 16), mk("上スマッシュ遅", 24)] };
  const by = Object.fromEntries(C.evaluate({ name: "A", moves: [] }, mv, def, {}).list.map((x) => [x.move.name, x]));
  assert.equal(by["上スマッシュ"].status, "impossible");
  assert.equal(by["上スマッシュ"].margin, -1);
  assert.equal(by["上スマッシュ"].weakNote, "ヒット時なら確定");
  assert.equal(by["上スマッシュ"].tier, null);
  assert.equal(by["上スマッシュ遅"].status, "impossible");
  assert.equal(by["上スマッシュ遅"].weakNote, "");
  const frames = C.listFrames(mv);
  assert.equal(frames.adv, 15);
  assert.equal(frames.advMin, 15);
  assert.equal(frames.advMax, 23);
  assert.equal(frames.landing, 20);
});

test("会心とインク切れは初期が通常の段で、ありのときだけシートの別行に変わる", () => {
  const hero = ch("勇者");
  const ink = ch("インクリング");
  const mario = ch("マリオ");
  const fsmash = mv(hero, "横スマッシュ");
  const usmash = mv(hero, "上スマッシュ");
  const dsmash = mv(hero, "下スマッシュ");
  const hoff = C.shieldAdvantage(fsmash);
  const hon = C.shieldAdvantage(fsmash, { crit: true });
  assert.equal(hoff.primary, 36);
  assert.equal(hoff.primaryStun, 12);
  assert.equal(hoff.damage, 18);
  assert.equal(hoff.worst, 34);
  assert.equal(hoff.usedCrit, false);
  assert.equal(hoff.primaryLabel, "");
  assert.equal(hon.primary, 26);
  assert.equal(hon.primaryStun, 22);
  assert.equal(hon.damage, 36);
  assert.equal(hon.worst, 24);
  assert.equal(hon.usedCrit, true);
  assert.equal(hon.primaryLabel, "会心の一撃");
  assert.equal(C.formatHitboxes(fsmash, false).text, "hit1 18 / hit2 18 / hit3 16");
  assert.equal(C.formatHitboxes(fsmash, false, { crit: true }).text, "36 / 36 / 32 (会心の一撃)");
  assert.equal(C.formatHitboxes(fsmash, true, { crit: true }).text, "43.2 / 43.2 / 38.4 (会心の一撃)");
  assert.equal(C.shieldAdvantage(usmash).primary, 29);
  assert.equal(C.shieldAdvantage(usmash).primaryStun, 11);
  assert.equal(C.shieldAdvantage(usmash, { crit: true }).primary, 20);
  assert.equal(C.shieldAdvantage(usmash, { crit: true }).damage, 32);
  assert.equal(C.shieldAdvantage(dsmash).primary, 26);
  assert.equal(C.shieldAdvantage(dsmash).primaryLabel, "Hit 2");
  assert.equal(C.shieldAdvantage(dsmash).primaryStun, 9);
  assert.equal(C.shieldAdvantage(dsmash, { crit: true }).primary, 18);
  assert.equal(C.shieldAdvantage(dsmash, { crit: true }).primaryLabel, "会心の一撃");
  assert.equal(C.shieldAdvantage(dsmash, { crit: true }).primaryStun, 17);
  const jab = C.shieldAdvantage(mv(hero, "弱1"));
  assert.equal(C.shieldAdvantage(mv(hero, "弱1"), { crit: true }).primary, jab.primary);
  assert.equal(C.shieldAdvantage(mv(hero, "弱1"), { crit: true }).usedCrit, false);
  const nb = C.evaluate(hero, fsmash, mario, {}).list.find((x) => x.move.name === "NB" && x.route === "drop");
  const nbOn = C.evaluate(hero, fsmash, mario, { crit: true }).list.find((x) => x.move.name === "NB" && x.route === "drop");
  assert.equal(nb.status, "sure");
  assert.equal(nb.margin, 8);
  assert.equal(nbOn.status, "impossible");
  assert.equal(nbOn.margin, -2);

  const ifs = mv(ink, "横スマッシュ");
  const ioff = C.shieldAdvantage(ifs);
  const ion = C.shieldAdvantage(ifs, { ink: true });
  assert.equal(ioff.primary, 24);
  assert.equal(ioff.primaryStun, 11);
  assert.equal(ioff.damage, 16);
  assert.equal(ioff.usedInk, false);
  assert.equal(ion.primary, 27);
  assert.equal(ion.primaryStun, 8);
  assert.equal(ion.damage, 12);
  assert.equal(ion.usedInk, true);
  assert.equal(ion.primaryLabel, "インク切れ");
  assert.equal(C.formatHitboxes(ifs, false).text, "hit1 14 / hit2 16");
  assert.equal(C.formatHitboxes(ifs, false, { ink: true }).text, "12 (インク切れ)");
  assert.equal(C.shieldAdvantage(mv(ink, "上スマッシュ")).primary, 29);
  assert.equal(C.shieldAdvantage(mv(ink, "上スマッシュ")).primaryLabel, "Hit 2");
  assert.equal(C.shieldAdvantage(mv(ink, "上スマッシュ"), { ink: true }).primary, 32);
  assert.equal(C.shieldAdvantage(mv(ink, "下スマッシュ")).primary, 22);
  assert.equal(C.shieldAdvantage(mv(ink, "下スマッシュ")).primaryLabel, "Hit 2, 持続");
  assert.equal(C.shieldAdvantage(mv(ink, "下スマッシュ"), { ink: true }).primary, 23);
  assert.equal(C.shieldAdvantage(mv(ink, "下スマッシュ"), { ink: true }).primaryLabel, "インク切れ");
  assert.equal(C.shieldAdvantage(mv(ink, "弱1"), { ink: true }).primary, C.shieldAdvantage(mv(ink, "弱1")).primary);
  assert.equal(C.shieldAdvantage(mv(ink, "下B（地上）"), { ink: true }).primary, C.shieldAdvantage(mv(ink, "下B（地上）")).primary);
  assert.equal(C.shieldAdvantage(mv(ink, "下B（地上）"), { ink: true }).usedInk, false);
  const smash = C.evaluate(ink, ifs, mario, {}).list.find((x) => x.move.name === "横スマッシュ" && x.route === "drop");
  const smashOn = C.evaluate(ink, ifs, mario, { ink: true }).list.find((x) => x.move.name === "横スマッシュ" && x.route === "drop");
  assert.equal(smash.status, "impossible");
  assert.equal(smash.margin, -2);
  assert.equal(smashOn.status, "sure");
  assert.equal(smashOn.margin, 1);

  assert.equal(C.shieldAdvantage(mv(ch("ジョーカー"), "横強"), { crit: true, ink: true }).primary, 15);
  assert.equal(C.shieldAdvantage(mv(mario, "上強"), { crit: true, ink: true }).primary, 18);
  for (const c of data.chars) {
    if (c.name === "勇者" || c.name === "インクリング") continue;
    for (const m of c.moves) {
      const a = C.shieldAdvantage(m);
      const b = C.shieldAdvantage(m, { crit: true, ink: true });
      assert.equal(b.primary, a.primary, c.name + " " + m.name);
      assert.equal(b.worst, a.worst, c.name + " " + m.name);
      assert.equal(!!b.usedCrit, false);
      assert.equal(!!b.usedInk, false);
    }
  }
});

test("対キャラ早見: 有利が大きい順。同点は並びのまま。最速は必要Fが最小の確定", () => {
  const ground = (name, startup, total, stun) => ({
    name, category: "ground",
    rows: [row({ active: act([startup], startup), total, stun: [stun], damage: [5] })],
  });
  const att = { name: "A", moves: [] };
  const def = { name: "D", jumpsquat: 3, moves: [
    { name: "上B", category: "special", group: "上B", variant: "地上", rows: [row({ active: act([20], 21) })] },
    { name: "弱", category: "ground", rows: [row({ active: act([2], 3) })] },
  ]};
  const big = ground("大隙", 10, 40, 5); // 有利25。弱の解除(必要13)が上B(必要20)より速い
  const mid = ground("中隙", 10, 30, 6); // 有利14。解除だけ確定（猶予1、シビア）
  const tieA = ground("同点A", 8, 20, 6);
  const tieB = ground("同点B", 8, 20, 6);
  const small = ground("小隙", 6, 12, 5); // 有利1。確定なし
  const shot = { name: "弾", category: "special", projectile: true, rows: [row({ active: act([10], 12), total: 40, stun: [5] })] };
  const grab = { name: "つかみ", category: "grab", rows: [row({ label: "その場", active: act([6], 7), damage: null })] };
  const g = C.matchupGlance(att, def, [small, big, shot, tieB, mid, tieA, grab], {});
  assert.deepEqual(g.sure.map((r) => r.move.name), ["大隙", "中隙"]);
  assert.deepEqual(g.sure.map((r) => r.adv), [25, 14]);
  assert.equal(g.sure[0].best.move.name, "弱");
  assert.equal(g.sure[0].best.route, "drop");
  assert.equal(g.sure[0].best.margin, 12);
  assert.equal(g.sure[0].best.tier, "easy");
  assert.equal(g.sure[1].best.route, "drop");
  assert.equal(g.sure[1].best.margin, 1);
  assert.equal(g.sure[1].best.tier, "severe");
  assert.deepEqual(g.none.map((r) => [r.move.name, r.adv, r.best]), [["同点B", 6, null], ["同点A", 6, null], ["小隙", 1, null]]);
  assert.deepEqual(g.skipped.map((r) => r.move.name), ["弾", "つかみ"]);
  for (const r of g.skipped) assert.equal(r.adv, undefined);
  const ps = C.matchupGlance(att, def, [small], { perfectShield: true });
  const ev = C.evaluate(att, small, def, { perfectShield: true });
  const best = ev.list.find((x) => x.status === "sure");
  assert.equal(ps.sure.length, 1);
  assert.equal(ps.sure[0].adv, ev.adv.primaryEff);
  assert.equal(ps.sure[0].adv, 1 + C.PERFECT_SHIELD_BONUS);
  assert.equal(ps.sure[0].best.move.name, best.move.name);
  assert.equal(ps.sure[0].best.route, best.route);
  assert.equal(ps.sure[0].best.margin, best.margin);
  assert.equal(ps.sure[0].best.tier, best.tier);
});

function assertGlanceMatchesEvaluate(att, def, moves, o) {
  const g = C.matchupGlance(att, def, moves, o);
  const seen = new Set();
  for (const row of g.sure.concat(g.none, g.skipped)) {
    assert.equal(seen.has(row.move), false);
    seen.add(row.move);
  }
  assert.equal(seen.size, moves.length);
  for (let i = 1; i < g.sure.length; i++) assert.ok(g.sure[i - 1].adv >= g.sure[i].adv);
  for (let i = 1; i < g.none.length; i++) assert.ok(g.none[i - 1].adv >= g.none[i].adv);
  for (const row of g.skipped) {
    assert.equal(Object.hasOwn(row, "adv"), false);
    assert.equal(C.evaluate(att, row.move, def, o).adv.ok, false);
  }
  for (const row of g.sure.concat(g.none)) {
    const ev = C.evaluate(att, row.move, def, o);
    assert.equal(ev.adv.ok, true);
    assert.equal(row.adv, ev.adv.primaryEff);
    const best = ev.list.find((x) => x.status === "sure") || null;
    if (!best) {
      assert.equal(row.best, null);
      assert.equal(g.none.includes(row), true);
      continue;
    }
    assert.equal(g.sure.includes(row), true);
    assert.equal(row.best.move, best.move);
    assert.equal(row.best.route, best.route);
    assert.equal(row.best.margin, best.margin);
    assert.equal(row.best.need, best.need);
    assert.equal(row.best.tier, best.tier);
    assert.equal(row.best.tier, C.marginTier(best.margin));
    const needs = ev.list.filter((x) => x.status === "sure").map((x) => x.need);
    assert.equal(row.best.need, Math.min.apply(null, needs));
  }
  return g;
}

test("対キャラ早見はマリオ対クッパの全技で、単技の evaluate と一致する", () => {
  const mario = ch("マリオ");
  const bowser = ch("クッパ");
  const ab = assertGlanceMatchesEvaluate(bowser, mario, bowser.moves, {});
  const ba = assertGlanceMatchesEvaluate(mario, bowser, mario.moves, {});
  assert.ok(ab.sure.length > 0 && ab.none.length > 0);
  assert.ok(ba.sure.length > 0);
  const base = new Map(ab.sure.concat(ab.none).map((r) => [r.move, r.adv]));
  const ps = assertGlanceMatchesEvaluate(bowser, mario, bowser.moves, { perfectShield: true });
  for (const row of ps.sure.concat(ps.none)) assert.equal(row.adv, base.get(row.move) + C.PERFECT_SHIELD_BONUS);
});

test("対キャラ早見はアルセーヌ・会心・インク切れ・素材を evaluate と同じに反映する", () => {
  const mario = ch("マリオ");
  for (const [name, moveName, key, offAdv, onAdv] of [
    ["ジョーカー", "横強", "arsene", 15, 11],
    ["勇者", "横スマッシュ", "crit", 36, 26],
    ["インクリング", "横スマッシュ", "ink", 24, 27],
  ]) {
    const att = ch(name);
    const move = mv(att, moveName);
    const off = assertGlanceMatchesEvaluate(att, mario, [move], {});
    const on = assertGlanceMatchesEvaluate(att, mario, [move], { [key]: true });
    assert.equal(off.sure.concat(off.none)[0].adv, offAdv);
    assert.equal(on.sure.concat(on.none)[0].adv, onAdv);
    assert.notEqual(off.sure.concat(off.none)[0].adv, on.sure.concat(on.none)[0].adv);
  }
  const joker = ch("ジョーカー");
  assertGlanceMatchesEvaluate(joker, mario, joker.moves, {});
  assertGlanceMatchesEvaluate(joker, mario, joker.moves, { arsene: true });
  const steve = ch("スティーブ／アレックス");
  for (const mat of ["木材", "鉄"]) {
    const g = assertGlanceMatchesEvaluate(mario, steve, mario.moves, { defenderMaterial: mat });
    for (const row of g.sure) {
      if (row.best.move.material) assert.equal(row.best.move.material, mat);
    }
  }
});
