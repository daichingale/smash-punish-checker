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
  async function drawTop8() {
    const ev = R.normalizeEvent(current, roster.length) || current;
    const filled = ev.rows.slice().sort((a, b) => a.place - b.place || 0).slice(0, 8);
    const icons = await preload(filled.flatMap((row) => row.chars));
    const W = 1600;
    const H = 900;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d");
    g.fillStyle = "#10141c";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1a2230";
    g.fillRect(0, 0, W, 84);
    g.fillStyle = "#f2f5f8";
    g.font = "750 34px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.textAlign = "left";
    g.fillText(ev.event.name || "Top 8", 28, 40);
    g.fillStyle = "#c5ced8";
    g.font = "650 18px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.fillText(metaLine(ev.event), 28, 68);
    const slots = [
      { x: 20, y: 100, w: 780, h: 500, main: 390 },
      { x: 816, y: 100, w: 764, h: 236, main: 200 },
      { x: 816, y: 348, w: 376, h: 252, main: 170 },
      { x: 1204, y: 348, w: 376, h: 252, main: 170 },
      { x: 20, y: 616, w: 381, h: 264, main: 150 },
      { x: 413, y: 616, w: 381, h: 264, main: 150 },
      { x: 806, y: 616, w: 381, h: 264, main: 150 },
      { x: 1199, y: 616, w: 381, h: 264, main: 150 },
    ];
    const accent = ["#e6b325", "#d5dbe3", "#cd7f32", "#8ea0b5", "#6cb4ff", "#6cb4ff", "#6cb4ff", "#6cb4ff"];
    slots.forEach((box, i) => {
      const row = filled[i] || null;
      g.fillStyle = "#1c2433";
      roundRect(g, box.x, box.y, box.w, box.h, 16);
      g.fill();
      const label = row ? ordinal(row.place) : (filled.some((r) => r.place === i + 1) ? "" : ordinal(i + 1));
      g.fillStyle = accent[i];
      g.font = "800 " + (i === 0 ? 32 : 22) + "px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
      g.textAlign = "left";
      g.fillText(label, box.x + 16, box.y + (i === 0 ? 40 : 32));
      if (row && row.nation) {
        g.fillStyle = "#c5ced8";
        g.font = "700 16px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
        g.textAlign = "right";
        g.fillText(row.nation, box.x + box.w - 16, box.y + 30);
        g.textAlign = "left";
      }
      const main = row && row.chars[0];
      const imgTop = box.y + (i === 0 ? 52 : 40);
      const imgH = box.h - (i === 0 ? 120 : 108);
      if (main) drawIcon(g, icons[main.id + ":" + main.color], box.x + (box.w - box.main) / 2, imgTop + Math.max(0, (imgH - box.main) / 2), box.main);
      const subs = row ? row.chars.slice(1) : [];
      const sub = i === 0 ? 40 : 28;
      subs.forEach((ch, k) => {
        const sx = box.x + box.w - 14 - (subs.length - k) * (sub + 4);
        const sy = box.y + box.h - sub - 52;
        g.fillStyle = "#10141c";
        roundRect(g, sx, sy, sub, sub, 6);
        g.fill();
        drawIcon(g, icons[ch.id + ":" + ch.color], sx + 2, sy + 2, sub - 4);
      });
      g.fillStyle = "#f2f5f8";
      g.font = "750 " + (i === 0 ? 28 : 20) + "px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
      g.textAlign = "left";
      const name = row ? (tagLine(row) || "—") : "";
      g.fillText(name, box.x + 16, box.y + box.h - 18, box.w - 32);
    });
    g.fillStyle = "#8b97a6";
    g.font = "650 14px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.textAlign = "right";
    g.fillText("非公式  © Nintendo / HAL Laboratory, Inc.", W - 20, H - 8);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }
  function init() {
    if (!roster.length) {
      $("rows").innerHTML = `<p class="hint">ファイター一覧がありません。</p>`;
      return;
    }
    current = loadCurrent();
    library = loadLibrary();
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
      download(kind === "top8" ? "smash-top8.png" : "smash-result.png", blob);
      toast(kind === "top8" ? "Top8画像を保存しました" : "リザルト画像を保存しました");
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
