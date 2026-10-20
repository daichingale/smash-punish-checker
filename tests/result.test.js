const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/result.js");

function ev(name, date, rows) {
  return { event: { name: name, date: date, entrants: rows.length }, rows: rows };
}
function row(place, player, chars) {
  return { place: place, player: player, chars: chars };
}
function ch(id, color) {
  return { id: id, color: color == null ? 1 : color };
}

test("同じ選手の色違いは1人、別キャラはキャラごとに1人", () => {
  const events = [ev("大会", "2026-10-20", [
    row(1, "たろう", [ch(0, 1), ch(0, 8), ch(22, 3)]),
    row(2, "はなこ", [ch(0, 2)]),
  ])];
  const u = R.countUsage(events);
  assert.equal(u.players, 2);
  const mario = u.rows.find((r) => r.id === 0);
  const marth = u.rows.find((r) => r.id === 22);
  assert.equal(mario.count, 2);
  assert.equal(marth.count, 1);
  assert.equal(R.formatPercent(mario.ratio), "100%");
  assert.equal(R.formatPercent(marth.ratio), "50%");
});

test("大会をまたいでも同じ名前は1人。空の名前は行ごとに別の人", () => {
  const a = ev("春", "2026-04-01", [row(1, "たろう", [ch(0, 1)])]);
  const b = ev("夏", "2026-07-01", [row(1, " たろう ", [ch(0, 4), ch(7, 1)])]);
  const c = ev("秋", "2026-09-01", [
    row(1, "", [ch(1, 1)]),
    row(2, "  ", [ch(1, 2)]),
  ]);
  const u = R.countUsage([a, b, c]);
  assert.equal(u.players, 3);
  assert.equal(u.rows.find((r) => r.id === 0).count, 1);
  assert.equal(u.rows.find((r) => r.id === 7).count, 1);
  assert.equal(u.rows.find((r) => r.id === 1).count, 2);
});

test("ポケモン3体とホムラ／ヒカリは、同じ人なら1人としてまとめて数える", () => {
  const u = R.countUsage([ev("大会", "2026-10-20", [
    row(1, "たろう", [ch(37, 1), ch(39, 2), ch(85, 1), ch(86, 3)]),
    row(2, "はなこ", [ch(38, 1)]),
    row(3, "じろう", [ch(86, 1)]),
  ])]);
  assert.equal(u.rows.find((r) => r.id === 37).count, 2);
  assert.equal(u.rows.find((r) => r.id === 85).count, 2);
  assert.equal(u.rows.find((r) => r.id === 38), undefined);
  assert.equal(u.rows.find((r) => r.id === 39), undefined);
  assert.equal(u.rows.find((r) => r.id === 86), undefined);
  assert.equal(R.usageName(39, () => "リザードン"), "ポケモントレーナー");
  assert.equal(R.usageName(86, () => "ヒカリ"), "ホムラ／ヒカリ");
  assert.equal(R.usageName(55, (id) => "格闘Mii"), "格闘Mii");
  const back = R.decode(R.encode(R.normalizeEvent(ev("大会", "2026-10-20", [
    row(1, "たろう", [ch(39, 2), ch(37, 1), ch(86, 4), ch(85, 1)]),
  ]), 89)), 89);
  assert.deepEqual(back.rows[0].chars, [{ id: 37, color: 2 }, { id: 85, color: 4 }]);
});

test("使っていないキャラはランキングに出ない。人数と名前で並べ替えられる", () => {
  const u = R.countUsage([ev("大会", "2026-01-01", [
    row(1, "A", [ch(2, 1)]),
    row(2, "B", [ch(0, 1)]),
    row(3, "C", [ch(0, 1)]),
  ])]);
  assert.deepEqual(u.rows.map((r) => r.id), [0, 2]);
  const names = (id) => ["マリオ", "ドンキー", "リンク"][id];
  assert.deepEqual(R.sortUsage(u.rows, "count", "desc", names).map((r) => r.id), [0, 2]);
  assert.deepEqual(R.sortUsage(u.rows, "count", "asc", names).map((r) => r.id), [2, 0]);
  const byName = R.sortUsage(u.rows, "name", "asc", names).map((r) => r.id);
  const byNameDesc = R.sortUsage(u.rows, "name", "desc", names).map((r) => r.id);
  assert.deepEqual(byNameDesc, byName.slice().reverse());
  assert.notDeepEqual(byName, byNameDesc);
});

