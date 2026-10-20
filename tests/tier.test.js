const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/tier.js");
const N = require("../src/names.js");
const data = require("../data/data.json");

const roster = [
  { name: "マリオ", sheetTab: "1. マリオ" },
  { name: "マルス", sheetTab: "21. マルス" },
  { name: "格闘Mii", sheetTab: "51. 格闘Mii" },
];

test("初期状態は S〜D が空で、共有用の文字列から同じ状態に戻る", () => {
  const s = T.defaultState();
  assert.deepEqual(s.tiers.map((t) => t.name), ["S", "A", "B", "C", "D"]);
  assert.ok(s.rows.every((r) => r.length === 0));
  const back = T.decode(T.encode(s), 89);
  assert.deepEqual(back, s);
  assert.deepEqual(T.poolIndices(s, 89).length, 89);
});

test("配置・名前・色・段の順が encode/decode で落ちない", () => {
  const s = T.defaultState();
  assert.equal(T.moveFighter(s, 22, 0, null), true);
  assert.equal(T.moveFighter(s, 0, 0, null), true);
  assert.equal(T.moveFighter(s, 55, 2, 0), true);
  assert.equal(T.renameTier(s, 0, " 最強 "), true);
  assert.equal(s.tiers[0].name, "最強");
  assert.equal(T.renameTier(s, 0, "   "), false);
  assert.equal(s.tiers[0].name, "最強");
  assert.equal(T.recolorTier(s, 1, "#1122AA"), true);
  assert.equal(s.tiers[1].color, "#1122aa");
  assert.equal(T.recolorTier(s, 1, "red"), false);
  assert.equal(T.addTier(s, "好き", "#010203"), true);
  assert.equal(T.moveTier(s, 5, 1), true);
  const back = T.decode(T.encode(s), 89);
  assert.deepEqual(back, s);
  assert.deepEqual(back.rows[0], [22, 0]);
  assert.deepEqual(back.rows[1], []);
  assert.equal(back.tiers[1].name, "好き");
  assert.equal(back.tiers[2].name, "A");
  assert.equal(back.tiers[2].color, "#1122aa");
});

test("壊れた共有文字列は null。範囲外と重複は捨てて、先に出た段を残す", () => {
  assert.equal(T.decode("", 89), null);
  assert.equal(T.decode("%%%", 89), null);
  assert.equal(T.decode(encodeURIComponent(JSON.stringify({ v: 2, t: [["S", "#112233"]], r: [[]] })), 89), null);
  assert.equal(T.decode(encodeURIComponent(JSON.stringify({ v: 1, t: [["", "#112233"]], r: [[]] })), 89), null);
  assert.equal(T.decode(encodeURIComponent(JSON.stringify({ v: 1, t: [["S", "red"]], r: [[]] })), 89), null);
  const raw = encodeURIComponent(JSON.stringify({
    v: 1,
    t: [["S", "#d64545"], ["A", "#e07a2f"]],
    r: [[0, 99, 1, 1], [1, -1, 0, 2]],
  }));
  const back = T.decode(raw, 3);
  assert.deepEqual(back.rows, [[0, 1], [2]]);
});

test("同じ段の中の並び替えと、段を消したファイターは未配置に戻る", () => {
  const s = T.defaultState();
  T.moveFighter(s, 0, 0, null);
  T.moveFighter(s, 1, 0, null);
  T.moveFighter(s, 2, 0, null);
  T.moveFighter(s, 0, 0, 3);
  assert.deepEqual(s.rows[0], [1, 2, 0]);
  T.moveFighter(s, 0, 0, 0);
  assert.deepEqual(s.rows[0], [0, 1, 2]);
  T.toPool(s, 1);
  assert.deepEqual(s.rows[0], [0, 2]);
  assert.ok(T.poolIndices(s, 3).includes(1));
  assert.equal(T.removeTier(s, 0), true);
  assert.deepEqual(T.poolIndices(s, 3), [0, 1, 2]);
  while (s.tiers.length > 1) T.removeTier(s, 0);
  assert.equal(T.removeTier(s, 0), false);
  assert.equal(s.tiers.length, 1);
});

test("未配置の検索はひらがな・ローマ字・番号で Names と同じ", () => {
  const all = [0, 1, 2];
  const hit = (q) => T.filterPool(all, roster, q, N.haystack, N.norm, N.charNo);
  assert.deepEqual(hit(""), all);
  assert.deepEqual(hit("まりお"), [0]);
  assert.deepEqual(hit("mario"), [0]);
  assert.deepEqual(hit("marth"), [1]);
  assert.deepEqual(hit("21"), [1]);
  assert.deepEqual(hit("mii"), [2]);
  assert.deepEqual(hit("51"), [2]);
  assert.deepEqual(hit("ない"), []);
});

test("ファイターは89人（エコーと Mii 3種を含む）", () => {
  assert.equal(data.chars.length, 89);
  for (const name of ["ダークサムス", "ルキナ", "格闘Mii", "剣術Mii", "射撃Mii", "ソラ"]) {
    assert.ok(data.chars.some((c) => c.name === name), name);
  }
  const s = T.defaultState();
  assert.equal(T.poolIndices(s, data.chars.length).length, 89);
});
