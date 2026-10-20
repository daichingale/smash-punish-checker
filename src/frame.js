/* ファイターの外接矩形と顔の位置から、Top8の枠への収め方を決める。
 * ブラウザと Node の両方で読める。画面の描画とテストが同じ計算を使う。 */
(function (root) {
  "use strict";

  const MIN_VISIBLE = 0.6;
  const GROUP_MIN_VISIBLE = 0.7;
  // 公式に単体切り抜きが無く、集合から重なりなく分けられないキャラ。画像全体を枠に収める。
  const CONTAIN = { 37: true, 38: true, 39: true, 85: true, 86: true };

  const CARDS = {
    slash: [
      { x: 20, y: 96, w: 800, h: 512, lean: 44, split: true },
      { x: 844, y: 96, w: 736, h: 244, lean: 26, split: true },
      { x: 844, y: 352, w: 360, h: 256, lean: 18, split: false },
      { x: 1216, y: 352, w: 364, h: 256, lean: 18, split: false },
      { x: 20, y: 624, w: 381, h: 244, lean: 16, split: false },
      { x: 413, y: 624, w: 381, h: 244, lean: 16, split: false },
      { x: 806, y: 624, w: 381, h: 244, lean: 16, split: false },
      { x: 1199, y: 624, w: 381, h: 244, lean: 16, split: false },
    ],
    minimal: [
      { x: 40, y: 124, w: 700, h: 500, place: 78, name: 58, sub: 72 },
      { x: 784, y: 124, w: 752, h: 230, place: 46, name: 38, sub: 52 },
      { x: 784, y: 386, w: 360, h: 238, place: 40, name: 32, sub: 48 },
      { x: 1184, y: 386, w: 360, h: 238, place: 40, name: 32, sub: 48 },
      { x: 40, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
      { x: 423, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
      { x: 806, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
      { x: 1189, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
    ],
    neon: [
      { x: 24, y: 100, w: 940, h: 508, r: 18, split: true },
      { x: 980, y: 100, w: 596, h: 240, r: 16, split: true },
      { x: 980, y: 356, w: 290, h: 252, r: 14, split: false },
      { x: 1286, y: 356, w: 290, h: 252, r: 14, split: false },
      { x: 24, y: 624, w: 379, h: 244, r: 14, split: false },
      { x: 415, y: 624, w: 379, h: 244, r: 14, split: false },
      { x: 806, y: 624, w: 379, h: 244, r: 14, split: false },
      { x: 1197, y: 624, w: 379, h: 244, r: 14, split: false },
    ],
    wa: [
      { x: 908, y: 78, w: 644, h: 492, r: 52, big: true },
      { x: 108, y: 78, w: 752, h: 156, r: 28, big: false },
      { x: 108, y: 246, w: 752, h: 156, r: 28, big: false },
      { x: 108, y: 414, w: 752, h: 156, r: 28, big: false },
      { x: 108, y: 604, w: 349, h: 220, r: 26, big: false },
      { x: 473, y: 604, w: 349, h: 220, r: 26, big: false },
      { x: 838, y: 604, w: 349, h: 220, r: 26, big: false },
      { x: 1203, y: 604, w: 349, h: 220, r: 26, big: false },
    ],
  };

  let table = null;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function load(data) {
    table = data && data.chars ? data : null;
  }

  function metaFor(id, color) {
    if (!table || !table.chars || !table.chars[id]) return null;
    const c = color >= 1 && color <= 8 ? color : 1;
    const row = table.chars[id][c - 1];
    if (!row) return null;
    return {
      l: row[0] / 1000, t: row[1] / 1000, r: row[2] / 1000, b: row[3] / 1000,
      fx: row[4] / 1000, fy: row[5] / 1000,
      iw: row[6], ih: row[7],
      minVisible: MIN_VISIBLE,
      contain: !!CONTAIN[id],
      bodies: CONTAIN[id] ? null : bodiesFor(id, c),
    };
  }

  function bodiesFor(id, color) {
    if (CONTAIN[id]) return null;
    if (!table || !table.bodies || !table.bodies[id]) return null;
    const list = table.bodies[id][color - 1];
    if (!list || list.length < 2) return null;
    return list.map((b) => ({
      l: b[0] / 1000, t: b[1] / 1000, r: b[2] / 1000, b: b[3] / 1000,
      fx: b[4] / 1000, fy: b[5] / 1000,
    }));
  }

  function cards(id) {
    return CARDS[id] || CARDS.slash;
  }

  function prefer(id, index) {
    const big = index === 0;
    if (id === "minimal") return { zoom: big ? 1.2 : 1.12, heroStart: 0.2, focusX: 0.5, focusY: 0.3 };
    if (id === "neon") return { zoom: big ? 1.26 : 1.16, heroStart: 0.16, focusX: 0.5, focusY: 0.3 };
    if (id === "wa") return { zoom: big ? 1.24 : 1.14, heroStart: 0.2, focusX: 0.5, focusY: 0.28 };
    return { zoom: big ? 1.22 : 1.16, heroStart: 0.18, focusX: 0.5, focusY: 0.3 };
  }

  function innerBox(id, card) {
    if (id === "minimal") return { x: card.x + 12, y: card.y + 8, w: card.w - 24, h: card.h - 16 };
    if (id === "neon") {
      const pad = 16;
      return { x: card.x + pad, y: card.y + 12, w: card.w - pad * 2, h: card.h - 24 };
    }
    if (id === "wa") {
      const r = card.r;
      const left = card.x + r * 2 + 16;
      return { x: left, y: card.y + 6, w: card.x + card.w - left - 8, h: card.h - 12 };
    }
    return {
      x: card.x + Math.round(card.lean * 0.55) + 14,
      y: card.y + 14,
      w: card.w - Math.round(card.lean * 0.95) - 24,
      h: card.h - 28,
    };
  }

  function heroViewport(id, index) {
    const card = cards(id)[index];
    const opt = prefer(id, index);
    const inner = innerBox(id, card);
    if (card.split) {
      const start = opt.heroStart;
      return {
        w: inner.w * (1 - start) + 12,
        h: inner.h + 16,
        zoom: opt.zoom,
        focusX: opt.focusX,
        focusY: opt.focusY,
      };
    }
    return { w: inner.w, h: inner.h, zoom: opt.zoom, focusX: opt.focusX, focusY: opt.focusY };
  }

  function intersect(bl, bt, br, bb, x0, y0, x1, y1) {
    const w = Math.min(br, x1) - Math.max(bl, x0);
    const h = Math.min(bb, y1) - Math.max(bt, y0);
    if (w <= 0 || h <= 0) return 0;
    return w * h;
  }

  function layoutAt(s, slotW, slotH, iw, ih, fx, fy, focusX, focusY, margin) {
    const winW = slotW / s;
    const winH = slotH / s;
    let visL = fx - winW * focusX;
    let visT = fy - winH * focusY;
    if (winW >= iw) visL = (iw - winW) / 2;
    else visL = clamp(visL, 0, iw - winW);
    if (winH >= ih) visT = (ih - winH) / 2;
    else visT = clamp(visT, 0, ih - winH);
    const insetX = Math.min(winW * margin, winW * 0.4);
    const insetY = Math.min(winH * margin, winH * 0.4);
    if (winW < iw) {
      visL = clamp(visL, fx - (winW - insetX), fx - insetX);
      visL = clamp(visL, 0, iw - winW);
      if (fx < visL) visL = clamp(fx, 0, iw - winW);
      if (fx > visL + winW) visL = clamp(fx - winW, 0, iw - winW);
    }
    if (winH < ih) {
      visT = clamp(visT, fy - (winH - insetY), fy - insetY);
      visT = clamp(visT, 0, ih - winH);
      if (fy < visT) visT = clamp(fy, 0, ih - winH);
      if (fy > visT + winH) visT = clamp(fy - winH, 0, ih - winH);
    }
    return { s: s, visL: visL, visT: visT, winW: winW, winH: winH };
  }

  function place(meta, iw, ih, slotW, slotH, preferOpts) {
    const opt = preferOpts || {};
    const zoom = opt.zoom == null ? 1.12 : opt.zoom;
    const focusX = opt.focusX == null ? 0.5 : opt.focusX;
    const focusY = opt.focusY == null ? 0.3 : opt.focusY;
    const margin = opt.margin == null ? 0.06 : opt.margin;
    if (!(iw > 0) || !(ih > 0) || !(slotW > 1) || !(slotH > 1)) {
      return { x: 0, y: 0, w: slotW, h: slotH, visible: 0, focusIn: false };
    }
    const cover = Math.max(slotW / iw, slotH / ih);
    if (!meta) {
      const s = cover * zoom;
      const dw = iw * s;
      const dh = ih * s;
      return { x: (slotW - dw) * 0.5, y: (slotH - dh) * focusY, w: dw, h: dh, visible: 1, focusIn: true };
    }
    if (meta.contain) {
      const s = Math.min(slotW / iw, slotH / ih);
      const dw = iw * s;
      const dh = ih * s;
      return { x: (slotW - dw) * 0.5, y: (slotH - dh) * 0.5, w: dw, h: dh, visible: 1, focusIn: true, bodyVisible: [1] };
    }
    const bodies = (meta.bodies || []).map((b) => ({
      l: b.l * iw, t: b.t * ih, r: b.r * iw, b: b.b * ih,
      fx: clamp(b.fx * iw, b.l * iw, b.r * iw),
      fy: clamp(b.fy * ih, b.t * ih, b.b * ih),
    }));
    const grouped = bodies.length >= 2;
    const bl = grouped ? Math.min.apply(null, bodies.map((b) => b.l)) : meta.l * iw;
    const bt = grouped ? Math.min.apply(null, bodies.map((b) => b.t)) : meta.t * ih;
    const br = grouped ? Math.max.apply(null, bodies.map((b) => b.r)) : meta.r * iw;
    const bb = grouped ? Math.max.apply(null, bodies.map((b) => b.b)) : meta.b * ih;
    const bw = Math.max(1, br - bl);
    const bh = Math.max(1, bb - bt);
    const fx = grouped ? bodies.reduce((s, b) => s + b.fx, 0) / bodies.length : clamp(meta.fx * iw, bl, br);
    const fy = grouped ? bodies.reduce((s, b) => s + b.fy, 0) / bodies.length : clamp(meta.fy * ih, bt, bb);
    const minVis = grouped ? GROUP_MIN_VISIBLE : (meta.minVisible == null ? MIN_VISIBLE : meta.minVisible);
    const bold = cover * Math.max(1, zoom);
    const fitAll = Math.min(slotW / bw, slotH / bh) * 0.98;
    const lo = Math.min(bold, Math.max(0.05, fitAll));

    function score(s) {
      if (!grouped) {
        const lay = layoutAt(s, slotW, slotH, iw, ih, fx, fy, focusX, focusY, margin);
        const vis = intersect(bl, bt, br, bb, lay.visL, lay.visT, lay.visL + lay.winW, lay.visT + lay.winH) / (bw * bh);
        const focusIn = fx >= lay.visL - 0.01 && fx <= lay.visL + lay.winW + 0.01 && fy >= lay.visT - 0.01 && fy <= lay.visT + lay.winH + 0.01;
        return { lay: lay, visible: vis, focusIn: focusIn, bodyVisible: [vis] };
      }
      const winW = slotW / s;
      const winH = slotH / s;
      let visL = (bl + br) / 2 - winW / 2;
      if (winW >= iw) visL = (iw - winW) / 2;
      else visL = clamp(visL, 0, iw - winW);
      const fL = Math.min.apply(null, bodies.map((b) => b.fx));
      const fR = Math.max.apply(null, bodies.map((b) => b.fx));
      if (winW < iw && fR - fL <= winW) {
        if (fL < visL) visL = fL;
        if (fR > visL + winW) visL = fR - winW;
        visL = clamp(visL, 0, iw - winW);
      }
      // 縦は頭の天辺を優先する。足りないときは足元を切り、顔は必ず残す。
      const headTop = Math.min.apply(null, bodies.map((b) => Math.min(b.t, b.fy)));
      const faceBot = Math.max.apply(null, bodies.map((b) => b.fy));
      let visT;
      if (winH >= ih) visT = (ih - winH) / 2;
      else {
        visT = headTop;
        if (faceBot > visT + winH) visT = faceBot - winH;
        visT = clamp(visT, 0, ih - winH);
      }
      const bodyVisible = bodies.map((b) => {
        const area = Math.max(1, (b.r - b.l) * (b.b - b.t));
        return intersect(b.l, b.t, b.r, b.b, visL, visT, visL + winW, visT + winH) / area;
      });
      const focusIn = bodies.every((b) => {
        const face = b.fx >= visL - 0.5 && b.fx <= visL + winW + 0.5 && b.fy >= visT - 0.5 && b.fy <= visT + winH + 0.5;
        const crown = b.t >= visT - 0.5 && b.t <= visT + winH + 0.5;
        return face && crown;
      });
      return {
        lay: { s: s, visL: visL, visT: visT, winW: winW, winH: winH },
        visible: Math.min.apply(null, bodyVisible),
        focusIn: focusIn,
        bodyVisible: bodyVisible,
      };
    }

    let chosen = score(bold);
    if (!(chosen.visible + 1e-6 >= minVis && chosen.focusIn)) {
      let a = lo;
      let b = bold;
      chosen = score(lo);
      for (let i = 0; i < 20; i++) {
        const mid = (a + b) / 2;
        const trial = score(mid);
        if (trial.visible + 1e-6 >= minVis && trial.focusIn) {
          chosen = trial;
          a = mid;
        } else b = mid;
      }
      if (!(chosen.visible + 1e-6 >= minVis && chosen.focusIn)) chosen = score(lo);
    }
    const lay = chosen.lay;
    return {
      x: -lay.visL * lay.s,
      y: -lay.visT * lay.s,
      w: iw * lay.s,
      h: ih * lay.s,
      visible: chosen.visible,
      focusIn: chosen.focusIn,
      bodyVisible: chosen.bodyVisible || [chosen.visible],
    };
  }

  const api = {
    MIN_VISIBLE: MIN_VISIBLE,
    GROUP_MIN_VISIBLE: GROUP_MIN_VISIBLE,
    load: load,
    metaFor: metaFor,
    cards: cards,
    prefer: prefer,
    innerBox: innerBox,
    heroViewport: heroViewport,
    place: place,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FighterFrame = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
