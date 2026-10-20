/* 大会リザルト。入力は順位表、出力はリザルト画像と Top8 画像。キャラ名は出さない。 */
(function () {
  "use strict";
  const R = window.ResultBoard;
  const T = window.TierList;
  const N = window.Names;
  const roster = window.__ROSTER__ || [];
  const LIB = "punish.resultLibrary";
  const CUR = "punish.result";
  const TIER_KEY = "punish.tier";
  const TOP8_TEMPLATES = [
    { id: "slash", label: "斜め" },
    { id: "minimal", label: "ミニマル" },
    { id: "neon", label: "ネオン" },
    { id: "wa", label: "和" },
  ];
  const TOP8_COLOR = "#e23b4a";
  const LOOK_KEY = "punish.top8look";
  const FACE = "\"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
  let top8Look = { template: "slash", color: TOP8_COLOR };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let current = R.defaultEvent();
  let library = [];
  let sortKey = "count";
  let sortDir = "desc";
  let pickerRow = -1;
  let pickerSlot = -1;
  let toastTimer = 0;
  let hashTimer = 0;

  function toast(msg) {
    const el = $("toast");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }
  function iconSrc(index, color) {
    const c = color >= 1 && color <= 8 ? color : 1;
    return "fighters/" + index + "/" + c + ".webp";
  }
  function loadIcon(index, color) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = iconSrc(index, color);
    });
  }
  function blankRow(place) {
    return { place: place, player: "", nation: "", sponsor: "", chars: [] };
  }
  function readHash() {
    return new URLSearchParams(location.hash.replace(/^#/, "")).get("r");
  }
  function loadLibrary() {
    try {
      const raw = localStorage.getItem(LIB);
      if (!raw) return [];
      return R.parseBundle(raw, roster.length) || [];
    } catch (e) { return []; }
  }
  function saveLibrary() {
    try { localStorage.setItem(LIB, JSON.stringify(R.exportBundle(library))); } catch (e) {}
  }
  function loadCurrent() {
    const fromUrl = readHash();
    if (fromUrl) {
      const ev = R.decode(fromUrl, roster.length);
      if (ev) return ev;
      toast("共有リンクを読めなかったので、保存済みの結果を開きました");
    }
    try {
      const raw = localStorage.getItem(CUR);
      if (raw) {
        const ev = R.decode(raw, roster.length);
        if (ev) return ev;
      }
    } catch (e) {}
    return R.defaultEvent();
  }
  function persist() {
    const enc = R.encode(current);
    try { localStorage.setItem(CUR, enc); } catch (e) {}
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const next = "#r=" + enc;
      if (location.hash !== next) history.replaceState(null, "", next);
    }, 180);
  }
  function fillMeta() {
    $("evName").value = current.event.name;
    $("evDate").value = current.event.date;
    $("evCity").value = current.event.city || "";
    $("evCountry").value = current.event.country || "";
    $("evEntrants").value = current.event.entrants == null ? "" : String(current.event.entrants);
    $("showN").value = String(current.rows.length || 8);
  }
  function tagLine(row) {
    const name = row.player || "";
    if (row.sponsor && name) return row.sponsor + " | " + name;
    return row.sponsor || name;
  }
  function slotHtml(slotIndex, slot) {
    const label = roster[slot.id] ? roster[slot.id].name : "";
    const colors = [1, 2, 3, 4, 5, 6, 7, 8].map((c) =>
      `<button type="button" class="swatch${c === slot.color ? " on" : ""}" data-act="color" data-c="${c}" aria-label="色${c}"><img src="${iconSrc(slot.id, c)}" alt="" width="36" height="36" loading="lazy" decoding="async"></button>`
    ).join("");
    return `<div class="slot" data-s="${slotIndex}">` +
      `<button type="button" class="portrait-btn" data-act="replace" aria-label="${esc(label)}を別のキャラに差し替える"><img class="portrait" src="${iconSrc(slot.id, slot.color)}" alt="" width="72" height="72" decoding="async"></button>` +
      `<div class="swatches">${colors}</div>` +
      `<button type="button" data-act="rmchar">外す</button></div>`;
  }
  function renderRows() {
    $("rows").innerHTML = current.rows.map((row, i) => {
      const slots = row.chars.map((slot, s) => slotHtml(s, slot)).join("");
      return `<article class="place" data-i="${i}"><div class="fields">` +
        `<label class="place-lab">順位<input class="place-in" inputmode="numeric" value="${row.place}" aria-label="順位"></label>` +
        `<label class="nation-lab">国<input class="nation-in" maxlength="12" value="${esc(row.nation || "")}" aria-label="選手の国" autocomplete="off" placeholder="jp"></label>` +
        `<label class="grow">スポンサー<input class="sponsor-in" maxlength="32" value="${esc(row.sponsor || "")}" aria-label="スポンサー" autocomplete="off"></label>` +
        `<label class="grow">選手<input class="player-in" maxlength="40" value="${esc(row.player)}" aria-label="選手名" autocomplete="off"></label>` +
        `<button type="button" data-act="rmrow">この順位を削除</button>` +
        `</div><div class="slots">${slots}</div>` +
        `<button type="button" class="addchar" data-act="addchar">キャラを追加</button></article>`;
    }).join("") || `<p class="hint">順位がありません。「枠を作る」で入れてください。</p>`;
    $("showN").value = String(Math.max(1, current.rows.length));
  }
  function renderLibrary() {
    $("libList").innerHTML = library.length
      ? library.map((ev, i) => {
        const label = ev.event.name || "（無題）";
        const date = ev.event.date || "日付なし";
        const n = ev.event.entrants == null ? "" : " · " + ev.event.entrants + "人";
        return `<li><span>${esc(label)} <small>${esc(date)} · ${ev.rows.length}位${esc(n)}</small></span><button type="button" data-lib="${i}">外す</button></li>`;
      }).join("")
      : `<li class="empty">保存された大会はありません。</li>`;
  }
  function renderRank() {
    const usage = R.countUsage(library);
    const nameOf = (id) => (roster[id] ? roster[id].name : "");
    const rows = R.sortUsage(usage.rows, sortKey, sortDir, nameOf);
    $("playerCount").textContent = "選手 " + usage.players + "人";
    $("sortCount").setAttribute("aria-pressed", sortKey === "count" ? "true" : "false");
    $("sortName").setAttribute("aria-pressed", sortKey === "name" ? "true" : "false");
    $("rankList").innerHTML = rows.length
      ? rows.map((r) => `<li><img src="${iconSrc(r.id, 1)}" alt="" width="48" height="48" loading="lazy" decoding="async"><span>${r.count}人</span><span>${esc(R.formatPercent(r.ratio))}</span></li>`).join("")
      : `<li class="empty">まだ集計がありません。</li>`;
  }
  function renderPicker() {
    const q = $("pq").value;
    const all = roster.map((_, i) => i);
    const shown = T.filterPool(all, roster, q, N.haystack, N.norm, N.charNo);
    $("pickerGrid").innerHTML = shown.length
      ? shown.map((i) => `<button type="button" class="pick" data-id="${i}" aria-label="${esc(roster[i].name)}"><img src="${iconSrc(i, 1)}" alt="" width="64" height="64" loading="lazy" decoding="async"></button>`).join("")
      : `<p class="empty">該当するファイターはいません。</p>`;
  }
  function openPicker(rowIndex, slotIndex) {
    pickerRow = rowIndex;
    pickerSlot = slotIndex;
    $("pq").value = "";
    $("pickerHint").textContent = slotIndex >= 0 ? "別のアイコンを選ぶと、この枠のキャラが入れ替わります。" : "アイコンを選んでください。選んだあとに色を変えられます。";
    renderPicker();
    $("picker").showModal();
    $("pq").focus();
  }
  function chooseChar(id) {
    const row = current.rows[pickerRow];
    if (!row || !roster[id]) return;
    const replacing = pickerSlot >= 0 ? row.chars[pickerSlot] : null;
    if (row.chars.some((c, i) => c.id === id && i !== pickerSlot)) {
      toast("同じキャラは1人につき1回です");
      return;
    }
    if (replacing) {
      if (replacing.id !== id) {
        replacing.id = id;
        replacing.color = 1;
      }
    } else {
      if (row.chars.length >= R.MAX_CHARS) { toast("キャラは" + R.MAX_CHARS + "人までです"); return; }
      row.chars.push({ id: id, color: 1 });
    }
    $("picker").close();
    renderRows();
    persist();
  }
  function resizeRows(n) {
    n = Math.max(1, Math.min(32, n));
    while (current.rows.length < n) {
      const next = current.rows.reduce((m, r) => Math.max(m, r.place), 0) + 1;
      current.rows.push(blankRow(Math.min(9999, next)));
    }
    if (current.rows.length > n) current.rows.length = n;
    renderRows();
    persist();
  }
  function download(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function roundRect(g, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }
  function drawIcon(g, img, x, y, size) {
    if (!img || !size) return;
    const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    g.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  }
  function metaLine(ev) {
    const bits = [];
    if (ev.entrants) bits.push(ev.entrants + " entrants");
    let loc = "";
    if (ev.city && ev.country) loc = ev.city + "(" + ev.country + ")";
    else loc = ev.city || ev.country || "";
    if (ev.date) loc = loc ? loc + "[" + ev.date + "]" : ev.date;
    if (bits.length && loc) return bits[0] + " - " + loc;
    return bits[0] || loc || "";
  }
  function ordinal(n) {
    const v = n % 100;
    const suf = (v >= 11 && v <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
    return n + suf;
  }
  async function preload(pairs) {
    const icons = {};
    await Promise.all(pairs.map(async (pair) => {
      const key = pair.id + ":" + pair.color;
      if (icons[key] !== undefined) return;
      icons[key] = null;
      icons[key] = await loadIcon(pair.id, pair.color);
    }));
    return icons;
  }
  async function drawResult() {
    const ev = R.normalizeEvent(current, roster.length) || current;
    const icons = await preload(ev.rows.flatMap((row) => row.chars));
    const width = 760;
    const icon = 64;
    const gap = 8;
    const left = 24;
    const placeW = 56;
    const nameFont = "650 26px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const small = "650 18px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = nameFont;
    const layouts = ev.rows.map((row) => {
      const nation = row.nation || "";
      const nationW = nation ? 58 : 0;
      const name = tagLine(row);
      const nameX = left + placeW + 8 + nationW;
      const nameW = measure.measureText(name).width;
      const lines = [[]];
      let x = nameX + nameW + 12;
      row.chars.forEach((ch) => {
        if (x + icon > width - 20) {
          lines.push([]);
          x = left + placeW + 8;
        }
        lines[lines.length - 1].push({ ch: ch, x: x });
        x += icon + gap;
      });
      const h = Math.max(78, 16 + lines.length * (icon + 8));
      return { row: row, name: name, nation: nation, nationW: nationW, nameX: nameX, lines: lines, h: h };
    });
    const height = 150 + layouts.reduce((s, b) => s + b.h, 0) + 36;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, width, height);
    g.fillStyle = "#2c2c2c";
    g.textAlign = "center";
    g.font = "750 28px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.fillText(ev.event.name || "Result", width / 2, 58);
    g.font = "italic 22px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.fillText(metaLine(ev.event), width / 2, 96);
    g.textAlign = "left";
    let y = 128;
    layouts.forEach((block) => {
      const base = y + 50;
      g.fillStyle = "#2c2c2c";
      g.font = nameFont;
      g.textAlign = "right";
      g.fillText(block.row.place + ".", left + placeW, base);
      g.textAlign = "left";
      if (block.nation) {
        g.fillStyle = "#f4f4f4";
        roundRect(g, left + placeW + 8, base - 24, 50, 30, 6);
        g.fill();
        g.strokeStyle = "#d2d2d2";
        g.stroke();
        g.fillStyle = "#2c2c2c";
        g.font = "700 16px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
        g.textAlign = "center";
        g.fillText(block.nation, left + placeW + 33, base - 4);
        g.textAlign = "left";
        g.font = nameFont;
      }
      g.fillStyle = "#2c2c2c";
      g.fillText(block.name, block.nameX, base);
      block.lines.forEach((line, li) => {
        line.forEach((item) => {
          const iy = y + 8 + li * (icon + 8);
          const ix = item.x;
          g.fillStyle = "#f7f7f7";
          roundRect(g, ix, iy, icon, icon, 8);
          g.fill();
          g.strokeStyle = "#d2d2d2";
          g.stroke();
          drawIcon(g, icons[item.ch.id + ":" + item.ch.color], ix + 4, iy + 4, icon - 8);
        });
      });
      y += block.h;
    });
    g.fillStyle = "#8a8a8a";
    g.font = small;
    g.textAlign = "center";
    g.fillText("非公式  © Nintendo / HAL Laboratory, Inc.", width / 2, height - 16);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }
  function hexOk(c) {
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : TOP8_COLOR;
  }
  function hexRgb(hex) {
    const h = hexOk(hex).slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbaOf(hex, a) {
    const p = hexRgb(hex);
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }
  function luma(hex) {
    const p = hexRgb(hex);
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  }
  function knownTemplate(id) {
    return TOP8_TEMPLATES.some((t) => t.id === id) ? id : "slash";
  }
  function readLook() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOOK_KEY) || "");
      return { template: knownTemplate(raw && raw.template), color: hexOk(raw && raw.color) };
    } catch (e) {
      return { template: "slash", color: TOP8_COLOR };
    }
  }
  function writeLook() {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(top8Look)); } catch (e) {}
  }
  function syncLook() {
    const box = $("top8templates");
    if (box) {
      box.querySelectorAll("[data-tpl]").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.tpl === top8Look.template ? "true" : "false");
      });
    }
    const color = $("top8color");
    if (color && color.value !== top8Look.color) color.value = top8Look.color;
  }
  function renderLook() {
    const box = $("top8templates");
    if (!box) return;
    box.innerHTML = TOP8_TEMPLATES.map((t) =>
      `<button type="button" data-tpl="${t.id}" aria-pressed="false">${t.label}</button>`
    ).join("");
    syncLook();
  }
  function top8Slots(ev) {
    const filled = ev.rows.slice().sort((a, b) => a.place - b.place).slice(0, 8);
    const used = {};
    filled.forEach((row) => { used[row.place] = true; });
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const row = filled[i] || null;
      let place = null;
      if (row) place = row.place;
      else if (!used[i + 1]) place = i + 1;
      slots.push({ row: row, place: place });
    }
    return slots;
  }
  function jaPlace(n) {
    if (n === 1) return "優勝";
    if (n === 2) return "準優勝";
    return n + "位";
  }
  const WA_NUM = { 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九" };
  function waPlace(n) {
    if (n === 1) return "優勝";
    if (n === 2) return "準優勝";
    if (WA_NUM[n]) return WA_NUM[n] + "位";
    return n + "位";
  }
  function captionOf(ev, arrow) {
    const bits = [];
    const meta = metaLine(ev);
    if (meta) bits.push(meta);
    if (ev.entrants) bits.push(arrow ? ev.entrants + " → 1" : ev.entrants + "人");
    return bits.join("   ");
  }
  function face(weight, size) {
    return weight + " " + size + "px " + FACE;
  }
  function paintCredit(g, x, y, color) {
    g.fillStyle = color;
    g.font = face(650, 13);
    g.textAlign = "right";
    g.textBaseline = "alphabetic";
    g.fillText("非公式  © Nintendo / HAL Laboratory, Inc.", x, y);
  }
  function ticks(g, x, y, w, len, color) {
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.lineCap = "square";
    g.beginPath();
    g.moveTo(x, y + len);
    g.lineTo(x, y);
    g.lineTo(x + len, y);
    g.moveTo(x + w, y + len);
    g.lineTo(x + w, y);
    g.lineTo(x + w - len, y);
    g.stroke();
  }
  function fitFont(g, text, weight, size, min, width) {
    let s = size;
    const floor = Math.max(12, min);
    g.font = face(weight, s);
    while (s > floor && g.measureText(text).width > width) {
      s -= 1;
      g.font = face(weight, s);
    }
    return s;
  }
  function inkText(g, text, x, y, color, stroke) {
    if (stroke) {
      g.lineJoin = "round";
      g.miterLimit = 2;
      g.lineWidth = stroke;
      g.strokeStyle = color === "#1c1c1c" ? "rgba(246,243,236,.92)" : "rgba(5,6,12,.78)";
      g.strokeText(text, x, y);
    }
    g.fillStyle = color;
    g.fillText(text, x, y);
  }
  function drawCover(g, img, x, y, w, h, ax, ay, zoom) {
    if (!img || w < 4 || h < 4) return;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (zoom || 1);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    g.drawImage(img, x + (w - dw) * ax, y + (h - dh) * ay, dw, dh);
  }
  function paintHero(g, box, slot, icons, cover) {
    const main = slot.row && slot.row.chars[0];
    if (!main) return;
    const img = icons[main.id + ":" + main.color];
    const c = cover || { ax: 0.5, ay: 0.2, zoom: 1.12 };
    drawCover(g, img, box.x, box.y, box.w, box.h, c.ax, c.ay, c.zoom);
  }
  function paintGhost(g, text, box, o) {
    g.save();
    g.globalAlpha = o.ghostAlpha == null ? 0.2 : o.ghostAlpha;
    g.fillStyle = o.ghostColor || o.placeColor;
    g.textAlign = "left";
    g.textBaseline = "middle";
    fitFont(g, text, 800, o.ghostSize || Math.round(box.h * 0.5), 42, box.w * 0.96);
    g.fillText(text, box.x + 4, box.y + box.h * (o.ghostY || 0.46));
    g.restore();
  }
  function scrimBottom(g, box, mode) {
    const grd = g.createLinearGradient(0, box.y + box.h * 0.42, 0, box.y + box.h);
    if (mode === "light") {
      grd.addColorStop(0, "rgba(246,243,236,0)");
      grd.addColorStop(1, "rgba(246,243,236,.9)");
    } else {
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(0,0,0,.72)");
    }
    g.fillStyle = grd;
    g.fillRect(box.x, box.y, box.w, box.h);
  }
  function scrimLeft(g, box, mode) {
    const grd = g.createLinearGradient(box.x, 0, box.x + box.w * 0.62, 0);
    if (mode === "light") {
      grd.addColorStop(0, "rgba(246,243,236,.92)");
      grd.addColorStop(1, "rgba(246,243,236,0)");
    } else {
      grd.addColorStop(0, "rgba(5,6,12,.78)");
      grd.addColorStop(1, "rgba(5,6,12,0)");
    }
    g.fillStyle = grd;
    g.fillRect(box.x, box.y, box.w, box.h);
  }
  function paintStacked(g, box, slot, icons, o) {
    const row = slot.row;
    const hasMain = !!(row && row.chars[0]);
    if (o.hero !== false) {
      if (o.ghost) paintGhost(g, o.ghost, box, o);
      if (hasMain) {
        paintHero(g, box, slot, icons, {
          ax: o.ghost ? 0.82 : 0.5,
          ay: 0.2,
          zoom: o.zoom || 1.14,
        });
      }
      if (o.scrim) scrimBottom(g, box, o.scrim);
    }
    const label = o.hidePlace || slot.place == null ? "" : o.placeText(slot.place);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    let placeUsed = 0;
    if (label) {
      placeUsed = fitFont(g, label, 800, o.placeSize, Math.max(16, Math.round(o.placeSize * 0.55)), Math.max(8, box.w));
      g.textBaseline = "alphabetic";
      inkText(g, label, box.x, box.y + placeUsed, o.placeColor, Math.max(3, Math.round(placeUsed * 0.08)));
    }
    const name = row ? (tagLine(row) || "—") : "";
    const nation = row && row.nation ? row.nation : "";
    const nationCol = nation ? Math.min(110, box.w * 0.3) : 0;
    const nameLimit = Math.max(24, box.w - (nationCol ? nationCol + 12 : 0));
    let nameUsed = o.nameSize;
    const nameY = box.y + box.h - 4;
    if (name) {
      nameUsed = fitFont(g, name, 750, o.nameSize, o.nameMin || 14, nameLimit);
      g.textAlign = "left";
      inkText(g, name, box.x, nameY, o.nameColor, Math.max(3, Math.round(nameUsed * 0.1)));
    }
    if (nation) {
      g.textAlign = "right";
      const nSize = fitFont(g, nation, 700, Math.max(14, Math.round(nameUsed * 0.48)), 12, nationCol);
      g.fillStyle = o.mute;
      g.fillText(nation, box.x + box.w, nameY - Math.max(0, (nameUsed - nSize) * 0.15));
      g.textAlign = "left";
    }
    const subs = row ? row.chars.slice(1, 5) : [];
    if (!subs.length) return;
    const gap = 6;
    let sub = o.sub;
    const maxByWidth = Math.floor((box.w - gap * (subs.length - 1)) / subs.length);
    sub = Math.max(28, Math.min(sub, maxByWidth));
    const room = box.h - placeUsed - nameUsed - 18;
    if (sub > room) sub = Math.max(28, Math.floor(room));
    const subY = nameY - nameUsed - sub - 8;
    subs.forEach((ch, k) => {
      const sx = box.x + k * (sub + gap);
      if (o.subPlate) {
        g.fillStyle = o.subPlate;
        roundRect(g, sx - 2, subY - 2, sub + 4, sub + 4, 8);
        g.fill();
      }
      drawIcon(g, icons[ch.id + ":" + ch.color], sx, subY, sub);
    });
  }
  function paintSplit(g, box, slot, icons, o) {
    if (o.ghost) paintGhost(g, o.ghost, box, o);
    const start = o.heroStart == null ? 0.2 : o.heroStart;
    const hero = { x: box.x + box.w * start, y: box.y - 8, w: box.w * (1 - start) + 12, h: box.h + 16 };
    if (o.glow) paintGlow(g, hero, o.glow);
    paintHero(g, hero, slot, icons, { ax: 0.02, ay: 0.16, zoom: o.zoom || 1.2 });
    if (o.scrim) scrimLeft(g, box, o.scrim);
    const textW = Math.max(120, Math.round(box.w * (o.textRatio || 0.6)));
    paintStacked(g, { x: box.x, y: box.y, w: textW, h: box.h }, slot, icons, Object.assign({}, o, { hero: false, ghost: "" }));
  }
  function skewPath(g, x, y, w, h, lean) {
    g.beginPath();
    g.moveTo(x + lean, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w - lean, y + h);
    g.lineTo(x, y + h);
    g.closePath();
  }
  function paintSlash(g, ev, slots, icons, theme) {
    const W = 1600;
    const H = 900;
    g.fillStyle = "#090b10";
    g.fillRect(0, 0, W, H);
    g.fillStyle = theme;
    g.fillRect(0, 0, W, 5);
    const title = ev.event.name || "Top 8";
    g.font = face(800, 34);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const tw = Math.min(g.measureText(title).width, 860);
    ticks(g, 28, 22, tw + 20, 12, theme);
    g.fillStyle = "#f4f7fb";
    g.fillText(title, 44, 50, 900);
    g.fillStyle = "#9aa6b5";
    g.font = face(650, 16);
    g.fillText(captionOf(ev.event, true), 44, 76, 1100);
    const cards = [
      { x: 20, y: 96, w: 800, h: 512, lean: 44, split: true },
      { x: 844, y: 96, w: 736, h: 244, lean: 26, split: true },
      { x: 844, y: 352, w: 360, h: 256, lean: 18, split: false },
      { x: 1216, y: 352, w: 364, h: 256, lean: 18, split: false },
      { x: 20, y: 624, w: 381, h: 244, lean: 16, split: false },
      { x: 413, y: 624, w: 381, h: 244, lean: 16, split: false },
      { x: 806, y: 624, w: 381, h: 244, lean: 16, split: false },
      { x: 1199, y: 624, w: 381, h: 244, lean: 16, split: false },
    ];
    cards.forEach((card, i) => {
      const slot = slots[i];
      g.save();
      skewPath(g, card.x, card.y, card.w, card.h, card.lean);
      g.fillStyle = i === 0 ? "#171d2a" : "#121722";
      g.fill();
      g.lineWidth = i === 0 ? 2.5 : 1.25;
      g.strokeStyle = i === 0 ? theme : "rgba(255,255,255,.14)";
      g.stroke();
      g.clip();
      const inner = {
        x: card.x + Math.round(card.lean * 0.55) + 14,
        y: card.y + 14,
        w: card.w - Math.round(card.lean * 0.95) - 24,
        h: card.h - 28,
      };
      const opt = {
        placeText: ordinal,
        placeColor: theme,
        placeSize: i === 0 ? 84 : (i === 1 ? 48 : 36),
        nameColor: "#f5f7fb",
        nameSize: i === 0 ? 64 : (i === 1 ? 40 : 30),
        nameMin: i === 0 ? 26 : 16,
        mute: "#d5dde6",
        sub: i === 0 ? 78 : (i === 1 ? 56 : 48),
        subPlate: "rgba(8,10,16,.82)",
        ghost: i === 0 ? "WINNER" : "",
        ghostSize: i === 0 ? 168 : 0,
        ghostAlpha: 0.22,
        ghostColor: theme,
        scrim: "dark",
        textRatio: i === 0 ? 0.62 : 0.58,
        heroStart: 0.18,
        zoom: i === 0 ? 1.22 : 1.16,
      };
      if (card.split) paintSplit(g, inner, slot, icons, opt);
      else paintStacked(g, inner, slot, icons, opt);
      g.restore();
    });
    paintCredit(g, W - 24, H - 14, "#8b97a6");
  }
  function paintMinimal(g, ev, slots, icons, theme) {
    const W = 1600;
    const H = 900;
    g.fillStyle = "#f6f3ec";
    g.fillRect(0, 0, W, H);
    const title = ev.event.name || "Top 8";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = "#1c1c1c";
    g.font = face(750, 40);
    g.fillText(title, 40, 62, 980);
    g.strokeStyle = theme;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(40, 78);
    g.lineTo(168, 78);
    g.stroke();
    g.fillStyle = "#6e675f";
    g.font = face(650, 16);
    g.fillText(captionOf(ev.event, false), 40, 106, 1100);
    g.strokeStyle = "#d9d2c6";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(760, 124);
    g.lineTo(760, 640);
    g.moveTo(40, 640);
    g.lineTo(1560, 640);
    g.moveTo(760, 370);
    g.lineTo(1560, 370);
    g.moveTo(1160, 370);
    g.lineTo(1160, 640);
    g.moveTo(423, 656);
    g.lineTo(423, 868);
    g.moveTo(806, 656);
    g.lineTo(806, 868);
    g.moveTo(1189, 656);
    g.lineTo(1189, 868);
    g.stroke();
    const cards = [
      { x: 40, y: 124, w: 700, h: 500, place: 78, name: 58, sub: 72 },
      { x: 784, y: 124, w: 752, h: 230, place: 46, name: 38, sub: 52 },
      { x: 784, y: 386, w: 360, h: 238, place: 40, name: 32, sub: 48 },
      { x: 1184, y: 386, w: 360, h: 238, place: 40, name: 32, sub: 48 },
      { x: 40, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
      { x: 423, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
      { x: 806, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
      { x: 1189, y: 656, w: 371, h: 200, place: 34, name: 28, sub: 44 },
    ];
    cards.forEach((card, i) => {
      const box = { x: card.x + 12, y: card.y + 8, w: card.w - 24, h: card.h - 16 };
      g.save();
      g.beginPath();
      g.rect(card.x, card.y, card.w, card.h);
      g.clip();
      paintStacked(g, box, slots[i], icons, {
        placeText: jaPlace,
        placeColor: theme,
        placeSize: card.place,
        nameColor: "#1c1c1c",
        nameSize: card.name,
        nameMin: i === 0 ? 24 : 15,
        mute: "#5c564e",
        sub: card.sub,
        subPlate: "rgba(246,243,236,.88)",
        ghost: i === 0 ? "優勝" : "",
        ghostSize: 200,
        ghostAlpha: 0.16,
        ghostColor: theme,
        scrim: "light",
        zoom: i === 0 ? 1.2 : 1.12,
      });
      g.restore();
    });
    paintCredit(g, W - 40, H - 16, "#8a8478");
  }
  function paintGlow(g, box, color) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h * 0.42;
    const rad = Math.max(box.w, box.h) * 0.62;
    const grd = g.createRadialGradient(cx, cy, 8, cx, cy, rad);
    grd.addColorStop(0, rgbaOf(color, 0.7));
    grd.addColorStop(0.42, rgbaOf(color, 0.2));
    grd.addColorStop(1, rgbaOf(color, 0));
    g.fillStyle = grd;
    g.fillRect(box.x, box.y, box.w, box.h);
  }
  function paintNeon(g, ev, slots, icons, theme) {
    const W = 1600;
    const H = 900;
    g.fillStyle = "#05060c";
    g.fillRect(0, 0, W, H);
    const title = ev.event.name || "Top 8";
    g.font = face(800, 34);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const tw = Math.min(g.measureText(title).width, 860);
    ticks(g, 28, 22, tw + 20, 12, theme);
    g.fillStyle = "#f7f8ff";
    g.fillText(title, 44, 50, 900);
    g.fillStyle = "#9aa3b8";
    g.font = face(650, 16);
    g.fillText(captionOf(ev.event, true), 44, 76, 1100);
    const cards = [
      { x: 24, y: 100, w: 940, h: 508, r: 18, split: true },
      { x: 980, y: 100, w: 596, h: 240, r: 16, split: true },
      { x: 980, y: 356, w: 290, h: 252, r: 14, split: false },
      { x: 1286, y: 356, w: 290, h: 252, r: 14, split: false },
      { x: 24, y: 624, w: 379, h: 244, r: 14, split: false },
      { x: 415, y: 624, w: 379, h: 244, r: 14, split: false },
      { x: 806, y: 624, w: 379, h: 244, r: 14, split: false },
      { x: 1197, y: 624, w: 379, h: 244, r: 14, split: false },
    ];
    cards.forEach((card, i) => {
      const slot = slots[i];
      g.save();
      roundRect(g, card.x, card.y, card.w, card.h, card.r);
      g.fillStyle = "#0c1018";
      g.fill();
      g.lineWidth = i === 0 ? 3 : 1.5;
      g.strokeStyle = i === 0 ? theme : rgbaOf(theme, 0.72);
      g.stroke();
      g.clip();
      const opt = {
        placeText: ordinal,
        placeColor: theme,
        placeSize: i === 0 ? 86 : (i === 1 ? 48 : 36),
        nameColor: "#f7f8ff",
        nameSize: i === 0 ? 66 : (i === 1 ? 40 : 30),
        nameMin: i === 0 ? 26 : 16,
        mute: "#d5deee",
        sub: i === 0 ? 80 : (i === 1 ? 56 : 48),
        subPlate: "rgba(5,6,12,.84)",
        ghost: i === 0 ? "WINNER" : "",
        ghostSize: 188,
        ghostAlpha: 0.28,
        ghostColor: theme,
        scrim: "dark",
        textRatio: 0.64,
        heroStart: 0.16,
        zoom: i === 0 ? 1.26 : 1.16,
        glow: card.split ? theme : "",
      };
      const pad = 16;
      const inner = { x: card.x + pad, y: card.y + 12, w: card.w - pad * 2, h: card.h - 24 };
      if (!card.split) paintGlow(g, inner, theme);
      if (card.split) paintSplit(g, inner, slot, icons, opt);
      else paintStacked(g, inner, slot, icons, opt);
      g.restore();
    });
    paintCredit(g, W - 24, H - 14, "#8d97ad");
  }
  function paintSeal(g, cx, cy, r, text, fill) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    const ink = luma(fill) > 170 ? "#1c1412" : "#fff8ee";
    g.lineWidth = 2;
    g.strokeStyle = ink;
    g.stroke();
    const len = Array.from(text).length;
    const size = len <= 1 ? r : len === 2 ? r * 0.58 : r * 0.4;
    g.fillStyle = ink;
    g.font = face(800, Math.max(10, Math.floor(size)));
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, cx, cy + 1);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
  }
  function paintVertical(g, text, x, y, size, color) {
    const chars = Array.from(text).slice(0, 12);
    g.fillStyle = color;
    g.font = face(750, size);
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    chars.forEach((ch, i) => g.fillText(ch, x, y + i * (size + 6)));
    g.textAlign = "left";
  }
  function paintWa(g, ev, slots, icons, theme) {
    const W = 1600;
    const H = 900;
    g.fillStyle = "#1c1412";
    g.fillRect(0, 0, W, H);
    g.save();
    g.strokeStyle = "rgba(243,234,215,.16)";
    g.lineWidth = 1;
    const step = 56;
    for (let x = -H; x < W + H; x += step) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + H, H);
      g.stroke();
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x - H, H);
      g.stroke();
    }
    g.restore();
    const title = ev.event.name || "Top 8";
    paintVertical(g, title, 64, 118, 22, "#f3ead7");
    g.fillStyle = "#cbbba8";
    g.font = face(650, 16);
    g.textAlign = "right";
    g.textBaseline = "alphabetic";
    g.fillText(captionOf(ev.event, true), 1548, 58, 640);
    g.textAlign = "left";
    g.strokeStyle = "rgba(243,234,215,.35)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(108, 586);
    g.lineTo(1552, 586);
    g.moveTo(884, 78);
    g.lineTo(884, 570);
    g.stroke();
    const cards = [
      { x: 908, y: 78, w: 644, h: 492, r: 52, big: true },
      { x: 108, y: 78, w: 752, h: 156, r: 28, big: false },
      { x: 108, y: 246, w: 752, h: 156, r: 28, big: false },
      { x: 108, y: 414, w: 752, h: 156, r: 28, big: false },
      { x: 108, y: 604, w: 349, h: 220, r: 26, big: false },
      { x: 473, y: 604, w: 349, h: 220, r: 26, big: false },
      { x: 838, y: 604, w: 349, h: 220, r: 26, big: false },
      { x: 1203, y: 604, w: 349, h: 220, r: 26, big: false },
    ];
    cards.forEach((card, index) => {
      const slot = slots[index];
      g.save();
      g.beginPath();
      g.rect(card.x, card.y, card.w, card.h);
      g.clip();
      const r = card.r;
      const left = card.x + r * 2 + 16;
      const box = { x: left, y: card.y + 6, w: card.x + card.w - left - 8, h: card.h - 12 };
      paintStacked(g, box, slot, icons, {
        hidePlace: true,
        placeText: waPlace,
        placeColor: theme,
        placeSize: 20,
        nameColor: "#f6efe4",
        nameSize: card.big ? 52 : 28,
        nameMin: card.big ? 22 : 15,
        mute: "#f0e2d0",
        sub: card.big ? 68 : 44,
        subPlate: "rgba(28,20,18,.72)",
        ghost: card.big ? "優勝" : "",
        ghostSize: 210,
        ghostAlpha: 0.2,
        ghostColor: theme,
        scrim: "dark",
        zoom: card.big ? 1.24 : 1.14,
      });
      if (slot.place != null) {
        const sealText = card.big && slot.place === 1 ? "優勝" : waPlace(slot.place);
        paintSeal(g, card.x + r + 4, card.y + r + 4, r, sealText, theme);
      }
      g.restore();
    });
    g.strokeStyle = "#f3ead7";
    g.lineWidth = 2;
    g.strokeRect(16, 16, 1568, 868);
    g.lineWidth = 1;
    g.strokeRect(26, 26, 1548, 848);
    paintCredit(g, 1548, 850, "#cbbba8");
  }
  async function drawTop8() {
    const ev = R.normalizeEvent(current, roster.length) || current;
    const slots = top8Slots(ev);
    const icons = await preload(slots.flatMap((slot) => (slot.row ? slot.row.chars : [])));
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = true;
    const theme = hexOk(top8Look.color);
    const id = knownTemplate(top8Look.template);
    const paint = id === "minimal" ? paintMinimal : id === "neon" ? paintNeon : id === "wa" ? paintWa : paintSlash;
    paint(g, ev, slots, icons, theme);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }
  function init() {
    if (!roster.length) {
      $("rows").innerHTML = `<p class="hint">ファイター一覧がありません。</p>`;
      return;
    }
    current = loadCurrent();
    library = loadLibrary();
    top8Look = readLook();
    renderLook();
    let lookTimer = 0;
    $("top8templates").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tpl]");
      if (!btn) return;
      top8Look.template = knownTemplate(btn.dataset.tpl);
      writeLook();
      syncLook();
      if (window.ImagePreview && ImagePreview.applyLook) ImagePreview.applyLook(top8Look.template, top8Look.color);
    });
    $("top8color").addEventListener("input", () => {
      top8Look.color = hexOk($("top8color").value);
      writeLook();
      clearTimeout(lookTimer);
      lookTimer = setTimeout(() => {
        if (window.ImagePreview && ImagePreview.applyLook) ImagePreview.applyLook(top8Look.template, top8Look.color);
      }, 120);
    });
    fillMeta();
    renderRows();
    renderLibrary();
    renderRank();
    persist();
    $("evName").addEventListener("input", () => { current.event.name = $("evName").value.slice(0, 80); persist(); });
    $("evDate").addEventListener("input", () => { current.event.date = $("evDate").value.slice(0, 32); persist(); });
    $("evCity").addEventListener("input", () => { current.event.city = $("evCity").value.slice(0, 48); persist(); });
    $("evCountry").addEventListener("input", () => { current.event.country = $("evCountry").value.slice(0, 32); persist(); });
    $("evEntrants").addEventListener("change", () => {
      const raw = $("evEntrants").value.trim();
      if (!raw) { current.event.entrants = null; persist(); return; }
      const v = Number(raw);
      if (Number.isInteger(v) && v >= 1 && v <= 9999) current.event.entrants = v;
      else $("evEntrants").value = current.event.entrants == null ? "" : String(current.event.entrants);
      persist();
    });
    $("applyN").onclick = () => {
      const n = Number($("showN").value);
      if (!Number.isInteger(n) || n < 1 || n > 32) { toast("表示する順位は1から32です"); return; }
      resizeRows(n);
    };
    $("rows").addEventListener("input", (e) => {
      const rowEl = e.target.closest(".place");
      if (!rowEl) return;
      const ri = +rowEl.dataset.i;
      const row = current.rows[ri];
      if (!row) return;
      if (e.target.classList.contains("player-in")) row.player = e.target.value.slice(0, 40);
      else if (e.target.classList.contains("nation-in")) row.nation = e.target.value.slice(0, 12);
      else if (e.target.classList.contains("sponsor-in")) row.sponsor = e.target.value.slice(0, 32);
      persist();
    });
    $("rows").addEventListener("change", (e) => {
      if (!e.target.classList.contains("place-in")) return;
      const ri = +e.target.closest(".place").dataset.i;
      const v = Number(e.target.value);
      if (Number.isInteger(v) && v >= 1 && v <= 9999) current.rows[ri].place = v;
      else e.target.value = String(current.rows[ri].place);
      persist();
    });
    $("rows").addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      const rowEl = e.target.closest(".place");
      if (!act || !rowEl) return;
      const ri = +rowEl.dataset.i;
      const action = act.dataset.act;
      if (action === "rmrow") {
        current.rows.splice(ri, 1);
        renderRows();
        persist();
      } else if (action === "addchar") openPicker(ri, -1);
      else if (action === "replace") {
        const si = +act.closest(".slot").dataset.s;
        openPicker(ri, si);
      } else if (action === "rmchar") {
        const si = +act.closest(".slot").dataset.s;
        current.rows[ri].chars.splice(si, 1);
        renderRows();
        persist();
      } else if (action === "color") {
        const slotEl = act.closest(".slot");
        const si = +slotEl.dataset.s;
        const color = +act.dataset.c;
        if (!R.validSlot(color)) return;
        current.rows[ri].chars[si].color = color;
        slotEl.querySelector(".portrait").src = iconSrc(current.rows[ri].chars[si].id, color);
        slotEl.querySelectorAll(".swatch").forEach((b) => b.classList.toggle("on", +b.dataset.c === color));
        persist();
      }
    });
    async function savePng(kind) {
      const blob = kind === "top8" ? await drawTop8() : await drawResult();
      if (!blob) { toast("画像を作れませんでした"); return; }
      const filename = kind === "top8" ? "smash-top8.png" : "smash-result.png";
      const title = kind === "top8" ? "Top8画像" : "リザルト画像";
      const opts = { title: title, source: blob, filename: filename };
      if (kind === "top8") {
        opts.look = {
          templates: TOP8_TEMPLATES,
          template: top8Look.template,
          color: top8Look.color,
          onChange: async (template, color) => {
            top8Look = { template: knownTemplate(template), color: hexOk(color) };
            writeLook();
            syncLook();
            return drawTop8();
          },
        };
      }
      try {
        await ImagePreview.open(opts);
      } catch (e) {
        toast("プレビューを開けませんでした");
      }
    }
    $("png").onclick = () => savePng("result");
    $("top8").onclick = () => savePng("top8");
    $("share").onclick = async () => {
      persist();
      const url = location.origin + location.pathname + "#r=" + R.encode(current);
      try {
        await navigator.clipboard.writeText(url);
        toast("共有リンクをコピーしました");
      } catch (e) {
        toast("コピーできなかったので、アドレス欄のリンクを使ってください");
      }
    };
    $("toLib").onclick = () => {
      const clean = R.normalizeEvent(current, roster.length);
      if (!clean || !clean.rows.some((r) => r.player || r.chars.length)) {
        toast("選手名かキャラを入れてから集計してください");
        return;
      }
      R.upsertEvent(library, clean);
      saveLibrary();
      renderLibrary();
      renderRank();
      toast("集計に加えました");
    };
    $("export").onclick = () => {
      const events = library.slice();
      const clean = R.normalizeEvent(current, roster.length);
      if (clean && clean.rows.length) R.upsertEvent(events, clean);
      download("smash-results.json", new Blob([JSON.stringify(R.exportBundle(events), null, 2)], { type: "application/json" }));
      toast("JSONを保存しました");
    };
    $("importBtn").onclick = () => $("importFile").click();
    $("importFile").addEventListener("change", async () => {
      const file = $("importFile").files && $("importFile").files[0];
      $("importFile").value = "";
      if (!file) return;
      let events = null;
      try { events = R.parseBundle(await file.text(), roster.length); } catch (e) { events = null; }
      if (!events) { toast("JSONを読めませんでした"); return; }
      events.forEach((ev) => R.upsertEvent(library, ev));
      saveLibrary();
      renderLibrary();
      renderRank();
      toast(events.length + "件読み込みました");
    });
    $("libList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lib]");
      if (!btn) return;
      library.splice(+btn.dataset.lib, 1);
      saveLibrary();
      renderLibrary();
      renderRank();
    });
    function setSort(key) {
      if (sortKey === key) sortDir = sortDir === "desc" ? "asc" : "desc";
      else { sortKey = key; sortDir = key === "name" ? "asc" : "desc"; }
      renderRank();
    }
    $("sortCount").onclick = () => setSort("count");
    $("sortName").onclick = () => setSort("name");
    $("toTier").onclick = () => {
      const usage = R.countUsage(library);
      if (!usage.rows.some((r) => r.count > 0)) { toast("集計されたキャラがありません"); return; }
      const state = R.rankingToTiers(usage.rows);
      const enc = T.encode(state);
      try { localStorage.setItem(TIER_KEY, enc); } catch (e) {}
      location.href = "tier.html#t=" + enc;
    };
    $("pq").addEventListener("input", renderPicker);
    $("pickerGrid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      chooseChar(+btn.dataset.id);
    });
    $("pickerClose").onclick = () => $("picker").close();
    window.addEventListener("hashchange", () => {
      const raw = readHash();
      if (!raw) return;
      const ev = R.decode(raw, roster.length);
      if (!ev) return;
      current = ev;
      fillMeta();
      renderRows();
    });
  }
  init();
})();
