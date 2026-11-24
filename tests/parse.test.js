// 再解釈した実データと、読めない表記を計算対象外のままにする確認
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/calc.js");
const data = require("../data/data.json");

const ch = (n) => data.chars.find((c) => c.name === n);
const mv = (c, n) => c.moves.find((m) => m.name === n);

test("スティーブ空下: 失敗の1Fではなく本判定 20-* が発生", () => {
  const m = mv(ch("スティーブ／アレックス"), "空下");
  assert.equal(m.rows[0].active.starts[0], 20);
  assert.equal(m.rows[0].active.open, true);
  assert.equal(C.startupOf(m), 20);
  const a = C.shieldAdvantage(m);
  assert.equal(a.ok, true);
  assert.equal(a.primary, 12); // 着地隙18 − ガード硬直6
  assert.equal(a.lateUnknown, true);
  assert.equal(a.worst, a.primary);
});

test("リンク横スマ: 溜め最大 79-126 は短い全体Fには使わず、従来の 23 / -2", () => {
  const m = mv(ch("リンク"), "横スマッシュ");
  const beam = m.rows.find((r) => r.label === "剣ビーム, 最大");
  assert.equal(beam.active.starts[0], 79);
  assert.equal(beam.active.end, 126);
  const a = C.shieldAdvantage(m);
  assert.equal(a.primary, 23);
  assert.equal(a.worst, -2);
});

test("10F+ は上限が無いので硬直にしない（ヨッシー横B 転がり）", () => {
  const m = mv(ch("ヨッシー"), "横B");
  const roll = m.rows.find((r) => r.label === "転がり");
  assert.equal(roll.stunRaw, "10F+");
  assert.equal(roll.stun, null);
  assert.equal(C.shieldAdvantage(m).ok, false);
});

test("幅のある硬直は両端の有利にし、基準は大きい方（きびしい側）", () => {
  const dkMove = mv(ch("ドンキーコング"), "NB（地上）");
  assert.equal(dkMove.rows[0].stunSpan, true);
  assert.deepEqual(dkMove.rows[0].stun, [10, 24]);
  const dk = C.shieldAdvantage(dkMove);
  assert.equal(dk.ok, true);
  assert.equal(dk.primary, 19); // 62 − 19 − 24
  assert.equal(dk.loose, 33); // 62 − 19 − 10
  assert.equal(dk.hitboxes, null);
  const flipped = C.evaluate(ch("ドンキーコング"), dkMove, ch("マリオ"), {}).list.filter((x) => x.spanNote);
  assert.ok(flipped.length > 0);
  assert.ok(flipped.every((x) => x.status === "impossible" && x.tier == null && x.margin < 0 && x.marginLoose >= 0));
  const ness = C.shieldAdvantage(mv(ch("ネス"), "下B"));
  assert.equal(ness.ok, true);
  assert.equal(ness.primary, 12);
  const kirby = mv(ch("カービィ"), "下B（空中）");
  assert.equal(C.shieldAdvantage(kirby).ok, true);
});

test("全体Fが '(98)' だけのセルも読み、開始が全体Fより後しか無い技は残す", () => {
  const pyra = mv(ch("ホムラ"), "上B");
  assert.equal(pyra.rows[0].total, 98);
  assert.equal(C.shieldAdvantage(pyra).primary, 80);
  const duck = C.shieldAdvantage(mv(ch("ダックハント"), "下B"));
  assert.equal(duck.ok, true);
  const villager = C.shieldAdvantage(mv(ch("むらびと"), "横B"));
  assert.equal(villager.ok, true);
});

test("着地版と空中ブロックを除くと、計算できる技は 1754（マックKOアッパーの地上版を除く）", () => {
  let ok = 0;
  for (const c of data.chars) for (const m of c.moves) {
    if (m.category === "grab" || m.landingVariant || m.versionLabel === "空中" || m.derivedAir) continue;
    if (!m.rows.some((r) => r.active && (r.damage == null || Math.max.apply(null, r.damage) > 0))) continue;
    if (C.shieldAdvantage(m).ok) ok++;
  }
  // リトル・マックのKOアッパーは、硬直が空中行にしか無く、地上版は計算対象外になった
  assert.equal(ok, 1754);
});

