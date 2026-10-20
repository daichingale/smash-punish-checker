const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const F = require("../src/frame.js");

const focus = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/focus.json"), "utf8"));
F.load(focus);

const TEMPLATES = ["slash", "minimal", "neon", "wa"];
const NAMES = { 1: "ドンキー", 15: "クッパ", 25: "ガノンドロフ", 39: "リザードン", 70: "リドリー", 76: "パックンフラワー" };

function check(id, color, template, index) {
  const meta = F.metaFor(id, color);
  const view = F.heroViewport(template, index);
  const placed = F.place(meta, meta.iw, meta.ih, view.w, view.h, view);
  return placed;
}

test("全キャラ×全色を各テンプレの1位と小枠に置くと、顔が入り体が6割以上見える", () => {
  const misses = [];
  for (let id = 0; id < focus.chars.length; id++) {
    for (let color = 1; color <= 8; color++) {
      for (const template of TEMPLATES) {
        for (const index of [0, 4]) {
          const placed = check(id, color, template, index);
          if (!(placed.visible + 1e-6 >= F.MIN_VISIBLE) || !placed.focusIn) {
            misses.push(template + "#" + index + " id" + id + " c" + color + " vis=" + placed.visible.toFixed(3));
          }
        }
      }
    }
  }
  assert.equal(misses.length, 0, misses.slice(0, 12).join("\n"));
});

test("横長キャラの1位枠でも可視率が基準以上", () => {
  for (const id of Object.keys(NAMES).map(Number)) {
    for (const template of TEMPLATES) {
      const placed = check(id, 1, template, 0);
      assert.ok(placed.focusIn, NAMES[id] + " " + template + " 顔");
      assert.ok(placed.visible + 1e-6 >= F.MIN_VISIBLE, NAMES[id] + " " + template + " " + placed.visible);
    }
  }
});

const GROUPS = [16, 44, 52, 63, 79];
const CONTAIN = [37, 38, 39, 85, 86];

test("単体に分けられない集合画像は、枠の中に全体が入る", () => {
  for (const id of CONTAIN) {
    assert.equal(focus.bodies && focus.bodies[String(id)], undefined);
    for (let color = 1; color <= 8; color++) {
      const meta = F.metaFor(id, color);
      assert.equal(meta.contain, true);
      assert.equal(meta.bodies, null);
      for (const template of TEMPLATES) {
        for (const index of [0, 4]) {
          const placed = check(id, color, template, index);
          assert.ok(placed.visible + 1e-9 >= 1, id + " " + template + " " + placed.visible);
          assert.equal(placed.focusIn, true);
        }
      }
    }
  }
});

test("集合画像は各体の顔が入り、各体が7割以上見える", () => {
  const misses = [];
  for (const id of GROUPS) {
    const rows = focus.bodies && focus.bodies[String(id)];
    if (!rows || rows.length !== 8) {
      misses.push("bodies missing id" + id);
      continue;
    }
    for (let color = 1; color <= 8; color++) {
      const meta = F.metaFor(id, color);
      if (!meta || !meta.bodies || meta.bodies.length < 2) {
        misses.push("meta bodies id" + id + " c" + color);
        continue;
      }
      for (const template of TEMPLATES) {
        for (const index of [0, 4]) {
          const placed = check(id, color, template, index);
          const worst = Math.min.apply(null, placed.bodyVisible);
          if (placed.bodyVisible.length !== meta.bodies.length || !(worst + 1e-6 >= F.GROUP_MIN_VISIBLE) || !placed.focusIn) {
            misses.push(template + "#" + index + " id" + id + " c" + color + " vis=" + worst.toFixed(3) + " faces=" + placed.focusIn);
          }
        }
      }
    }
  }
  assert.equal(misses.length, 0, misses.slice(0, 12).join("\n"));
});

test("焦点データは89人×8色", () => {
  assert.equal(focus.chars.length, 89);
  focus.chars.forEach((row) => {
    assert.equal(row.length, 8);
    row.forEach((cell) => {
      assert.equal(cell.length, 8);
      assert.ok(cell[4] >= cell[0] && cell[4] <= cell[2]);
      assert.ok(cell[5] >= cell[1] && cell[5] <= cell[3]);
    });
  });
});
