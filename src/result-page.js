/* 大会リザルト。キャラは公式サイトの切り抜き。色1〜8で画像を切り替える */
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
    $("evDate").value = /^\d{4}-\d{2}-\d{2}$/.test(current.event.date) ? current.event.date : "";
    $("evEntrants").value = current.event.entrants == null ? "" : String(current.event.entrants);
  }
  function slotHtml(rowIndex, slotIndex, slot) {
    const name = roster[slot.id] ? roster[slot.id].name : "";
    const colors = [1, 2, 3, 4, 5, 6, 7, 8].map((c) =>
      `<button type="button" class="swatch${c === slot.color ? " on" : ""}" data-act="color" data-c="${c}" aria-label="${esc(name)} 色${c}"><img src="${iconSrc(slot.id, c)}" alt="" width="28" height="28" loading="lazy" decoding="async"></button>`
    ).join("");
    return `<div class="slot" data-s="${slotIndex}"><img class="portrait" src="${iconSrc(slot.id, slot.color)}" alt="" width="72" height="72" decoding="async"><b>${esc(name)}</b><div class="swatches">${colors}</div><button type="button" data-act="rmchar">外す</button></div>`;
  }
  function renderRows() {
    $("rows").innerHTML = current.rows.map((row, i) => {
      const slots = row.chars.map((slot, s) => slotHtml(i, s, slot)).join("");
      return `<article class="place" data-i="${i}">` +
        `<label>順位<input class="place-in" inputmode="numeric" value="${row.place}" aria-label="順位"></label>` +
        `<label class="player-lab">選手<input class="player-in" maxlength="40" value="${esc(row.player)}" aria-label="選手名" autocomplete="off"></label>` +
        `<button type="button" data-act="rmrow">この順位を削除</button>` +
        `<div class="slots">${slots}</div>` +
        `<button type="button" data-act="addchar">キャラを追加</button>` +
        `</article>`;
    }).join("") || `<p class="hint">順位がありません。「順位を追加」から入れてください。</p>`;
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
      ? rows.map((r) => `<li><img src="${iconSrc(r.id, 1)}" alt="" width="48" height="48" loading="lazy" decoding="async"><b>${esc(nameOf(r.id))}</b><span>${r.count}人</span><span>${esc(R.formatPercent(r.ratio))}</span></li>`).join("")
      : `<li class="empty">まだ集計がありません。</li>`;
  }
  function renderPicker() {
    const q = $("pq").value;
    const all = roster.map((_, i) => i);
    const shown = T.filterPool(all, roster, q, N.haystack, N.norm, N.charNo);
    $("pickerGrid").innerHTML = shown.length
      ? shown.map((i) => `<button type="button" class="pick" data-id="${i}"><img src="${iconSrc(i, 1)}" alt="" width="64" height="64" loading="lazy" decoding="async"><b>${esc(roster[i].name)}</b></button>`).join("")
      : `<p class="empty">該当するファイターはいません。</p>`;
  }
  function openPicker(rowIndex) {
    pickerRow = rowIndex;
    $("pq").value = "";
    renderPicker();
    $("picker").showModal();
    $("pq").focus();
  }
  function addChar(id) {
    const row = current.rows[pickerRow];
    if (!row) return;
    if (row.chars.some((c) => c.id === id)) { toast("同じキャラは1人につき1回です"); return; }
    if (row.chars.length >= R.MAX_CHARS) { toast("キャラは" + R.MAX_CHARS + "人までです"); return; }
    row.chars.push({ id: id, color: 1 });
    $("picker").close();
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
  function nameLines(g, name, maxW) {
    if (g.measureText(name).width <= maxW) return [name];
    const cut = name.indexOf("／");
    const at = cut > 0 ? cut : Math.ceil(name.length / 2);
    return [name.slice(0, at), name.slice(at)];
  }
  function drawIcon(g, img, x, y, size) {
    if (!img) return;
    const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    g.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  }
  async function drawPng() {
    const ev = R.normalizeEvent(current, roster.length) || current;
    const icons = {};
    const jobs = [];
    ev.rows.forEach((row) => row.chars.forEach((ch) => {
      const key = ch.id + ":" + ch.color;
      if (icons[key] !== undefined) return;
      icons[key] = null;
      jobs.push(loadIcon(ch.id, ch.color).then((img) => { icons[key] = img; }));
    }));
    await Promise.all(jobs);
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const bg = dark ? "#0e1116" : "#f4f6f8";
    const card = dark ? "#171c24" : "#ffffff";
    const text = dark ? "#f2f5f8" : "#14181f";
    const sub = dark ? "#c5ced8" : "#3d4754";
    const width = 1080;
    const pad = 36;
    const cellW = 120;
    const cellH = 132;
    const gap = 10;
    const imgSize = 84;
    const nameFont = "650 16px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const bodyFont = "650 22px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const rows = ev.rows.filter((row) => row.player || row.chars.length).sort((a, b) => a.place - b.place);
    const per = Math.max(1, Math.floor((width - pad * 2 + gap) / (cellW + gap)));
    function rowH(n) {
      const lines = Math.max(1, Math.ceil(n / per));
      return 56 + lines * cellH + (lines - 1) * gap;
    }
    const blocks = rows.map((row) => rowH(row.chars.length));
    const height = pad + 96 + blocks.reduce((s, h) => s + h + 12, 0) + 64;
    const canvas = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = bg;
    g.fillRect(0, 0, width, height);
    g.fillStyle = text;
    g.font = "750 36px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const title = ev.event.name || "大会リザルト";
    g.fillText(title, pad, pad + 40);
    g.font = "650 20px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.fillStyle = sub;
    const meta = [ev.event.date, ev.event.entrants ? ev.event.entrants + "人" : ""].filter(Boolean).join("  ·  ");
    g.fillText(meta || "スマブラSP", pad, pad + 74);
    let y = pad + 96;
    rows.forEach((row, ri) => {
      const h = blocks[ri];
      g.fillStyle = card;
      roundRect(g, pad, y, width - pad * 2, h, 16);
      g.fill();
      g.fillStyle = text;
      g.font = "800 28px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
      g.fillText(String(row.place), pad + 16, y + 40);
      g.font = bodyFont;
      g.fillText(row.player || "（名無し）", pad + 80, y + 38);
      row.chars.forEach((ch, k) => {
        const col = k % per;
        const line = Math.floor(k / per);
        const cx = pad + 16 + col * (cellW + gap);
        const cy = y + 52 + line * (cellH + gap);
        drawIcon(g, icons[ch.id + ":" + ch.color], cx + (cellW - imgSize) / 2, cy, imgSize);
        g.fillStyle = text;
        g.font = nameFont;
        g.textAlign = "center";
        const lines = nameLines(g, roster[ch.id] ? roster[ch.id].name : "", cellW - 4);
        lines.forEach((lineText, li) => g.fillText(lineText, cx + cellW / 2, cy + imgSize + 18 + li * 18));
        g.textAlign = "left";
      });
      y += h + 12;
    });
    g.fillStyle = sub;
    g.font = "650 16px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.fillText("非公式。ファイター画像 © Nintendo / HAL Laboratory, Inc.", pad, height - 24);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
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
    $("evName").addEventListener("input", () => {
      current.event.name = $("evName").value.slice(0, 80);
      persist();
    });
    $("evDate").addEventListener("change", () => {
      current.event.date = $("evDate").value.slice(0, 32);
      persist();
    });
    $("evEntrants").addEventListener("change", () => {
      const raw = $("evEntrants").value.trim();
      if (!raw) { current.event.entrants = null; persist(); return; }
      const v = Number(raw);
      if (Number.isInteger(v) && v >= 1 && v <= 9999) current.event.entrants = v;
      else $("evEntrants").value = current.event.entrants == null ? "" : String(current.event.entrants);
      persist();
    });
    $("rows").addEventListener("input", (e) => {
      const rowEl = e.target.closest(".place");
      if (!rowEl) return;
      const ri = +rowEl.dataset.i;
      if (e.target.classList.contains("player-in")) current.rows[ri].player = e.target.value.slice(0, 40);
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
      } else if (action === "addchar") openPicker(ri);
      else if (action === "rmchar") {
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
    $("addRow").onclick = () => {
      if (current.rows.length >= 128) { toast("順位はこれ以上増やせません"); return; }
      const next = current.rows.reduce((m, r) => Math.max(m, r.place), 0) + 1;
      current.rows.push({ place: Math.min(9999, next), player: "", chars: [] });
      renderRows();
      persist();
    };
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
    $("png").onclick = async () => {
      const blob = await drawPng();
      if (!blob) { toast("画像を作れませんでした"); return; }
      download("smash-result.png", blob);
      toast("画像を保存しました");
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
      const blob = new Blob([JSON.stringify(R.exportBundle(events), null, 2)], { type: "application/json" });
      download("smash-results.json", blob);
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
      addChar(+btn.dataset.id);
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
