const test = require("node:test");
const assert = require("node:assert");
const M = require("../src/mii.js");
const T = require("../src/table.js");
const C = require("../src/calc.js");
const data = require("../data/data.json");

test("group の NB/横B/上B/下B に付いた 1〜3 だけを番号にする", () => {
  assert.equal(M.miiSlot({ group: "横B2 (疾風突き)", name: "横B2 (疾風突き)（地上）" }), "s2");
  assert.equal(M.miiSlot({ group: "NB1 (鉄球投げ)", name: "NB1 (鉄球投げ)（空中）" }), "n1");
  assert.equal(M.miiSlot({ group: "上B3 (回転斬り)", name: "上B3 (回転斬り)（地上）" }), "u3");
  assert.equal(M.miiSlot({ group: "下B1 (カウンター)", name: "下B1 (カウンター)" }), "d1");
  assert.equal(M.miiSlot({ group: "上B", name: "上B" }), null);
  assert.equal(M.miiSlot({ group: "NB（ガン）", name: "NB（ガン）" }), null);
  assert.equal(M.miiSlot({ group: "NB10 (x)", name: "NB10 (x)" }), null);
  assert.equal(M.miiSlot({ name: "弱1" }), null);
  assert.equal(M.miiSlot({ name: "横強" }), null);
  // 技名だけにあって group が無いときは技名を使う
  assert.equal(M.miiSlot({ name: "横B2 (疾風突き)" }), "s2");
  // group があるのに番号が取れない技は、技名から推測しない
  assert.equal(M.miiSlot({ group: "上B", name: "横B2 (x)" }), null);
  // group と技名の番号が食い違うときは付けない
  assert.equal(M.miiSlot({ group: "横B2 (a)", name: "横B1 (b)" }), null);
  assert.equal(M.isMiiName("剣術Mii"), true);
  assert.equal(M.isMiiName("格闘Mii"), true);
  assert.equal(M.isMiiName("射撃Mii"), true);
  assert.equal(M.isMiiName("マリオ"), false);
  assert.equal(M.isMiiName("Mii"), false);
  assert.equal(M.SLOTS.length, 12);
  assert.equal(M.slotLabel("s2"), "横2");
  assert.equal(M.toggleSlot("", "s2"), "s2");
  assert.equal(M.toggleSlot("s2", "s2"), "");
  assert.equal(M.toggleSlot("s1", "s2"), "s2");
  assert.equal(M.toggleSlot("s2", "横2"), "s2");
});

test("絞り込みは選んだ番号と、番号が付かない技だけを残す", () => {
  const moves = [
    { id: "side2g", group: "横B2 (疾風突き)", name: "横B2 (疾風突き)（地上）" },
    { id: "side2a", group: "横B2 (疾風突き)", name: "横B2 (疾風突き)（空中）" },
    { id: "side1", group: "横B1 (変則急襲斬り)", name: "横B1 (変則急襲斬り)" },
    { id: "upb", group: "上B", name: "上B" },
    { id: "jab", name: "弱1" },
    { id: "clash", group: "横B2 (a)", name: "横B1 (b)" },
  ];
  const ids = M.filterBySlot(moves, "s2").map((m) => m.id);
  assert.deepEqual(ids, ["side2g", "side2a", "upb", "jab", "clash"]);
  assert.deepEqual(M.filterBySlot(moves, ""), moves);
  assert.deepEqual(M.filterBySlot(moves, "s9"), moves);
  const again = moves.slice();
  M.filterBySlot(moves, "s2");
  assert.deepEqual(moves, again);
});

test("実データのMii必殺だけ番号が付き、剣術の横2は疾風突きだけ", () => {
  let specialYes = 0, specialNo = 0, otherMii = 0, stranger = 0;
  for (const ch of data.chars) {
    const mii = M.isMiiName(ch.name);
    for (const m of ch.moves) {
      const slot = M.miiSlot(m);
      if (mii && m.category === "special") {
        if (slot) specialYes++;
        else specialNo++;
      } else if (slot) stranger++;
      else if (mii) otherMii++;
    }
  }
  assert.equal(specialNo, 0);
  assert.equal(stranger, 0);
  assert.equal(specialYes, 55);
  assert.equal(otherMii, 48);
  const sword = data.chars.find((c) => c.name === "剣術Mii");
  const specs = sword.moves.filter((m) => m.category === "special");
  const side2 = M.filterBySlot(specs, "s2");
  assert.ok(side2.length >= 2);
  assert.ok(side2.every((m) => m.group.startsWith("横B2")));
  assert.ok(side2.some((m) => /地上/.test(m.variant || m.name)));
  assert.ok(side2.some((m) => /空中/.test(m.variant || m.name)));
  assert.ok(!side2.some((m) => m.group.startsWith("横B1")));
  assert.ok(side2.length < specs.length);
});

test("全技表は slot で番号が違う必殺だけを外し、URLに残す", () => {
  const rows = T.buildRows(data, C);
  const sword = data.chars.findIndex((c) => c.name === "剣術Mii");
  const mario = data.chars.findIndex((c) => c.name === "マリオ");
  const view = T.applyView(rows, { chars: [sword], kinds: ["special"], slot: "s2" });
  assert.ok(view.length > 0);
  assert.ok(view.every((r) => r.miiSlot === "s2"));
  assert.ok(view.some((r) => r.name.includes("疾風突き")));
  assert.ok(!view.some((r) => r.miiSlot === "s1" || r.miiSlot === "n1"));
  const allSpecial = T.applyView(rows, { chars: [sword], kinds: ["special"] });
  assert.ok(allSpecial.length > view.length);
  const mixed = T.applyView(rows, { chars: [sword, mario], slot: "s2" });
  assert.ok(mixed.some((r) => r.char === "マリオ" && r.name === "上強"));
  assert.ok(mixed.some((r) => r.char === "マリオ" && r.kind === "special" && r.miiSlot == null));
  assert.ok(mixed.some((r) => r.char === "剣術Mii" && r.miiSlot == null && r.kind !== "special"));
  assert.ok(!mixed.some((r) => r.char === "剣術Mii" && r.miiSlot && r.miiSlot !== "s2"));
  assert.equal(T.parseQuery("").slot, "");
  assert.equal(T.parseQuery("#slot=s2").slot, "s2");
  assert.equal(T.parseQuery("#slot=s9").slot, "");
  assert.equal(T.parseQuery("#slot=横2").slot, "");
  const s = { sort: "order", dir: "asc", preset: "", kinds: ["special"], place: "", chars: [sword], text: "", vs: null, dmg: "max", oo: false, arsene: false, slot: "s2" };
  const back = T.parseQuery("#" + T.serialize(s));
  assert.equal(back.slot, "s2");
  assert.deepEqual(back.kinds, ["special"]);
  assert.deepEqual(back.chars, [sword]);
  assert.equal(T.serialize({ sort: "order", dir: "asc", arsene: false }).includes("slot="), false);
});
