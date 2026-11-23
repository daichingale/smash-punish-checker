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

test("ピーチ上Bの着地は傘の開閉で有利が変わり、表は範囲、確定数はきびしい方", () => {
  const rows = T.buildRows(data, C);
  const air = rows.find((r) => r.char === "ピーチ" && r.id.endsWith("~air") && r.name.includes("上B"));
  assert.ok(air);
  assert.equal(air.landing, 26);
  assert.equal(air.landingMax, 40);
  assert.equal(T.formatLanding(air), "26〜40");
  assert.equal(air.adv, 23);
  assert.equal(air.advMin, 23);
  assert.equal(air.advMax, 37);
  assert.equal(T.formatAdvRange(air), "+23〜+37");
  const needs = T.punishNeeds(data.chars, C);
  const mario = data.chars.findIndex((c) => c.name === "マリオ");
  T.fillSure([air], needs, mario);
  const loose = Object.assign({}, air, { adv: 37 });
  T.fillSure([loose], needs, mario);
  assert.ok(air.sure < loose.sure);
});

test("着地隙が条件で複数あるときは着地隙も有利も範囲で、主数値は小さい方", () => {
  const row = { landing: 20, landingMax: 28, adv: 15, advMin: 15, advMax: 23 };
  assert.equal(T.formatLanding(row), "20〜28");
  assert.equal(T.formatLanding({ landing: 12, landingMax: 12 }), "12");
  assert.equal(T.formatLanding({ landing: null, landingMax: null }), "—");
  assert.equal(T.formatAdvRange(row), "+15〜+23");
  const rows = [
    { order: 0, name: "幅", landing: 20, adv: 15 },
    { order: 1, name: "短", landing: 12, adv: 9 },
  ];
  assert.deepEqual(T.sortRows(rows, "landing", "asc").map((r) => r.name), ["短", "幅"]);
  assert.deepEqual(T.sortRows(rows, "adv", "asc").map((r) => r.name), ["短", "幅"]);
});

test("溜めの幅は有利・硬直・全体Fを小さい方〜大きい方で出し、並べ替えは小さい方", () => {
  const rows = T.buildRows(data, C);
  const dk = rows.find((r) => r.char === "ドンキーコング" && r.name.includes("ジャイアント") && r.name.includes("地上"));
  assert.ok(dk);
  assert.equal(dk.adv, 19);
  assert.equal(dk.advMin, 19);
  assert.equal(dk.advMax, 33);
  assert.equal(T.formatAdvRange(dk), "+19〜+33");
  assert.equal(dk.stun, 10);
  assert.equal(dk.stunMax, 24);
  assert.equal(T.formatStun(dk), "10〜24");
  assert.equal(T.formatTotal({ total: 48, totalMax: 66 }), "48〜66");
  assert.equal(T.formatTotal({ total: 62, totalMax: 62 }), "62");
  assert.equal(T.formatStun({ stun: null, stunMax: null }), "—");
  assert.equal(T.formatLanding({ landing: 10, landingMax: 18 }), "10〜18");
  const sample = [
    { order: 0, name: "幅", stun: 10, total: 48, adv: 19 },
    { order: 1, name: "単", stun: 12, total: 50, adv: 20 },
    { order: 2, name: "空", stun: null, total: null, adv: null },
  ];
  assert.deepEqual(T.sortRows(sample, "stun", "asc").map((r) => r.name), ["幅", "単", "空"]);
  assert.deepEqual(T.sortRows(sample, "total", "asc").map((r) => r.name), ["幅", "単", "空"]);
  assert.deepEqual(T.sortRows(sample, "adv", "asc").map((r) => r.name), ["幅", "単", "空"]);
  const bayo = rows.find((r) => r.char === "ベヨネッタ" && r.name.includes("ヒールスライド") && r.name.includes("地上"));
  assert.ok(bayo);
  assert.equal(bayo.total, 67);
  assert.equal(T.formatTotal(bayo), "67");
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
