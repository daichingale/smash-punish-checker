const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/preview.js");

test("縦横比に近いサイズを選ぶ", () => {
  assert.equal(P.pickPreset(1600, 900), "x");
  assert.equal(P.pickPreset(1080, 1080), "square");
  assert.equal(P.pickPreset(760, 1400), "story");
});

test("画像は枠の中に収めて中央に置く", () => {
  const rect = P.containRect(1600, 900, 1080, 1080);
  assert.equal(rect.w, 1080);
  assert.equal(rect.h, 607.5);
  assert.equal(rect.x, 0);
  assert.equal(rect.y, 236.25);
});

test("手前のオブジェクトと選択中のハンドルを先に拾う", () => {
  const objs = [
    { id: "a", x: 0, y: 0, w: 100, h: 100 },
    { id: "b", x: 50, y: 50, w: 100, h: 100 },
  ];
  assert.deepEqual(P.hitTest(objs, 60, 60, null, 4), { id: "b", handle: null });
  assert.deepEqual(P.hitTest(objs, 10, 10, null, 4), { id: "a", handle: null });
  assert.equal(P.hitTest(objs, 200, 200, null, 4), null);
  assert.equal(P.hitTest(objs, 102, 98, "a", 6).handle, "se");
  assert.equal(P.hitTest(objs, 102, 98, "a", 6).id, "a");
});

test("四角は辺ごとに拡縮し、文字は対角を固定して等比で拡縮する", () => {
  const box = { x: 10, y: 20, w: 100, h: 40 };
  const free = P.resizeFree(box, "se", 80, 90);
  assert.deepEqual(free, { x: 10, y: 20, w: 70, h: 70 });
  const tiny = P.resizeFree(box, "nw", 200, 200);
  assert.equal(tiny.w, 12);
  assert.equal(tiny.h, 12);
  const uniform = P.resizeUniform(box, "se", 210, 100);
  assert.equal(uniform.scale, 2);
  assert.equal(uniform.x, 10);
  assert.equal(uniform.y, 20);
  assert.equal(uniform.w, 200);
  assert.equal(uniform.h, 80);
});

test("移動はキャンバス内に少し残し、サイズ変更で座標を倍率する", () => {
  const moved = P.moveObject({ x: 0, y: 0, w: 100, h: 50 }, -200, 10, 500, 400);
  assert.equal(moved.x, 0);
  assert.equal(moved.y, 10);
  const far = P.moveObject({ x: 0, y: 0, w: 100, h: 50 }, 450, 0, 500, 400);
  assert.equal(far.x, 400);
  const scaled = P.scaleObjects(
    [{ id: 1, x: 100, y: 50, w: 200, h: 100, fontSize: 40, strokeWidth: 4 }],
    1000, 500, 2000, 1000
  );
  assert.equal(scaled[0].x, 200);
  assert.equal(scaled[0].y, 100);
  assert.equal(scaled[0].w, 400);
  assert.equal(scaled[0].h, 200);
  assert.equal(scaled[0].fontSize, 80);
  assert.equal(scaled[0].strokeWidth, 8);
});

test("レイヤーは前面・背面に1つずつ動く", () => {
  const objs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(P.bringForward(objs, "b").map((o) => o.id), ["a", "c", "b"]);
  assert.deepEqual(P.sendBackward(objs, "b").map((o) => o.id), ["b", "a", "c"]);
  assert.deepEqual(P.bringForward(objs, "c").map((o) => o.id), ["a", "b", "c"]);
});

test("整列はキャンバス基準と選択範囲基準を切り替えられる", () => {
  const objs = [
    { id: "a", x: 10, y: 20, w: 100, h: 40 },
    { id: "b", x: 40, y: 80, w: 30, h: 20 },
  ];
  const canvas = { x: 0, y: 0, w: 200, h: 200 };
  const left = P.alignObjects(objs, ["a", "b"], "left", canvas);
  assert.equal(left[0].x, 0);
  assert.equal(left[1].x, 0);
  assert.equal(left[0].y, 20);
  const mid = P.alignObjects(objs, ["a"], "centerX", canvas);
  assert.equal(mid[0].x, 50);
  assert.equal(mid[1].x, 40);
  const bottom = P.alignObjects(objs, ["b"], "bottom", canvas);
  assert.equal(bottom[1].y, 180);
  const bounds = P.boundsOf(objs);
  assert.deepEqual(bounds, { x: 10, y: 20, w: 100, h: 80 });
  const grouped = P.alignObjects(objs, ["a", "b"], "right", bounds);
  assert.equal(grouped[0].x, 10);
  assert.equal(grouped[1].x, 80);
});

test("中央に近い移動だけガイド用にスナップする", () => {
  const hit = P.snapCenter({ x: 86, y: 36, w: 20, h: 20 }, 200, 100, 8);
  assert.equal(hit.x, 90);
  assert.equal(hit.y, 40);
  assert.deepEqual(hit.guides.slice().sort(), ["h", "v"]);
  const miss = P.snapCenter({ x: 10, y: 10, w: 20, h: 20 }, 200, 100, 8);
  assert.equal(miss.x, 10);
  assert.equal(miss.y, 10);
  assert.deepEqual(miss.guides, []);
});

test("PDFはJPEGを1ページに埋め、外部リンクを持たない", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3]);
  const pdf = P.buildPdf(jpeg, 1600, 900);
  const text = Buffer.from(pdf).toString("latin1");
  assert.equal(text.startsWith("%PDF-1.4\n"), true);
  assert.equal(text.includes("/Width 1600"), true);
  assert.equal(text.includes("/Height 900"), true);
  assert.equal(text.includes("/Filter /DCTDecode"), true);
  assert.equal(text.includes("http"), false);
  const xrefAt = text.indexOf("xref\n");
  const start = text.match(/startxref\n(\d+)/);
  assert.equal(Number(start[1]), xrefAt);
  assert.equal(text.trimEnd().endsWith("%%EOF"), true);
  assert.equal(Buffer.from(pdf).includes(Buffer.from(jpeg)), true);
});
