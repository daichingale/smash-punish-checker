/* 画像プレビュー。リザルト・Top8・ティア表で共用する簡易エディタ。
 * 下地の画像は固定。文字と四角・円を載せて、PNG / PDF / コピー / 共有する。
 * ブラウザと Node の両方で読める。画面は document があるときだけ組み立てる。 */
(function (root) {
  "use strict";

  const PRESETS = [
    { id: "x", label: "横長", w: 1600, h: 900 },
    { id: "square", label: "正方形", w: 1080, h: 1080 },
    { id: "story", label: "縦長", w: 1080, h: 1920 },
  ];
  const HANDLES = ["nw", "ne", "se", "sw"];
  const MIN_SIZE = 12;

  function presetById(id) {
    return PRESETS.find((p) => p.id === id) || PRESETS[0];
  }

  function pickPreset(srcW, srcH) {
    const aspect = srcW > 0 && srcH > 0 ? srcW / srcH : 1;
    let best = PRESETS[0];
    let score = Infinity;
    PRESETS.forEach((p) => {
      const d = Math.abs(Math.log(aspect) - Math.log(p.w / p.h));
      if (d < score) {
        score = d;
        best = p;
      }
    });
    return best.id;
  }

  function containRect(srcW, srcH, dstW, dstH) {
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    return { x: (dstW - w) / 2, y: (dstH - h) / 2, w: w, h: h };
  }

  function handlePoint(obj, handle) {
    if (handle === "nw") return { x: obj.x, y: obj.y };
    if (handle === "ne") return { x: obj.x + obj.w, y: obj.y };
    if (handle === "se") return { x: obj.x + obj.w, y: obj.y + obj.h };
    return { x: obj.x, y: obj.y + obj.h };
  }

  function hitTest(objects, x, y, selectedId, radius) {
    const r = radius > 0 ? radius : 0;
    if (selectedId != null) {
      const sel = objects.find((o) => o.id === selectedId);
      if (sel) {
        for (let i = 0; i < HANDLES.length; i++) {
          const handle = HANDLES[i];
          const p = handlePoint(sel, handle);
          if (Math.hypot(p.x - x, p.y - y) <= r) return { id: sel.id, handle: handle };
        }
      }
    }
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return { id: o.id, handle: null };
    }
    return null;
  }

  function resizeFree(obj, handle, px, py, min) {
    const limit = min == null ? MIN_SIZE : min;
    let left = obj.x;
    let top = obj.y;
    let right = obj.x + obj.w;
    let bottom = obj.y + obj.h;
    if (handle === "nw" || handle === "sw") left = Math.min(px, right - limit);
    if (handle === "ne" || handle === "se") right = Math.max(px, left + limit);
    if (handle === "nw" || handle === "ne") top = Math.min(py, bottom - limit);
    if (handle === "se" || handle === "sw") bottom = Math.max(py, top + limit);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function resizeUniform(obj, handle, px, py, min) {
    const limit = min == null ? MIN_SIZE : min;
    const anchorName = { nw: "se", ne: "sw", se: "nw", sw: "ne" }[handle];
    const anchor = handlePoint(obj, anchorName);
    const origin = handlePoint(obj, handle);
    const vx = origin.x - anchor.x;
    const vy = origin.y - anchor.y;
    const start = Math.hypot(vx, vy) || 1;
    let scale = Math.hypot(px - anchor.x, py - anchor.y) / start;
    const minScale = limit / Math.max(obj.w, obj.h, 1);
    if (scale < minScale) scale = minScale;
    const hx = anchor.x + vx * scale;
    const hy = anchor.y + vy * scale;
    return {
      x: Math.min(anchor.x, hx),
      y: Math.min(anchor.y, hy),
      w: Math.abs(hx - anchor.x),
      h: Math.abs(hy - anchor.y),
      scale: scale,
    };
  }

  function moveObject(obj, dx, dy, canvasW, canvasH) {
    let x = obj.x + dx;
    let y = obj.y + dy;
    if (obj.w <= canvasW) x = Math.min(Math.max(0, x), canvasW - obj.w);
    else x = Math.min(0, Math.max(canvasW - obj.w, x));
    if (obj.h <= canvasH) y = Math.min(Math.max(0, y), canvasH - obj.h);
    else y = Math.min(0, Math.max(canvasH - obj.h, y));
    return { x: x, y: y };
  }

  function scaleObjects(objects, fromW, fromH, toW, toH) {
    const sx = toW / fromW;
    const sy = toH / fromH;
    const strokeScale = (sx + sy) / 2;
    return objects.map((o) => {
      const n = Object.assign({}, o);
      n.x = o.x * sx;
      n.y = o.y * sy;
      n.w = o.w * sx;
      n.h = o.h * sy;
      if (o.fontSize) n.fontSize = o.fontSize * sy;
      if (o.strokeWidth) n.strokeWidth = o.strokeWidth * strokeScale;
      return n;
    });
  }

  function bringForward(objects, id) {
    return reorder(objects, id, 1);
  }
  function sendBackward(objects, id) {
    return reorder(objects, id, -1);
  }
  function reorder(objects, id, dir) {
    const list = objects.slice();
    const i = list.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    return list;
  }

  function concatBytes(parts) {
    let len = 0;
    parts.forEach((p) => { len += p.length; });
    const out = new Uint8Array(len);
    let offset = 0;
    parts.forEach((p) => {
      out.set(p, offset);
      offset += p.length;
    });
    return out;
  }

  /** JPEG を1ページの PDF に埋め込む。外部サービスは使わない。 */
  function buildPdf(jpegBytes, width, height) {
    const w = Math.round(width);
    const h = Math.round(height);
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    const lengthSoFar = () => parts.reduce((n, p) => n + p.length, 0);
    const pushStr = (s) => parts.push(enc.encode(s));
    const obj = (n, body) => {
      offsets[n] = lengthSoFar();
      pushStr(n + " 0 obj\n");
      parts.push(body);
      pushStr("\nendobj\n");
    };
    pushStr("%PDF-1.4\n");
    obj(1, enc.encode("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, enc.encode("<< /Type /Pages /Count 1 /Kids [3 0 R] >>"));
    obj(3, enc.encode(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + h +
      "] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"
    ));
    const content = enc.encode("q\n" + w + " 0 0 " + h + " 0 0 cm\n/Im0 Do\nQ\n");
    obj(4, concatBytes([
      enc.encode("<< /Length " + content.length + " >>\nstream\n"),
      content,
      enc.encode("\nendstream"),
    ]));
    const image = jpegBytes instanceof Uint8Array ? jpegBytes : new Uint8Array(jpegBytes);
    obj(5, concatBytes([
      enc.encode(
        "<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
        image.length + " >>\nstream\n"
      ),
      image,
      enc.encode("\nendstream"),
    ]));
    const xrefAt = lengthSoFar();
    let xref = "xref\n0 6\n0000000000 65535 f \n";
    for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    pushStr(xref + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF\n");
    return concatBytes(parts);
  }

  const api = {
    PRESETS, HANDLES, pickPreset, containRect, handlePoint, hitTest,
    resizeFree, resizeUniform, moveObject, scaleObjects, bringForward, sendBackward, buildPdf,
  };

  if (typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    return;
  }

  const CSS = `
.ip{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;width:100%;max-width:100vw;overflow:hidden;background:#1b1b1b;color:#f3f3f3;font:14px/1.4 "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif}
.ip *{box-sizing:border-box}
.ip-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px;background:#2c2c2c;border-bottom:1px solid #111}
.ip button,.ip-top button{font:inherit;color:#f4f4f4;background:#3c3c3c;border:1px solid #5a5a5a;border-radius:8px;padding:6px 10px;min-height:36px}
.ip button:disabled{opacity:.4}
.ip-title{font-weight:700;margin-right:4px}
.ip-presets,.ip-zoom,.ip-history,.ip-export,.ip-themes{display:flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:100%}
.ip-bg{display:flex;align-items:center;gap:4px;font-size:12px;color:#ddd}
.ip-bg input[type=color]{width:36px;height:28px;padding:0;border:1px solid #666;background:transparent}
.ip-themes button{width:28px;min-height:28px;padding:0}
.ip-export button{background:#1f6feb;border-color:#1f6feb}
.ip-zoom span{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}
.ip-main{flex:1;min-height:0;min-width:0;position:relative;display:flex}
.ip-stage{flex:1;min-width:0;min-height:0}
.ip-stage canvas{width:100%;height:100%;display:block;touch-action:none}
.ip-tools,.ip-props,.ip-layers{display:none}
.ip-sheet-tools,.ip-sheet-props,.ip-sheet-layers{position:absolute;left:8px;right:8px;bottom:8px;z-index:2;background:#2a2a2a;border:1px solid #444;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.4);max-height:46%;overflow:auto}
.ip.show-tools .ip-tools{display:flex;flex-direction:row;justify-content:space-around;padding:8px}
.ip.show-props .ip-props,.ip.show-layers .ip-layers{display:block;padding:12px}
.ip-tools button{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:52px;font-size:11px;background:transparent}
.ip-tools button[aria-pressed=true],.ip-presets button[aria-pressed=true]{background:#1f6feb;border-color:#9cc4ff}
.ip-tools svg{width:22px;height:22px;display:block}
.ip-props h2,.ip-layers h2{margin:0 0 8px;font-size:13px}
.ip-help{margin:0;color:#c8c8c8}
.ip-field{display:flex;flex-direction:column;gap:4px;margin:0 0 10px;font-size:12px;color:#ddd}
.ip-field input[type=text],.ip-field textarea,.ip-field input[type=range]{width:100%;font:inherit;color:#111;background:#fff;border:1px solid #888;border-radius:6px;padding:6px 8px}
.ip-row{display:flex;gap:8px;align-items:center}
.ip-row .ip-field{flex:1}
.ip-check{display:flex;align-items:center;gap:6px;margin:0 0 10px}
.ip-layers ul{list-style:none;margin:0;padding:0}
.ip-layers li{display:flex;align-items:center;gap:6px;border-bottom:1px solid #3a3a3a}
.ip-layers li.on{background:#24344a}
.ip-layers li button.name{flex:1;text-align:left;background:transparent;border:none;border-radius:0;min-height:40px}
.ip-layers li button.mini{min-height:32px;padding:4px 8px}
.ip-lock{padding:10px 8px;color:#aaa}
.ip-tabs{display:flex;background:#2c2c2c;border-top:1px solid #111;padding-bottom:env(safe-area-inset-bottom)}
.ip-tabs button{flex:1;border:none;border-radius:0;background:transparent;min-height:48px}
.ip-tabs button[aria-pressed=true]{color:#9cc4ff}
.ip-toast{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;max-width:calc(100% - 24px);z-index:3}
@media (min-width:900px){
  .ip-tabs{display:none}
  .ip-main{display:grid;grid-template-columns:76px minmax(0,1fr) 280px;grid-template-rows:minmax(0,1fr) minmax(140px,34%)}
  .ip-tools{display:flex;flex-direction:column;grid-column:1;grid-row:1 / span 2;position:static;left:auto;right:auto;bottom:auto;border-right:1px solid #111;background:#262626;padding:8px 6px;gap:6px;max-height:none;border-radius:0;box-shadow:none}
  .ip-stage{grid-column:2;grid-row:1 / span 2}
  .ip-props,.ip-layers{display:block;position:static;left:auto;right:auto;bottom:auto;max-height:none;border:none;border-radius:0;box-shadow:none;background:#262626}
  .ip-props{grid-column:3;grid-row:1;border-left:1px solid #111;border-bottom:1px solid #333;overflow:auto}
  .ip-layers{grid-column:3;grid-row:2;border-left:1px solid #111;overflow:auto}
}
`;

  let shell = null;

  function ensureStyle() {
    if (document.getElementById("ip-style")) return;
    const style = document.createElement("style");
    style.id = "ip-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function toast(msg) {
    if (!shell) return;
    const el = shell.toast;
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function download(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function pdfFilename(filename) {
    return String(filename || "image.png").replace(/\.png$/i, "") + ".pdf";
  }

  function isDark(hex) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    if (!Number.isFinite(n)) return false;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return r * 0.299 + g * 0.587 + b * 0.114 < 150;
  }

  function sampleCorner(bitmap) {
    try {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bitmap, 0, 0, 1, 1, 0, 0, 1, 1);
      const px = g.getImageData(0, 0, 1, 1).data;
      return "#" + [px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return "#ffffff";
    }
  }

  function fontOf(obj) {
    return (obj.bold ? "700 " : "400 ") + obj.fontSize + "px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
  }

  function measureTextBox(obj) {
    const canvas = measureTextBox._c || (measureTextBox._c = document.createElement("canvas"));
    const g = canvas.getContext("2d");
    g.font = fontOf(obj);
    const width = Math.max(MIN_SIZE, g.measureText(obj.text || " ").width + (obj.strokeWidth || 0));
    return { w: width, h: Math.max(MIN_SIZE, obj.fontSize * 1.25) };
  }

  function drawObject(g, obj) {
    if (obj.type === "text") {
      g.font = fontOf(obj);
      g.textBaseline = "top";
      g.lineJoin = "round";
      if (obj.strokeWidth > 0) {
        g.strokeStyle = obj.stroke || "#000000";
        g.lineWidth = obj.strokeWidth;
        g.strokeText(obj.text || "", obj.x, obj.y);
      }
      g.fillStyle = obj.color || "#111111";
      g.fillText(obj.text || "", obj.x, obj.y);
      return;
    }
    g.beginPath();
    if (obj.type === "ellipse") {
      g.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, Math.max(0.5, obj.w / 2), Math.max(0.5, obj.h / 2), 0, 0, Math.PI * 2);
    } else {
      g.rect(obj.x, obj.y, obj.w, obj.h);
    }
    g.fillStyle = obj.fill || "#ff5a5a";
    g.fill();
    if (obj.strokeWidth > 0) {
      g.strokeStyle = obj.stroke || "#111111";
      g.lineWidth = obj.strokeWidth;
      g.stroke();
    }
  }

  function paintArtboard(g, model, opts) {
    const w = model.preset.w;
    const h = model.preset.h;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    g.fillStyle = model.bg;
    g.fillRect(0, 0, w, h);
    if (model.bitmap) {
      const rect = containRect(model.bitmap.width, model.bitmap.height, w, h);
      g.drawImage(model.bitmap, rect.x, rect.y, rect.w, rect.h);
    }
    model.objects.forEach((obj) => drawObject(g, obj));
    if (model.draft) drawObject(g, model.draft);
    g.restore();
    if (!opts || !opts.handles || !model.selected) return;
    const sel = model.objects.find((o) => o.id === model.selected);
    if (!sel) return;
    const inv = opts.invZoom || 1;
    g.save();
    g.strokeStyle = "#4c9aff";
    g.lineWidth = 1.5 * inv;
    g.strokeRect(sel.x, sel.y, sel.w, sel.h);
    const size = 8 * inv;
    g.fillStyle = "#ffffff";
    HANDLES.forEach((handle) => {
      const p = handlePoint(sel, handle);
      g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      g.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    });
    g.restore();
  }

  function layerName(obj) {
    if (obj.type === "text") {
      const text = (obj.text || "").trim() || "文字";
      return text.length > 14 ? text.slice(0, 14) + "…" : text;
    }
    return obj.type === "ellipse" ? "円" : "四角";
  }

  const ICONS = {
    select: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3l6.2 16 2.1-6.2L19 11z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11h1V4.5a1.5 1.5 0 0 1 3 0V11h1V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2A5.8 5.8 0 0 1 6 15.2V9.5a1.5 1.5 0 0 1 3 0V11z"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5h14v3h-5.2v11h-3.6V8H5z"/></svg>',
    rect: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    ellipse: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };

  function toolButton(id, label) {
    return '<button type="button" data-tool="' + id + '" aria-pressed="false">' + ICONS[id] + "<span>" + label + "</span></button>";
  }

  async function toBitmap(source) {
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) return source;
    if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) return createImageBitmap(source);
    if (source instanceof Blob) return createImageBitmap(source);
    throw new Error("画像を読めませんでした");
  }

  function open(opts) {
    ensureStyle();
    return toBitmap(opts.source).then((bitmap) => {
      if (shell) shell.destroy(true);
      mount(bitmap, opts || {});
    });
  }

  function mount(bitmap, opts) {
    const presetId = pickPreset(bitmap.width, bitmap.height);
    const state = {
      bitmap: bitmap,
      title: opts.title || "プレビュー",
      filename: opts.filename || "image.png",
      bg: sampleCorner(bitmap),
      preset: presetById(presetId),
      objects: [],
      selected: null,
      draft: null,
      tool: "select",
      nextId: 1,
      view: { zoom: 1, panX: 0, panY: 0 },
      userView: false,
      history: [],
      index: -1,
      drag: null,
      coarse: window.matchMedia("(pointer: coarse)").matches,
    };

    const rootEl = document.createElement("div");
    rootEl.className = "ip";
    rootEl.setAttribute("role", "dialog");
    rootEl.setAttribute("aria-modal", "true");
    rootEl.setAttribute("aria-label", state.title);
    rootEl.innerHTML =
      '<header class="ip-top">' +
        '<button type="button" data-act="close">閉じる</button>' +
        '<strong class="ip-title"></strong>' +
        '<div class="ip-presets" role="group" aria-label="サイズ">' +
          '<button type="button" data-preset="x">横長</button>' +
          '<button type="button" data-preset="square">正方形</button>' +
          '<button type="button" data-preset="story">縦長</button>' +
        "</div>" +
        '<div class="ip-themes" role="group" aria-label="背景">' +
          '<button type="button" data-bg="#ffffff" style="background:#ffffff" aria-label="白"></button>' +
          '<button type="button" data-bg="#111111" style="background:#111111" aria-label="黒"></button>' +
          '<button type="button" data-bg="#0e1116" style="background:#0e1116" aria-label="紺"></button>' +
          '<button type="button" data-bg="#f4efe6" style="background:#f4efe6" aria-label="生成り"></button>' +
        "</div>" +
        '<label class="ip-bg">背景<input type="color" data-act="bg"></label>' +
        '<div class="ip-zoom">' +
          '<button type="button" data-act="zoomout" aria-label="縮小">−</button>' +
          '<span data-act="zoomlabel">100%</span>' +
          '<button type="button" data-act="zoomin" aria-label="拡大">＋</button>' +
          '<button type="button" data-act="fit">全体</button>' +
        "</div>" +
        '<div class="ip-history">' +
          '<button type="button" data-act="undo">戻す</button>' +
          '<button type="button" data-act="redo">進む</button>' +
        "</div>" +
        '<div class="ip-export">' +
          '<button type="button" data-act="png">PNG</button>' +
          '<button type="button" data-act="pdf">PDF</button>' +
          '<button type="button" data-act="copy">コピー</button>' +
          '<button type="button" data-act="share">共有</button>' +
        "</div>" +
      "</header>" +
      '<div class="ip-main">' +
        '<nav class="ip-tools ip-sheet-tools" aria-label="ツール">' +
          toolButton("select", "選択") +
          toolButton("hand", "移動") +
          toolButton("text", "文字") +
          toolButton("rect", "四角") +
          toolButton("ellipse", "円") +
        "</nav>" +
        '<div class="ip-stage"><canvas></canvas></div>' +
        '<section class="ip-props ip-sheet-props" aria-label="調整"></section>' +
        '<section class="ip-layers ip-sheet-layers" aria-label="レイヤー"></section>' +
      "</div>" +
      '<nav class="ip-tabs" aria-label="パネル">' +
        '<button type="button" data-tab="tools" aria-pressed="false">ツール</button>' +
        '<button type="button" data-tab="props" aria-pressed="false">調整</button>' +
        '<button type="button" data-tab="layers" aria-pressed="false">レイヤー</button>' +
      "</nav>" +
      '<p class="ip-toast" hidden role="status"></p>';

    document.body.appendChild(rootEl);
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const canvas = rootEl.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const stage = rootEl.querySelector(".ip-stage");
    const propsEl = rootEl.querySelector(".ip-props");
    const layersEl = rootEl.querySelector(".ip-layers");
    const bgInput = rootEl.querySelector('[data-act="bg"]');
    rootEl.querySelector(".ip-title").textContent = state.title;
    bgInput.value = /^#[0-9a-fA-F]{6}$/.test(state.bg) ? state.bg : "#ffffff";

    function snapshot() {
      return JSON.stringify({ bg: state.bg, preset: state.preset.id, objects: state.objects });
    }
    function pushHistory() {
      const snap = snapshot();
      if (state.history[state.index] === snap) return;
      state.history = state.history.slice(0, state.index + 1);
      state.history.push(snap);
      if (state.history.length > 40) state.history.shift();
      state.index = state.history.length - 1;
      syncHistoryButtons();
    }
    function restore(snap) {
      const data = JSON.parse(snap);
      state.bg = data.bg;
      state.preset = presetById(data.preset);
      state.objects = data.objects;
      if (state.selected != null && !state.objects.some((o) => o.id === state.selected)) state.selected = null;
      bgInput.value = /^#[0-9a-fA-F]{6}$/.test(state.bg) ? state.bg : "#ffffff";
      syncPresetButtons();
      renderLayers();
      renderProps();
      renderCanvas();
      syncHistoryButtons();
    }
    function undo() {
      const live = snapshot();
      if (state.history[state.index] !== live) {
        state.history = state.history.slice(0, state.index + 1);
        state.history.push(live);
        if (state.history.length > 40) state.history.shift();
        state.index = state.history.length - 1;
      }
      if (state.index <= 0) return;
      state.index -= 1;
      restore(state.history[state.index]);
    }
    function redo() {
      if (state.index >= state.history.length - 1) return;
      state.index += 1;
      restore(state.history[state.index]);
    }
    function syncHistoryButtons() {
      rootEl.querySelector('[data-act="undo"]').disabled = state.index <= 0;
      rootEl.querySelector('[data-act="redo"]').disabled = state.index >= state.history.length - 1;
    }
    function syncPresetButtons() {
      rootEl.querySelectorAll("[data-preset]").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.preset === state.preset.id ? "true" : "false");
      });
    }
    function syncToolButtons() {
      rootEl.querySelectorAll("[data-tool]").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.tool === state.tool ? "true" : "false");
      });
      canvas.style.cursor = state.tool === "hand" ? "grab" : state.tool === "text" ? "text" : state.tool === "select" ? "default" : "crosshair";
    }
    function setTool(tool) {
      state.tool = tool;
      syncToolButtons();
    }
    function selectedObject() {
      return state.objects.find((o) => o.id === state.selected) || null;
    }
    function fit() {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (sw < 10 || sh < 10) return;
      const pad = 28;
      const zoom = Math.min((sw - pad * 2) / state.preset.w, (sh - pad * 2) / state.preset.h);
      state.view.zoom = Math.max(0.02, zoom);
      state.view.panX = (sw - state.preset.w * state.view.zoom) / 2;
      state.view.panY = (sh - state.preset.h * state.view.zoom) / 2;
      state.userView = false;
    }
    function setZoom(next, anchorX, anchorY) {
      const zoom = Math.min(8, Math.max(0.05, next));
      const canvasX = (anchorX - state.view.panX) / state.view.zoom;
      const canvasY = (anchorY - state.view.panY) / state.view.zoom;
      state.view.zoom = zoom;
      state.view.panX = anchorX - canvasX * zoom;
      state.view.panY = anchorY - canvasY * zoom;
      state.userView = true;
      renderCanvas();
    }
    function renderCanvas() {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(sw * dpr));
      canvas.height = Math.max(1, Math.round(sh * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#141414";
      ctx.fillRect(0, 0, sw, sh);
      ctx.save();
      ctx.translate(state.view.panX, state.view.panY);
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = state.bg;
      ctx.fillRect(0, 0, state.preset.w * state.view.zoom, state.preset.h * state.view.zoom);
      ctx.restore();
      ctx.save();
      ctx.translate(state.view.panX, state.view.panY);
      ctx.scale(state.view.zoom, state.view.zoom);
      paintArtboard(ctx, state, { handles: true, invZoom: 1 / state.view.zoom });
      ctx.restore();
      rootEl.querySelector('[data-act="zoomlabel"]').textContent = Math.round(state.view.zoom * 100) + "%";
    }
    function exportCanvas() {
      const out = document.createElement("canvas");
      out.width = state.preset.w;
      out.height = state.preset.h;
      const g = out.getContext("2d");
      const draft = state.draft;
      state.draft = null;
      paintArtboard(g, state, { handles: false });
      state.draft = draft;
      return out;
    }
    function canvasBlob(type, quality) {
      return new Promise((resolve) => exportCanvas().toBlob((blob) => resolve(blob), type, quality));
    }
    function renderProps() {
      const obj = selectedObject();
      propsEl.innerHTML = "<h2>調整</h2>";
      if (!obj) {
        const p = document.createElement("p");
        p.className = "ip-help";
        p.textContent = "選択で文字や図形を選べます。文字は置きたい場所をタップします。四角と円はドラッグで描きます。";
        propsEl.appendChild(p);
        return;
      }
      if (obj.type === "text") {
        addField("文字", "text", obj.text, (value) => {
          obj.text = value.replace(/\r?\n/g, "");
          const box = measureTextBox(obj);
          obj.w = box.w;
          obj.h = box.h;
          renderCanvas();
          renderLayers();
        });
        addRange("サイズ", 12, 240, Math.round(obj.fontSize), (value) => {
          obj.fontSize = value;
          const box = measureTextBox(obj);
          obj.w = box.w;
          obj.h = box.h;
          renderCanvas();
        });
        addColor("色", obj.color, (value) => { obj.color = value; renderCanvas(); });
        const bold = document.createElement("label");
        bold.className = "ip-check";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!obj.bold;
        check.onchange = () => {
          obj.bold = check.checked;
          const box = measureTextBox(obj);
          obj.w = box.w;
          obj.h = box.h;
          pushHistory();
          renderCanvas();
        };
        bold.appendChild(check);
        bold.appendChild(document.createTextNode("太字"));
        propsEl.appendChild(bold);
        addColor("縁の色", obj.stroke, (value) => { obj.stroke = value; renderCanvas(); });
        addRange("縁の太さ", 0, 24, Math.round(obj.strokeWidth || 0), (value) => {
          obj.strokeWidth = value;
          const box = measureTextBox(obj);
          obj.w = box.w;
          obj.h = box.h;
          renderCanvas();
        });
      } else {
        addColor("塗り", obj.fill, (value) => { obj.fill = value; renderCanvas(); });
        addColor("線の色", obj.stroke, (value) => { obj.stroke = value; renderCanvas(); });
        addRange("線の太さ", 0, 40, Math.round(obj.strokeWidth || 0), (value) => {
          obj.strokeWidth = value;
          renderCanvas();
        });
      }
      const row = document.createElement("div");
      row.className = "ip-row";
      row.appendChild(actionButton("前面へ", () => {
        state.objects = bringForward(state.objects, obj.id);
        pushHistory();
        renderLayers();
        renderCanvas();
      }));
      row.appendChild(actionButton("背面へ", () => {
        state.objects = sendBackward(state.objects, obj.id);
        pushHistory();
        renderLayers();
        renderCanvas();
      }));
      row.appendChild(actionButton("削除", () => removeSelected()));
      propsEl.appendChild(row);
    }
    function addField(label, kind, value, oninput) {
      const wrap = document.createElement("label");
      wrap.className = "ip-field";
      wrap.appendChild(document.createTextNode(label));
      const input = kind === "text" ? document.createElement("textarea") : document.createElement("input");
      if (kind === "text") input.rows = 2;
      else input.type = "text";
      input.value = value || "";
      input.oninput = () => oninput(input.value);
      input.addEventListener("focus", () => { input.dataset.dirty = ""; });
      input.addEventListener("blur", () => pushHistory());
      wrap.appendChild(input);
      propsEl.appendChild(wrap);
    }
    function addRange(label, min, max, value, oninput) {
      const wrap = document.createElement("label");
      wrap.className = "ip-field";
      const caption = document.createElement("span");
      caption.textContent = label + " " + value;
      wrap.appendChild(caption);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      input.oninput = () => {
        caption.textContent = label + " " + input.value;
        oninput(+input.value);
      };
      input.onchange = () => pushHistory();
      wrap.appendChild(input);
      propsEl.appendChild(wrap);
    }
    function addColor(label, value, oninput) {
      const wrap = document.createElement("label");
      wrap.className = "ip-field";
      wrap.appendChild(document.createTextNode(label));
      const input = document.createElement("input");
      input.type = "color";
      input.value = /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#111111";
      input.oninput = () => oninput(input.value);
      input.onchange = () => pushHistory();
      wrap.appendChild(input);
      propsEl.appendChild(wrap);
    }
    function actionButton(label, onclick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.onclick = onclick;
      return btn;
    }
    function renderLayers() {
      layersEl.innerHTML = "<h2>レイヤー</h2>";
      const ul = document.createElement("ul");
      state.objects.slice().reverse().forEach((obj) => {
        const li = document.createElement("li");
        if (obj.id === state.selected) li.className = "on";
        const name = document.createElement("button");
        name.type = "button";
        name.className = "name";
        name.textContent = layerName(obj);
        name.onclick = () => select(obj.id);
        const up = mini("上へ", () => {
          state.objects = bringForward(state.objects, obj.id);
          pushHistory();
          renderLayers();
          renderCanvas();
        });
        const down = mini("下へ", () => {
          state.objects = sendBackward(state.objects, obj.id);
          pushHistory();
          renderLayers();
          renderCanvas();
        });
        const idx = state.objects.findIndex((o) => o.id === obj.id);
        up.disabled = idx === state.objects.length - 1;
        down.disabled = idx === 0;
        li.appendChild(name);
        li.appendChild(up);
        li.appendChild(down);
        ul.appendChild(li);
      });
      const base = document.createElement("li");
      base.className = "ip-lock";
      base.textContent = "画像（固定）";
      ul.appendChild(base);
      layersEl.appendChild(ul);
    }
    function mini(label, onclick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini";
      btn.textContent = label;
      btn.onclick = onclick;
      return btn;
    }
    function select(id) {
      state.selected = id;
      renderProps();
      renderLayers();
      renderCanvas();
    }
    function removeSelected() {
      if (state.selected == null) return;
      state.objects = state.objects.filter((o) => o.id !== state.selected);
      state.selected = null;
      pushHistory();
      renderProps();
      renderLayers();
      renderCanvas();
    }
    function addText(p) {
      const fontSize = Math.max(28, Math.round(state.preset.h * 0.045));
      const obj = {
        id: state.nextId++,
        type: "text",
        x: p.x,
        y: p.y,
        text: "テキスト",
        fontSize: fontSize,
        color: isDark(state.bg) ? "#ffffff" : "#1a1a1a",
        bold: true,
        stroke: "#000000",
        strokeWidth: 0,
      };
      const box = measureTextBox(obj);
      obj.w = box.w;
      obj.h = box.h;
      const moved = moveObject(obj, 0, 0, state.preset.w, state.preset.h);
      obj.x = moved.x;
      obj.y = moved.y;
      state.objects.push(obj);
      state.selected = obj.id;
      setTool("select");
      pushHistory();
      renderProps();
      renderLayers();
      renderCanvas();
      if (window.innerWidth < 900) showTab("props", true);
    }
    function eventToCanvas(e) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      return {
        x: (sx - state.view.panX) / state.view.zoom,
        y: (sy - state.view.panY) / state.view.zoom,
        sx: sx,
        sy: sy,
      };
    }
    function hitRadius() {
      return (state.coarse ? 26 : 12) / state.view.zoom;
    }
    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const p = eventToCanvas(e);
      if (state.tool === "hand") {
        state.drag = { kind: "pan", sx: e.clientX, sy: e.clientY, panX: state.view.panX, panY: state.view.panY };
        return;
      }
      if (state.tool === "text") {
        addText(p);
        return;
      }
      if (state.tool === "rect" || state.tool === "ellipse") {
        state.drag = { kind: "create", type: state.tool, x: p.x, y: p.y };
        state.draft = null;
        return;
      }
      const hit = hitTest(state.objects, p.x, p.y, state.selected, hitRadius());
      if (hit && hit.handle) {
        const obj = state.objects.find((o) => o.id === hit.id);
        state.drag = { kind: "resize", id: hit.id, handle: hit.handle, origin: Object.assign({}, obj) };
        return;
      }
      if (hit) {
        const obj = state.objects.find((o) => o.id === hit.id);
        state.selected = hit.id;
        state.drag = { kind: "move", id: hit.id, x: p.x, y: p.y, origin: { x: obj.x, y: obj.y } };
        renderProps();
        renderLayers();
        renderCanvas();
        return;
      }
      state.selected = null;
      renderProps();
      renderLayers();
      renderCanvas();
    }
    function onPointerMove(e) {
      if (!state.drag) return;
      const p = eventToCanvas(e);
      if (state.drag.kind === "pan") {
        state.view.panX = state.drag.panX + (e.clientX - state.drag.sx);
        state.view.panY = state.drag.panY + (e.clientY - state.drag.sy);
        state.userView = true;
        renderCanvas();
        return;
      }
      if (state.drag.kind === "create") {
        const x = Math.min(state.drag.x, p.x);
        const y = Math.min(state.drag.y, p.y);
        const w = Math.abs(p.x - state.drag.x);
        const h = Math.abs(p.y - state.drag.y);
        state.draft = {
          type: state.drag.type,
          x: x, y: y, w: w, h: h,
          fill: "#ff5a5a",
          stroke: "#111111",
          strokeWidth: 0,
        };
        renderCanvas();
        return;
      }
      const obj = state.objects.find((o) => o.id === state.drag.id);
      if (!obj) return;
      if (state.drag.kind === "move") {
        const moved = moveObject(
          { x: state.drag.origin.x, y: state.drag.origin.y, w: obj.w, h: obj.h },
          p.x - state.drag.x,
          p.y - state.drag.y,
          state.preset.w,
          state.preset.h
        );
        obj.x = moved.x;
        obj.y = moved.y;
        renderCanvas();
        return;
      }
      const next = obj.type === "text"
        ? resizeUniform(state.drag.origin, state.drag.handle, p.x, p.y)
        : resizeFree(state.drag.origin, state.drag.handle, p.x, p.y);
      obj.x = next.x;
      obj.y = next.y;
      obj.w = next.w;
      obj.h = next.h;
      if (obj.type === "text") obj.fontSize = Math.max(8, state.drag.origin.fontSize * next.scale);
      renderCanvas();
    }
    function onPointerUp() {
      if (!state.drag) return;
      if (state.drag.kind === "create" && state.draft) {
        const clipped = {
          x: Math.max(0, state.draft.x),
          y: Math.max(0, state.draft.y),
          w: Math.min(state.preset.w, state.draft.x + state.draft.w) - Math.max(0, state.draft.x),
          h: Math.min(state.preset.h, state.draft.y + state.draft.h) - Math.max(0, state.draft.y),
        };
        if (clipped.w >= 8 && clipped.h >= 8) {
          const obj = Object.assign({ id: state.nextId++ }, state.draft, clipped);
          state.objects.push(obj);
          state.selected = obj.id;
          setTool("select");
          if (window.innerWidth < 900) showTab("props", true);
        }
      }
      state.draft = null;
      state.drag = null;
      pushHistory();
      renderProps();
      renderLayers();
      renderCanvas();
    }
    function setPreset(id) {
      const next = presetById(id);
      if (next.id === state.preset.id && next.w === state.preset.w) return;
      state.objects = scaleObjects(state.objects, state.preset.w, state.preset.h, next.w, next.h);
      state.preset = next;
      state.userView = false;
      fit();
      pushHistory();
      syncPresetButtons();
      renderProps();
      renderCanvas();
    }
    function setBg(color) {
      state.bg = color;
      bgInput.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : bgInput.value;
      pushHistory();
      renderCanvas();
    }
    function showTab(tab, force) {
      const current = rootEl.classList.contains("show-" + tab);
      rootEl.classList.remove("show-tools", "show-props", "show-layers");
      const next = !tab ? "" : (force || !current ? tab : "");
      if (next) rootEl.classList.add("show-" + next);
      rootEl.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.tab === next ? "true" : "false");
      });
    }
    async function savePng() {
      const blob = await canvasBlob("image/png");
      if (!blob) { toast("PNGを作れませんでした"); return null; }
      download(state.filename, blob);
      toast("PNGを保存しました");
      return blob;
    }
    async function savePdf() {
      const blob = await canvasBlob("image/jpeg", 0.92);
      if (!blob) { toast("PDFを作れませんでした"); return; }
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      const pdf = buildPdf(jpeg, state.preset.w, state.preset.h);
      download(pdfFilename(state.filename), new Blob([pdf], { type: "application/pdf" }));
      toast("PDFを保存しました");
    }
    async function copyImage() {
      const blob = await canvasBlob("image/png");
      if (!blob) { toast("画像を作れませんでした"); return; }
      try {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error("no clipboard");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast("画像をコピーしました");
      } catch (e) {
        toast("コピーできませんでした。PNGで保存してください");
      }
    }
    async function shareImage() {
      const blob = await canvasBlob("image/png");
      if (!blob) { toast("画像を作れませんでした"); return; }
      const file = new File([blob], state.filename, { type: "image/png" });
      try {
        if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
          toast("この端末では共有シートを開けません。PNGで保存してください");
          return;
        }
        await navigator.share({ files: [file], title: state.title });
      } catch (e) {
        if (e && e.name === "AbortError") return;
        toast("共有できませんでした。PNGで保存してください");
      }
    }
    function onKey(e) {
      const typing = e.target && (e.target.closest && e.target.closest("input, textarea"));
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") close();
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
    }
    function onResize() {
      if (!state.userView) fit();
      renderCanvas();
    }
    function close() {
      if (state.index > 0 && !confirm("プレビューを閉じますか？加えた文字や図形は残しません。")) return;
      destroy(true);
    }
    function destroy(silent) {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (observer) observer.disconnect();
      rootEl.remove();
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (shell && shell.root === rootEl) shell = null;
      if (bitmap.close) {
        try { bitmap.close(); } catch (e) { /* 既に閉じている */ }
      }
      void silent;
    }
    const observer = new ResizeObserver(onResize);
    observer.observe(stage);
    rootEl.addEventListener("click", (e) => {
      const presetBtn = e.target.closest("[data-preset]");
      if (presetBtn) { setPreset(presetBtn.dataset.preset); return; }
      const bgBtn = e.target.closest("[data-bg]");
      if (bgBtn) { setBg(bgBtn.dataset.bg); return; }
      const toolBtn = e.target.closest("[data-tool]");
      if (toolBtn) { setTool(toolBtn.dataset.tool); return; }
      const tab = e.target.closest("[data-tab]");
      if (tab) { showTab(tab.dataset.tab); return; }
      const act = e.target.closest("[data-act]");
      if (!act) return;
      const name = act.dataset.act;
      if (name === "close") close();
      else if (name === "zoomout") setZoom(state.view.zoom / 1.2, stage.clientWidth / 2, stage.clientHeight / 2);
      else if (name === "zoomin") setZoom(state.view.zoom * 1.2, stage.clientWidth / 2, stage.clientHeight / 2);
      else if (name === "fit") { state.userView = false; fit(); renderCanvas(); }
      else if (name === "undo") undo();
      else if (name === "redo") redo();
      else if (name === "png") savePng();
      else if (name === "pdf") savePdf();
      else if (name === "copy") copyImage();
      else if (name === "share") shareImage();
    });
    bgInput.addEventListener("input", () => {
      state.bg = bgInput.value;
      renderCanvas();
    });
    bgInput.addEventListener("change", () => pushHistory());
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom(state.view.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);

    shell = { root: rootEl, toast: rootEl.querySelector(".ip-toast"), destroy: destroy };
    pushHistory();
    syncPresetButtons();
    syncToolButtons();
    syncHistoryButtons();
    renderProps();
    renderLayers();
    fit();
    renderCanvas();
    rootEl.querySelector('[data-act="close"]').focus();
  }

  api.open = open;
  root.ImagePreview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
