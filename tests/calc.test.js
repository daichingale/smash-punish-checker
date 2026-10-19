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
});
