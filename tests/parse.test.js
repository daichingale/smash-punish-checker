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

test("幅のある硬直は大きい方を使い、読めなかった技が計算に戻る", () => {
  const dk = C.shieldAdvantage(mv(ch("ドンキーコング"), "NB（地上）"));
  assert.equal(dk.ok, true);
  assert.equal(dk.primary, 19); // 62 − 19 − 24（10F~24F の大きい方）
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

test("ネス PKファイヤーの空中（着地）は備考の着地隙12F。条件付きの着地隙は作らない", () => {
  const ness = ch("ネス");
  const ground = mv(ness, "横B");
  const air = ness.moves.find((m) => m.id === ground.id + "~air");
  assert.equal(ground.landingLag, undefined);
  assert.equal(C.shieldAdvantage(ground).primary, 34); // 全体55 − 発生18 − 硬直3
  assert.equal(air.landingVariant, "空中（着地）");
  assert.equal(air.landingLag, 12);
  const a = C.shieldAdvantage(air);
  assert.equal(a.ok, true);
  assert.equal(a.aerial, true);
  assert.equal(a.primary, 9); // 着地隙12 − 硬直3
  assert.ok(!C.punishOptions(ness).some((o) => o.move.landingVariant));
  const peach = ch("ピーチ").moves.find((m) => m.name === "上B");
  assert.equal(peach.rows.some((r) => (r.rowNote || "").includes("着地隙")), true);
  assert.ok(!ch("ピーチ").moves.some((m) => m.landingVariant && m.name === "上B"));
  const mario = ch("マリオ");
  const rev = C.evaluate(ness, air, mario, {});
  assert.equal(rev.adv.primaryEff, 9);
  assert.ok(rev.list.some((x) => x.status === "sure"));
  const n = data.chars.reduce((s, c) => s + c.moves.filter((m) => m.landingVariant).length, 0);
  assert.equal(n, 97);
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