test("使用人数の多い順を S〜D に分け、0人は入れない", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ id: i, count: 10 - i, ratio: 1 });
  rows.push({ id: 50, count: 0, ratio: 0 });
  const t = R.rankingToTiers(rows);
  assert.deepEqual(t.tiers.map((x) => x.name), ["S", "A", "B", "C", "D"]);
  assert.deepEqual(t.rows[0], [0, 1]);
  assert.deepEqual(t.rows[4], [8, 9]);
  assert.ok(t.rows.every((band) => !band.includes(50)));
  assert.equal(R.rankingToTiers([{ id: 3, count: 1 }]).rows[0][0], 3);
});

test("Miiは色が1つ。保存済みの色2以降は色1として残る", () => {
  assert.deepEqual(R.colorChoices(55), [1]);
  assert.deepEqual(R.colorChoices(56), [1]);
  assert.deepEqual(R.colorChoices(57), [1]);
  assert.equal(R.colorChoices(0).length, 8);
  assert.equal(R.paintColor(57, 6), 1);
  assert.equal(R.paintColor(0, 6), 6);
  const back = R.decode(R.encode(R.normalizeEvent(ev("大会", "2026-10-20", [
    row(1, "たろう", [ch(55, 8), ch(56, 3), ch(57, 1), ch(0, 4)]),
  ]), 89)), 89);
  assert.deepEqual(back.rows[0].chars, [
    { id: 55, color: 1 },
    { id: 56, color: 1 },
    { id: 57, color: 1 },
    { id: 0, color: 4 },
  ]);
});

test("共有文字列と JSON は往復でき、壊れた色番号は捨てる", () => {
  const src = ev("月例", "2026-10-20", [
    row(1, "たろう", [ch(0, 1), ch(0, 9), ch(22, 0), { id: 4, color: 8 }]),
  ]);
  const back = R.decode(R.encode(R.normalizeEvent(src, 89)), 89);
  assert.equal(back.event.name, "月例");
  assert.deepEqual(back.rows[0].chars, [{ id: 0, color: 1 }, { id: 4, color: 8 }]);
  const bundle = R.exportBundle([back, ev("もう一つ", "2026-11-01", [row(1, "B", [ch(1, 2)])])]);
  const again = R.parseBundle(JSON.stringify(bundle), 89);
  assert.equal(again.length, 2);
  assert.equal(again[1].rows[0].chars[0].id, 1);
  assert.equal(R.parseBundle("{", 89), null);
  assert.equal(R.parseBundle(JSON.stringify({ v: 1, events: [] }), 89), null);
  const one = R.parseBundle(JSON.stringify({ v: 1, event: { name: "単体", date: "", entrants: 4 }, rows: [row(1, "A", [ch(3, 2)])] }), 89);
  assert.equal(one.length, 1);
  assert.equal(one[0].event.entrants, 4);
});

test("開催地・国・スポンサーは共有で残る", () => {
  const src = {
    event: { name: "杯", date: "Apr. 01", entrants: 48, city: "Tokyo, Kanto", country: "Japan" },
    rows: [{ place: 1, player: "たろう", nation: "jp", sponsor: "SS", chars: [ch(0, 2), ch(2, 1)] }],
  };
  const back = R.decode(R.encode(R.normalizeEvent(src, 89)), 89);
  assert.equal(back.event.city, "Tokyo, Kanto");
  assert.equal(back.event.country, "Japan");
  assert.equal(back.event.date, "Apr. 01");
  assert.equal(back.rows[0].nation, "jp");
  assert.equal(back.rows[0].sponsor, "SS");
  assert.deepEqual(back.rows[0].chars.map((c) => c.id), [0, 2]);
});

test("同じ大会名と日付は上書きし、人数は増えない", () => {
  const lib = [];
  R.upsertEvent(lib, ev("月例", "2026-10-20", [row(1, "たろう", [ch(0, 1)])]));
  R.upsertEvent(lib, ev("月例", "2026-10-20", [row(1, "たろう", [ch(0, 2), ch(5, 1)])]));
  R.upsertEvent(lib, ev("", "", [row(1, "別", [ch(1, 1)])]));
  R.upsertEvent(lib, ev("", "", [row(1, "もう", [ch(2, 1)])]));
  assert.equal(lib.length, 3);
  assert.deepEqual(lib[0].rows[0].chars.map((c) => c.id), [0, 5]);
  const u = R.countUsage(lib);
  assert.equal(u.rows.find((r) => r.id === 0).count, 1);
});
