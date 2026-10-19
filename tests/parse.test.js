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

test("計算できる技は 1722 から 1755 に増え、以前計算できた技は落ちていない", () => {
  let ok = 0;
  for (const c of data.chars) for (const m of c.moves) {
    if (m.category === "grab") continue;
    if (!m.rows.some((r) => r.active && (r.damage == null || Math.max.apply(null, r.damage) > 0))) continue;
    if (C.shieldAdvantage(m).ok) ok++;
  }
  assert.equal(ok, 1755);
});
