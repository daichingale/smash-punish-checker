const test = require("node:test");
const assert = require("node:assert");
const C = require("../src/calc.js");
const T = require("../src/table.js");
const data = require("../data/data.json");

test("計算できない値は昇順でも降順でも末尾", () => {
  const rows = [
    { order: 0, char: "A", name: "a", startup: null, adv: 4 },
    { order: 1, char: "B", name: "b", startup: 10, adv: null },
    { order: 2, char: "C", name: "c", startup: 3, adv: -2 },
  ];
  assert.deepEqual(T.sortRows(rows, "startup", "asc").map((r) => r.name), ["c", "b", "a"]);
  assert.deepEqual(T.sortRows(rows, "startup", "desc").map((r) => r.name), ["b", "c", "a"]);
  assert.deepEqual(T.sortRows(rows, "adv", "asc").map((r) => r.name), ["c", "a", "b"]);
  assert.deepEqual(T.sortRows(rows, "adv", "desc").map((r) => r.name), ["a", "c", "b"]);
});

test("発生が速い技は発生の昇順で、空欄は末尾", () => {
  const rows = T.buildRows(data, C);
  const view = T.applyView(rows, { preset: "fast" });
  let seenNull = false, prev = -Infinity, n = 0;
  for (const r of view) {
    if (r.startup == null) { seenNull = true; continue; }
    assert.equal(seenNull, false);
    assert.ok(r.startup >= prev);
    prev = r.startup;
    n++;
  }
  assert.ok(n > 1000);
  assert.equal(view[0].startup, 1);
});

test("ガードされても安全な技はガード有利が小さい順で、計算対象外は末尾", () => {
  const rows = T.buildRows(data, C);
  const view = T.applyView(rows, { preset: "safe" });
  let seenNull = false, prev = -Infinity, n = 0;
  for (const r of view) {
    if (r.adv == null) { seenNull = true; continue; }
    assert.equal(seenNull, false);
    assert.ok(r.adv >= prev);
    prev = r.adv;
    n++;
  }
  assert.equal(seenNull, true);
  assert.ok(n > 100);
  assert.ok(view[0].adv < 0);
});

test("キャラ別の最速手段はキャラごとに弱・上B・上スマ・空中・つかみ", () => {
  const rows = T.buildRows(data, C);
  const view = T.applyView(rows, { preset: "tools" });
  const per = {};
  for (const r of view) per[r.char] = (per[r.char] || 0) + 1;
  assert.ok(Object.values(per).every((n) => n <= 5));
  const mario = view.filter((r) => r.char === "マリオ");
  assert.ok(mario.some((r) => r.kind === "tilt" && r.name.startsWith("弱")));
  assert.ok(mario.some((r) => r.slotGroup === "上B"));
  assert.ok(mario.some((r) => r.name.startsWith("上スマッシュ")));
  assert.ok(mario.some((r) => r.kind === "air"));
  assert.ok(mario.some((r) => r.kind === "grab"));
  const jab = mario.find((r) => r.kind === "tilt");
  assert.equal(jab.startup, 2);
});

test("マリオ上強はガード側+18。着地プリセットに地上技は出ない", () => {
  const rows = T.buildRows(data, C);
  const u = rows.find((r) => r.char === "マリオ" && r.name === "上強");
  assert.equal(u.startup, 5);
  assert.equal(u.adv, 18);
  assert.equal(u.total, 29);
  const land = T.applyView(rows, { preset: "land" });
  assert.ok(land.length > 50);
  assert.ok(land.every((r) => r.place === "air" && r.landing != null));
  assert.ok(land.every((r, i) => i === 0 || r.landing >= land[i - 1].landing));
});

test("空のURLは全キャラで、キャラ0は指定したときだけ", () => {
  assert.deepEqual(T.parseQuery("").chars, []);
  assert.deepEqual(T.parseQuery("#preset=fast").chars, []);
  assert.deepEqual(T.parseQuery("#c=0").chars, [0]);
});

test("URLのソートとプリセットを復元できる", () => {
  const s = { sort: "startup", dir: "asc", preset: "fast", kinds: ["air"], place: "air", chars: [0, 66], text: "上", vs: 1 };
  const back = T.parseQuery("#" + T.serialize(s));
  assert.equal(back.preset, "fast");
  assert.equal(back.sort, "startup");
  assert.equal(back.dir, "asc");
  assert.deepEqual(back.kinds, ["air"]);
  assert.equal(back.place, "air");
  assert.deepEqual(back.chars, [0, 66]);
  assert.equal(back.text, "上");
  assert.equal(back.vs, 1);
});
