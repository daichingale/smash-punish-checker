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

test("ダメージは最大が初期で、最小を選ぶと小さい方で並び、空欄は末尾", () => {
  const rows = T.buildRows(data, C);
  const dtilt = rows.find((r) => r.char === "マリオ" && r.name === "下強");
  assert.equal(dtilt.damageMax, 7);
  assert.equal(dtilt.damageMin, 5);
  assert.equal(C.formatParts(dtilt.parts, false).text, "hit1 7 / hit2 5");
  const sample = [
    { order: 0, name: "空", damageMax: null, damageMin: null, damage: null },
    { order: 1, name: "幅", damageMax: 10, damageMin: 4, damage: 10 },
    { order: 2, name: "単", damageMax: 8, damageMin: 8, damage: 8 },
  ];
  T.applyDamageKey(sample, "max");
  assert.deepEqual(T.sortRows(sample, "damage", "desc").map((r) => r.name), ["幅", "単", "空"]);
  T.applyDamageKey(sample, "min");
  assert.deepEqual(T.sortRows(sample, "damage", "desc").map((r) => r.name), ["単", "幅", "空"]);
  assert.deepEqual(T.sortRows(sample, "damage", "asc").map((r) => r.name), ["幅", "単", "空"]);
});

test("1on1補正とダメージの並べ方はURLに残り、空のcはキャラ0にならない", () => {
  assert.equal(T.parseQuery("").oo, null);
  assert.equal(T.parseQuery("#oo=1").oo, true);
  assert.equal(T.parseQuery("#oo=0").oo, false);
  assert.equal(T.parseQuery("").dmg, "max");
  assert.equal(T.parseQuery("#dmg=min").dmg, "min");
  const s = { sort: "damage", dir: "desc", preset: "", kinds: [], place: "", chars: [], text: "", vs: null, dmg: "min", oo: true };
  const back = T.parseQuery("#" + T.serialize(s));
  assert.equal(back.dmg, "min");
  assert.equal(back.oo, true);
  assert.equal(back.sort, "damage");
  assert.equal(T.parseQuery("#c=").chars.length, 0);
});

test("同じ段で有利が変わる技は範囲を出し、並べ替えと確定数はきびしい方", () => {
  const rows = T.buildRows(data, C);
  const ft = rows.find((r) => r.char === "マルス" && r.name === "横強");
  const jab = rows.find((r) => r.char === "マルス" && r.name === "弱1");
  const u = rows.find((r) => r.char === "マリオ" && r.name === "上強");
  assert.equal(ft.adv, 14);
  assert.equal(ft.advMin, 14);
  assert.equal(ft.advMax, 16);
  assert.equal(T.formatAdvRange(ft), "+14〜+16");
  assert.equal(T.formatAdvRange(jab), "+14〜+16");
  assert.equal(u.adv, 18);
  assert.equal(u.advMin, 18);
  assert.equal(u.advMax, 18);
  assert.equal(T.formatAdvRange(u), "+18");
  const sample = [
    { order: 0, name: "幅", adv: 14, advMin: 14, advMax: 16 },
    { order: 1, name: "単", adv: 15, advMin: 15, advMax: 15 },
    { order: 2, name: "空", adv: null, advMin: null, advMax: null },
  ];
  assert.equal(T.formatAdvRange(sample[2]), "—");
  assert.deepEqual(T.sortRows(sample, "adv", "desc").map((r) => r.name), ["単", "幅", "空"]);
  assert.deepEqual(T.sortRows(sample, "adv", "asc").map((r) => r.name), ["幅", "単", "空"]);
  const sureRows = [{ adv: 14, advMax: 16 }];
  T.fillSure(sureRows, [[15], [14]], 0);
  assert.equal(sureRows[0].sure, 0);
  T.fillSure(sureRows, [[15], [14]], 1);
  assert.equal(sureRows[0].sure, 1);
});

test("アルセーヌありはジョーカーの有利と確定数だけ変わり、URLは ars=1 のときだけ", () => {
  const off = T.buildRows(data, C);
  const on = T.buildRows(data, C, { arsene: true });
  assert.equal(off.length, on.length);
  const pick = (rows, ch, name) => rows.find((r) => r.char === ch && r.name === name);
  assert.equal(pick(off, "ジョーカー", "横強").adv, 15);
  assert.equal(pick(off, "ジョーカー", "横強").stun, 6);
  assert.equal(pick(on, "ジョーカー", "横強").adv, 11);
  assert.equal(pick(on, "ジョーカー", "横強").stun, 10);
  assert.equal(pick(on, "ジョーカー", "横強").total, 34);
  assert.equal(pick(off, "ジョーカー", "弱1").adv, pick(on, "ジョーカー", "弱1").adv);
  const gun = data.chars.find((c) => c.name === "ジョーカー").moves.find((m) => m.name === "NB（ガン）");
  assert.equal(off.find((r) => r.id === gun.id).adv, on.find((r) => r.id === gun.id).adv);
  assert.equal(pick(off, "マリオ", "上強").adv, 18);
  assert.equal(pick(on, "マリオ", "上強").adv, 18);
  assert.equal(pick(on, "マリオ", "上強").stun, pick(off, "マリオ", "上強").stun);
  const keys = ["startup", "activeEnd", "total", "landing", "stun", "adv", "advMin", "advMax"];
  for (let i = 0; i < off.length; i++) {
    if (off[i].char === "ジョーカー") continue;
    for (const k of keys) assert.equal(on[i][k], off[i][k], off[i].char + " " + off[i].name + " " + k);
  }
  const needs = T.punishNeeds(data.chars, C);
  const marioIdx = data.chars.findIndex((c) => c.name === "マリオ");
  const ft = [pick(off, "ジョーカー", "横強"), pick(on, "ジョーカー", "横強")];
  T.fillSure(ft, needs, marioIdx);
  assert.ok(ft[0].sure > ft[1].sure);
  const mario = [pick(off, "マリオ", "上強"), pick(on, "マリオ", "上強")];
  T.fillSure(mario, needs, marioIdx);
  assert.equal(mario[0].sure, mario[1].sure);
  assert.equal(T.parseQuery("").arsene, false);
  assert.equal(T.parseQuery("#ars=1").arsene, true);
  assert.equal(T.parseQuery("#ars=0").arsene, false);
  const s = { sort: "adv", dir: "desc", preset: "", kinds: [], place: "", chars: [77], text: "", vs: null, dmg: "max", oo: false, arsene: true };
  const back = T.parseQuery("#" + T.serialize(s));
  assert.equal(back.arsene, true);
  assert.deepEqual(back.chars, [77]);
  assert.equal(T.serialize({ sort: "order", dir: "asc", arsene: false }).includes("ars="), false);
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
