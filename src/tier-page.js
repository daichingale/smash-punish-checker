/* ティア表の画面。数値データは読まない。公式サイトの切り抜きアイコンを使う */
(function () {
  "use strict";
  const T = window.TierList;
  const N = window.Names;
  const roster = window.__ROSTER__ || [];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "punish.tier";
  let state = T.defaultState();
  let selected = null;
  let drag = null;
  let suppressClick = false;
  let dirty = false;
  let toastTimer = 0;

  function toast(msg) {
    const el = $("toast");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
  }
  function inTier(index) {
    return state.rows.some((r) => r.indexOf(index) >= 0);
  }
  function iconSrc(index, color) {
    const c = color >= 1 && color <= 8 ? color : 1;
    return "fighters/" + index + "/" + c + ".webp";
  }
  function chipHtml(index, picked) {
    const c = roster[index];
    const no = N.charNo(c);
    const go = picked && inTier(index)
      ? `<a class="go" href="index.html#me=${index}&mode=A">反撃チェック</a>`
      : "";
    return `<div class="chipwrap${picked ? " on" : ""}" data-i="${index}"><button type="button" class="chip" aria-pressed="${picked ? "true" : "false"}"><img src="${iconSrc(index, 1)}" alt="" width="72" height="72" loading="lazy" decoding="async"><b>${esc(c.name)}</b><small>${esc(no)}</small></button>${go}</div>`;
  }
  function renderTiers() {
    $("board").innerHTML = state.tiers.map((tier, i) => {
      const ink = T.ink(tier.color);
      const chips = state.rows[i].map((n) => chipHtml(n, n === selected)).join("");
      return `<section class="tier" data-tier="${i}"><div class="tier-side" style="background:${tier.color};color:${ink}">` +
        `<input class="name" value="${esc(tier.name)}" maxlength="16" aria-label="段の名前" enterkeyhint="done">` +
        `<div class="side-row"><button type="button" data-act="up" aria-label="この段を上へ">↑</button><button type="button" data-act="down" aria-label="この段を下へ">↓</button></div>` +
        `<div class="side-row"><input type="color" value="${tier.color}" aria-label="段の色"><button type="button" data-act="del" aria-label="この段を削除">×</button></div>` +
        `</div><div class="tier-body" data-drop="tier">${chips || ""}</div></section>`;
    }).join("");
    $("board").querySelectorAll(".tier").forEach((tierEl) => {
      const i = +tierEl.dataset.tier;
      const side = tierEl.querySelector(".tier-side");
      const name = tierEl.querySelector(".name");
      name.addEventListener("change", () => {
        if (!T.renameTier(state, i, name.value)) name.value = state.tiers[i].name;
        persist(true);
      });
      const color = tierEl.querySelector('input[type="color"]');
      color.addEventListener("input", () => {
        const c = T.validColor(color.value);
        if (!c) return;
        side.style.background = c;
        side.style.color = T.ink(c);
      });
      color.addEventListener("change", () => {
        if (T.recolorTier(state, i, color.value)) persist(true);
      });
      tierEl.querySelector('[data-act="up"]').onclick = () => { if (T.moveTier(state, i, i - 1)) commit(); };
      tierEl.querySelector('[data-act="down"]').onclick = () => { if (T.moveTier(state, i, i + 1)) commit(); };
      tierEl.querySelector('[data-act="del"]').onclick = () => {
        if (!T.removeTier(state, i)) { toast("段は1つ残します"); return; }
        commit();
      };
      side.addEventListener("click", (e) => {
        if (suppressClick || e.target.closest("button, input")) return;
        placeSelected(i);
      });
      tierEl.querySelector(".tier-body").addEventListener("click", (e) => {
        if (suppressClick || e.target.closest(".chipwrap")) return;
        placeSelected(i);
      });
    });
    bindChips($("board"));
  }
  function renderPool() {
    const all = T.poolIndices(state, roster.length);
    const shown = T.filterPool(all, roster, $("q").value, N.haystack, N.norm, N.charNo);
    $("poolTitle").textContent = shown.length === all.length ? `未配置 ${all.length}` : `未配置 ${shown.length} / ${all.length}`;
    $("poolChips").innerHTML = shown.length
      ? shown.map((n) => chipHtml(n, n === selected)).join("")
      : `<p class="empty">${all.length ? "該当するファイターはいません。" : "全員を段に入れました。"}</p>`;
    bindChips($("pool"));
  }
  function renderBar() {
    const bar = $("selbar");
    if (selected == null || !roster[selected]) { bar.hidden = true; document.body.classList.remove("has-sel"); return; }
    document.body.classList.add("has-sel");
    bar.hidden = false;
    $("selname").textContent = roster[selected].name;
    const img = $("selimg");
    img.src = iconSrc(selected, 1);
    img.alt = "";
    const go = $("selgo");
    const placed = inTier(selected);
    $("selhint").hidden = placed;
    if (placed) {
      go.hidden = false;
      go.href = "index.html#me=" + selected + "&mode=A";
    } else go.hidden = true;
    $("selpool").hidden = !inTier(selected);
  }
  function render() {
    renderTiers();
    renderPool();
    renderBar();
  }
  function placeSelected(tierIndex) {
    if (selected == null) return;
    T.moveFighter(state, selected, tierIndex, null);
    selected = null;
    commit();
  }
  function bindChips(root) {
    root.querySelectorAll(".chipwrap").forEach((wrap) => {
      wrap.querySelector(".chip").addEventListener("pointerdown", onDown);
      const go = wrap.querySelector(".go");
      if (go) go.addEventListener("pointerdown", (e) => e.stopPropagation());
    });
  }
  function armDrag() {
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }
  function disarmDrag() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }
  function onCancel(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    endDrag();
  }
  function clearHold() {
    if (drag && drag.hold) clearTimeout(drag.hold);
  }
  function startDrag(x, y) {
    if (!drag || drag.started) return;
    drag.started = true;
    drag.wrap.classList.add("dragging");
    const g = document.createElement("div");
    g.id = "ghost";
    g.className = "chip";
    g.innerHTML = drag.wrap.querySelector(".chip").innerHTML;
    document.body.appendChild(g);
    moveGhost(x, y);
  }
  function moveGhost(x, y) {
    const g = $("ghost");
    if (!g) return;
    g.style.left = x + "px";
    g.style.top = y + "px";
  }
  function insertAt(body, x, y) {
    const chips = [...body.querySelectorAll(".chipwrap")];
    let at = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (y < r.top - 6) return i;
      if (y <= r.bottom + 8) {
        if (x < r.left + r.width / 2) return i;
        at = i + 1;
      }
    }
    return at;
  }
  function markDrop(x, y) {
    document.querySelectorAll(".drop").forEach((el) => el.classList.remove("drop"));
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const pool = el.closest("#pool");
    if (pool) { pool.classList.add("drop"); return; }
    const tier = el.closest(".tier");
    if (tier) tier.classList.add("drop");
  }
  function endDrag() {
    clearHold();
    disarmDrag();
    const g = $("ghost");
    if (g) g.remove();
    document.querySelectorAll(".dragging,.drop").forEach((el) => el.classList.remove("dragging", "drop"));
    drag = null;
  }
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (drag) return;
    const wrap = e.currentTarget.closest(".chipwrap");
    drag = {
      index: +wrap.dataset.i, x: e.clientX, y: e.clientY, pid: e.pointerId,
      started: false, wrap: wrap, touch: e.pointerType === "touch", hold: null,
    };
    armDrag();
    if (drag.touch) drag.hold = setTimeout(() => startDrag(drag.x, drag.y), 220);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.started) {
      const dist = Math.hypot(dx, dy);
      if (drag.touch) {
        if (dist > 12) clearHold();
        return;
      }
      if (dist < 8) return;
      startDrag(e.clientX, e.clientY);
    }
    if (!drag.started) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    markDrop(e.clientX, e.clientY);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const started = drag.started;
    const index = drag.index;
    const ox = drag.x, oy = drag.y;
    const x = e.clientX, y = e.clientY;
    const moved = Math.hypot(x - ox, y - oy) > 12;
    endDrag();
    if (!started || !moved) {
      if (moved) return;
      selected = selected === index ? null : index;
      render();
      return;
    }
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    if (el.closest("#pool")) T.toPool(state, index);
    else {
      const tier = el.closest(".tier");
      if (!tier) return;
      const body = tier.querySelector(".tier-body");
      T.moveFighter(state, index, +tier.dataset.tier, insertAt(body, x, y));
    }
    selected = null;
    commit();
  }
  function persist(forceHash) {
    const enc = T.encode(state);
    try { localStorage.setItem(KEY, enc); } catch (e) {}
    if (forceHash || dirty) {
      dirty = true;
      const next = "#t=" + enc;
      if (location.hash !== next) history.replaceState(null, "", next);
    }
  }
  function commit() {
    dirty = true;
    render();
    persist(true);
  }
  function readHash() {
    return new URLSearchParams(location.hash.replace(/^#/, "")).get("t");
  }
  function load() {
    const fromUrl = readHash();
    if (fromUrl) {
      const s = T.decode(fromUrl, roster.length);
      if (s) { dirty = true; return s; }
      toast("共有リンクを読めなかったので、保存済みの表を開きました");
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = T.decode(raw, roster.length);
        if (s) return s;
      }
    } catch (e) {}
    return T.defaultState();
  }
  function loadIcon(index, color) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = iconSrc(index, color);
    });
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
    const ids = [];
    state.rows.forEach((row) => row.forEach((id) => { if (!ids.includes(id)) ids.push(id); }));
    const icons = {};
    await Promise.all(ids.map(async (id) => { icons[id] = await loadIcon(id, 1); }));
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const bg = dark ? "#0e1116" : "#f4f6f8";
    const card = dark ? "#171c24" : "#ffffff";
    const text = dark ? "#f2f5f8" : "#14181f";
    const sub = dark ? "#c5ced8" : "#3d4754";
    const width = 1080;
    const pad = 28;
    const labelW = 120;
    const cellW = 108;
    const cellH = 136;
    const gap = 8;
    const imgSize = 88;
    const small = "650 16px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const nameFont = "650 15px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    const inner = width - pad * 2 - labelW - 16;
    const per = Math.max(1, Math.floor((inner + gap) / (cellW + gap)));
    const blocks = state.tiers.map((tier, ti) => {
      const n = state.rows[ti].length;
      const rows = Math.max(1, Math.ceil(n / per));
      const h = Math.max(72, rows * cellH + (rows - 1) * gap + 16);
      return { tier, h, per };
    });
    const height = pad + 78 + blocks.reduce((s, b) => s + b.h + 10, 0) + 72;
    const canvas = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = bg;
    g.fillRect(0, 0, width, height);
    g.fillStyle = text;
    g.font = "750 32px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
    g.fillText("スマブラSP ティア表", pad, pad + 34);
    g.font = small;
    g.fillStyle = sub;
    g.fillText("非公式。ファイター画像 © Nintendo / HAL Laboratory, Inc.", pad, pad + 58);
    let y = pad + 78;
    blocks.forEach((b, ti) => {
      g.fillStyle = card;
      roundRect(g, pad, y, width - pad * 2, b.h, 16);
      g.fill();
      g.fillStyle = b.tier.color;
      roundRect(g, pad, y, labelW, b.h, 16);
      g.fill();
      g.fillStyle = T.ink(b.tier.color);
      g.font = "800 28px \"Hiragino Sans\",\"Noto Sans JP\",\"Yu Gothic\",sans-serif";
      g.fillText(b.tier.name, pad + 16, y + b.h / 2 + 10);
      state.rows[ti].forEach((fi, k) => {
        const col = k % b.per;
        const row = Math.floor(k / b.per);
        const cx = pad + labelW + 12 + col * (cellW + gap);
        const cy = y + 8 + row * (cellH + gap);
        g.fillStyle = dark ? "#0e1116" : "#f3f5f7";
        roundRect(g, cx, cy, cellW, cellH, 12);
        g.fill();
        drawIcon(g, icons[fi], cx + (cellW - imgSize) / 2, cy + 6, imgSize);
        g.fillStyle = text;
        g.font = nameFont;
        g.textAlign = "center";
        const lines = nameLines(g, roster[fi].name, cellW - 8);
        lines.forEach((line, li) => g.fillText(line, cx + cellW / 2, cy + imgSize + 22 + li * 16));
        g.textAlign = "left";
      });
      y += b.h + 10;
    });
    g.fillStyle = sub;
    g.font = small;
    const left = T.poolIndices(state, roster.length).length;
    g.fillText("未配置 " + left + "人", pad, height - 40);
    g.fillText("画像: 大乱闘スマッシュブラザーズ SPECIAL 公式サイトの切り抜きを縮小", pad, height - 18);
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
      $("board").innerHTML = `<p class="empty">ファイター一覧がありません。</p>`;
      return;
    }
    state = load();
    $("q").addEventListener("input", renderPool);
    $("add").onclick = () => { if (T.addTier(state)) commit(); else toast("段はこれ以上増やせません"); };
    $("reset").onclick = () => {
      if (!confirm("配置と段の名前・色を最初の状態に戻しますか？")) return;
      state = T.defaultState();
      selected = null;
      $("q").value = "";
      commit();
    };
    $("share").onclick = async () => {
      persist(true);
      const url = location.href;
      try {
        await navigator.clipboard.writeText(url);
        toast("共有リンクをコピーしました");
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        toast(ok ? "共有リンクをコピーしました" : "コピーできなかったので、アドレス欄のリンクを使ってください");
      }
    };
    $("png").onclick = async () => {
      const blob = await drawPng();
      if (!blob) { toast("画像を作れませんでした"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "smash-tier.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast("画像を保存しました");
    };
    $("selclear").onclick = () => { selected = null; render(); };
    $("selpool").onclick = () => {
      if (selected == null) return;
      T.toPool(state, selected);
      selected = null;
      commit();
    };
    $("pool").addEventListener("click", (e) => {
      if (suppressClick || e.target.closest(".chipwrap")) return;
      if (selected == null || !inTier(selected)) return;
      T.toPool(state, selected);
      selected = null;
      commit();
    });
    window.addEventListener("hashchange", () => {
      const raw = readHash();
      if (!raw) return;
      const s = T.decode(raw, roster.length);
      if (!s) return;
      state = s;
      selected = null;
      dirty = true;
      render();
    });
    render();
    try { localStorage.setItem(KEY, T.encode(state)); } catch (e) {}
  }
  init();
})();