test("ネス PKファイヤーの空中（着地）は備考の着地隙12F。条件名つきの着地隙は条件ごとに分ける", () => {
  const ness = ch("ネス");
  const ground = mv(ness, "横B");
  const air = ness.moves.find((m) => m.id === ground.id + "~air");
  assert.equal(ground.landingLag, undefined);
  assert.equal(C.shieldAdvantage(ground).primary, 34); // 全体55 − 発生18 − 硬直3
  assert.equal(air.landingVariant, "空中（着地）");
  assert.equal(air.landingLag, 12);
  assert.equal(air.landingCases, undefined);
  const a = C.shieldAdvantage(air);
  assert.equal(a.ok, true);
  assert.equal(a.aerial, true);
  assert.equal(a.primary, 9); // 着地隙12 − 硬直3
  assert.ok(!C.punishOptions(ness).some((o) => o.move.landingVariant));
  const peach = ch("ピーチ").moves.find((m) => m.landingCases);
  assert.equal(peach.landingVariant, "空中（着地）");
  const pa = C.shieldAdvantage(peach);
  assert.equal(pa.primary, 23); // 傘・開 26 − 硬直3
  assert.equal(pa.landingName, "傘・開");
  assert.deepEqual(pa.landingCases.map((c) => [c.name, c.lag, c.adv]), [["傘・開", 26, 23], ["傘・閉", 40, 37]]);
  const watch = ch("Mr.ゲーム&ウォッチ");
  assert.equal(watch.moves.some((m) => (m.rows || []).some((r) => (r.rowNote || "").includes("パラシュート"))), true);
  assert.ok(!watch.moves.some((m) => m.landingVariant && m.name === "上B"));
  const mario = ch("マリオ");
  const rev = C.evaluate(ness, air, mario, {});
  assert.equal(rev.adv.primaryEff, 9);
  assert.ok(rev.list.some((x) => x.status === "sure"));
  const umbrella = C.evaluate(ch("ピーチ"), peach, mario, {});
  const slow = umbrella.list.find((x) => x.weakNote.includes("傘・閉なら確定"));
  assert.ok(slow);
  assert.equal(slow.status, "impossible");
  const n = data.chars.reduce((s, c) => s + c.moves.filter((m) => m.landingVariant).length, 0);
  const multi = data.chars.reduce((s, c) => s + c.moves.filter((m) => m.landingCases && m.landingCases.length >= 2).length, 0);
  assert.equal(n, 119);
  assert.equal(multi, 13);
});

test("行と着地隙が対応する見送り分だけを条件ごとの有利にし、曖昧なものは計算対象外のまま", () => {
  const zss = ch("ゼロスーツサムス");
  const zAir = zss.moves.find((m) => m.landingVariant && m.group === "下B");
  const zGround = zss.moves.find((m) => m.group === "下B" && !m.landingVariant);
  assert.equal(zAir.landingLag, 35);
  assert.deepEqual(zAir.landingCases.map((c) => [c.name, c.lag]), [["攻撃", 35]]);
  assert.ok(zAir.rows.every((r) => r.label.startsWith("攻撃")));
  assert.equal(C.shieldAdvantage(zAir).primary, 22); // 着地隙35 − 硬直13
  assert.equal(C.shieldAdvantage(zAir).landingName, "攻撃");
  assert.equal(zGround.versionLabel, "地上");
  assert.equal(C.shieldAdvantage(zGround).primary, 37); // 全体59 − 発生9 − 硬直13
  assert.equal(C.shieldAdvantage(zGround).aerial, false);

  const diddy = ch("ディディーコング");
  const dAir = diddy.moves.find((m) => m.landingVariant && m.group === "横B");
  assert.equal(dAir.landingLag, 18);
  assert.deepEqual(dAir.rows.map((r) => r.label), ["キック", "キック, 持続"]);
  const da = C.shieldAdvantage(dAir);
  assert.equal(da.primary, 5); // 着地隙18 − 硬直13
  assert.equal(da.landingName, "キック");
  assert.deepEqual(da.hitboxes.map((h) => h.adv), [5, 7]);

  const brawler = ch("格闘Mii");
  const bAir = brawler.moves.find((m) => m.landingVariant && (m.name || "").includes("反転キック"));
  assert.equal(bAir.landingLag, 37);
  assert.ok(bAir.rows.every((r) => r.label.startsWith("攻撃")));
  assert.equal(C.shieldAdvantage(bAir).primary, 27); // 着地隙37 − 硬直10
  assert.ok(!brawler.moves.some((m) => m.landingVariant && (m.name || "").includes("スープレックス")));

  const joker = ch("ジョーカー");
  const gun = joker.moves.find((m) => m.landingVariant && m.variant === "ガン");
  assert.equal(gun.landingLag, 10);
  assert.ok(gun.rows.some((r) => r.label.startsWith("乱れ撃ち") && r.active && r.active.starts[0] === 12));
  assert.ok(!gun.rows.some((r) => (r.label || "").includes("ジャンプ直下")));
  const ga = C.shieldAdvantage(gun);
  assert.equal(ga.primary, 4); // 通常射撃 着地隙10 − 硬直6
  assert.equal(ga.landingLag, 10);
  assert.equal(ga.landingCases[0].name, "通常射撃/回避射撃/空中直下射撃");
  assert.equal(ga.landingCases[0].adv, 4);
  assert.equal(ga.landingCases[1].name, "乱れ撃ち");
  assert.equal(ga.landingCases[1].lag, 20);
  assert.equal(ga.landingCases[1].adv, 16);
  const burst = C.evaluate(joker, gun, ch("マリオ"), {}).list.filter((x) => x.weakNote.includes("乱れ撃ちなら確定"));
  assert.ok(burst.length > 0);
  assert.ok(burst.every((x) => x.status === "impossible"));

  const deferred = [
    ["Mr.ゲーム&ウォッチ", (m) => m.group === "上B"],
    ["シーク", (m) => m.group === "下B"],
    ["ピクミン&オリマー", (m) => m.group === "上B"],
    ["むらびと", (m) => m.group === "上B"],
    ["しずえ", (m) => m.group === "上B"],
    ["リドリー", (m) => m.group === "上B"],
    ["スティーブ／アレックス", (m) => m.group === "上B"],
    ["クッパ Jr.", (m) => m.group === "上B"],
    ["カムイ", (m) => m.name === "横B（地上）"],
    ["剣術Mii", (m) => (m.name || "").includes("疾風突き")],
  ];
  for (const [name, pred] of deferred) {
    assert.ok(!ch(name).moves.some((m) => m.landingVariant && pred(m)), name);
  }
});

test("カズヤ NB デビルブラスター: 空中版は全体67F・地上版の判定27F。着地隙は使わない", () => {
  const k = ch("カズヤ");
  const g = mv(k, "NB（地上）");
  const a = mv(k, "NB（空中）");
  assert.equal(a.activeFromGround, true);
  assert.equal(a.landingVariant, undefined);
  assert.equal(a.rows[0].active.starts[0], 27);
  assert.equal(a.rows[0].total, 67);
  assert.equal(C.shieldAdvantage(g).primary, 43); // 82 − 27 − 12
  assert.equal(C.shieldAdvantage(a).primary, 29); // 67 − 27 − 11
  assert.equal(C.startupOf(a), 27);
  assert.ok(!C.punishOptions(k).some((o) => o.move.derivedAir));
});

test("クラウド NB は地上ブロックと空中ブロックで有利が違う。行の一部タグだけの技は分けない", () => {
  const c = ch("クラウド");
  const g = c.moves.find((m) => m.name === "NB（通常）" && m.versionLabel === "地上");
  const a = c.moves.find((m) => m.name === "NB（通常）" && m.versionLabel === "空中");
  assert.equal(C.shieldAdvantage(g).primary, 32);
  assert.equal(C.shieldAdvantage(a).primary, 39);
  assert.equal(C.startupOf(a), 18);
  const joker = ch("ジョーカー");
  assert.ok(!joker.moves.some((m) => m.name.includes("ガンスペシャル") && m.versionLabel));
  const mac = ch("リトル・マック");
  const mg = mac.moves.find((m) => m.name.includes("K.O.") && m.versionLabel === "地上");
  const ma = mac.moves.find((m) => m.name.includes("K.O.") && m.versionLabel === "空中");
  assert.equal(C.shieldAdvantage(mg).ok, false);
  assert.equal(C.shieldAdvantage(ma).primary, 54);
});
