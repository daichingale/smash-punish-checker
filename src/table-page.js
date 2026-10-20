/* 全技表の画面。行データは FrameTable、数値は PunishCalc */
(function () {
  "use strict";
  const T = window.FrameTable;
  const N = window.Names;
  const C = window.PunishCalc;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLS = [
    ["char", "キャラ・技", "left"],
    ["kind", "種類", ""],
    ["startup", "発生", ""],
    ["activeEnd", "持続終わり", ""],
    ["total", "全体F", ""],
    ["landing", "着地隙", ""],
    ["damage", "ダメージ", ""],
    ["stun", "ガード硬直", ""],
    ["adv", "ガード有利", ""],
    ["sure", "確定数", ""],
  ];
  const ROW = 68;
  const OO_KEY = "punish.oo";
  const parsed = T.parseQuery(location.hash);
  const state = parsed;
  state.oo = parsed.oo == null ? storedOo() : parsed.oo;
  let rows = [], needs = [], chars = [], view = [], headH = 44, start = -1, end = -1, pushNext = false, sureMode, draft = [];

  function storedOo() {
    try { return localStorage.getItem(OO_KEY) === "1"; } catch (e) { return false; }
  }
  function rememberOo(on) {
    try { localStorage.setItem(OO_KEY, on ? "1" : "0"); } catch (e) {}
  }

  function fmt(key, v) {
    if (v == null || Number.isNaN(v)) return "—";
    if (key === "adv") return (v > 0 ? "+" : "") + v;
    if (key === "sure") return Number.isInteger(v) ? String(v) : v.toFixed(1);
    if (key === "damage") return String(Math.round(v * 10) / 10);
    return String(v);
  }
  function damageText(r) {
    const f = C.formatParts(r.parts, state.oo);
    return f.text || "—";
  }
  function writeHash() {
    const next = T.serialize(state);
    const cur = T.serialize(T.parseQuery(location.hash));
    if (cur === next) { pushNext = false; return; }
    const url = next ? "#" + next : location.pathname + location.search;
    if (pushNext) history.pushState(null, "", next ? "#" + next : location.pathname + location.search);
    else history.replaceState(null, "", url);
    pushNext = false;
  }
  function renderChrome() {
    $("presets").innerHTML = T.PRESETS.map((p) => `<button type="button" data-preset="${p.id}" aria-pressed="${state.preset === p.id}">${esc(p.label)}</button>`).join("");
    $("kinds").innerHTML = T.KIND_IDS.map((k) => `<button type="button" data-kind="${k}" aria-pressed="${state.kinds.indexOf(k) >= 0}">${esc(T.KIND_LABEL[k])}</button>`).join("");
    $("places").innerHTML = [["", "すべて"], ["ground", "地上"], ["air", "空中"]].map(([id, label]) => `<button type="button" data-place="${id}" aria-pressed="${state.place === id}">${label}</button>`).join("");
    $("picked").innerHTML = state.chars.map((i) => `<button type="button" data-drop="${i}">${esc(chars[i] ? chars[i].name : i)} ×</button>`).join("");
    $("charBtn").textContent = state.chars.length ? "キャラ " + state.chars.length : "キャラ";
    const bits = [`${view.length}件`];
    if (rows.length && view.length !== rows.length) bits[0] += ` / ${rows.length}`;
    const preset = T.PRESET_BY_ID[state.preset];
    if (preset) bits.push(preset.label);
    bits.push(state.vs == null ? "確定数は全キャラ平均" : "確定数は対 " + (chars[state.vs] ? chars[state.vs].name : ""));
    bits.push(state.oo ? "1on1補正あり（ダメージ×1.2）" : "1on1補正なし（基礎ダメージ）");
    $("meta").textContent = bits.join(" · ");
    $("dmgAgg").innerHTML = [["max", "ダメージ最大"], ["min", "ダメージ最小"]].map(([id, label]) => `<button type="button" data-dmg="${id}" aria-pressed="${state.dmg === id}">${label}</button>`).join("");
    $("ooOff").setAttribute("aria-pressed", state.oo ? "false" : "true");
    $("ooOn").setAttribute("aria-pressed", state.oo ? "true" : "false");
    document.querySelectorAll('a[href^="index.html"]').forEach((a) => { a.hash = "oo=" + (state.oo ? "1" : "0"); });
    $("head").innerHTML = `<span class="c-rank"></span>` + COLS.map(([key, label, side]) => {
      const on = state.sort === key;
      const aria = on ? (state.dir === "asc" ? "ascending" : "descending") : "none";
      return `<button type="button" class="${side}" data-sort="${key}" aria-sort="${aria}">${esc(label)}</button>`;
    }).join("");
    $("vs").value = state.vs == null ? "" : String(state.vs);
  }
  function paint(force) {
    const top = Math.max(0, $("scroll").scrollTop - headH);
    const vis = Math.ceil($("scroll").clientHeight / ROW) + 8;
    const s = Math.max(0, Math.floor(top / ROW) - 4);
    const e = Math.min(view.length, s + vis);
    $("space").style.height = (headH + view.length * ROW) + "px";
    if (!force && s === start && e === end) return;
    start = s; end = e;
    if (!view.length) {
      $("space").style.height = (headH + 80) + "px";
      $("win").innerHTML = `<p class="empty">該当する技がありません。</p>`;
      $("win").style.transform = "translateY(" + headH + "px)";
      return;
    }
    let h = "";
    for (let i = s; i < e; i++) {
      const r = view[i];
      const advCls = r.adv == null ? "" : r.adv > 0 ? "pos" : r.adv < 0 ? "neg" : "zero";
      const href = rowHref(r);
      h += `<a class="gridline row" style="height:${ROW}px" href="${esc(href)}"><span class="c-rank">${i + 1}</span><span class="c-name"><b>${esc(r.char)}</b><span>${esc(r.name)}</span>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span><span class="c-kind">${esc(T.KIND_LABEL[r.kind])}</span>`;
      for (const key of ["startup", "activeEnd", "total", "landing"]) h += `<span>${fmt(key, r[key])}</span>`;
      const dmg = damageText(r);
      h += `<span class="c-dmg" title="${esc(dmg)}">${esc(dmg)}</span>`;
      h += `<span>${fmt("stun", r.stun)}</span>`;
      h += `<span class="c-adv ${advCls}">${esc(T.formatAdvRange(r))}</span><span>${fmt("sure", r.sure)}</span></a>`;
    }
    $("win").innerHTML = h;
    $("win").style.transform = "translateY(" + (headH + s * ROW) + "px)";
  }
  function rowHref(r) {
    const p = new URLSearchParams();
    p.set("me", state.vs == null ? "0" : String(state.vs));
    p.set("opp", String(r.ci));
    p.set("mode", "A");
    p.set("g", String(r.group));
    p.set("move", r.id);
    if (r.material) p.set("mo", r.material);
    p.set("oo", state.oo ? "1" : "0");
    return "index.html#" + p.toString();
  }
  function apply(scrollTop) {
    if (state.vs != null && (state.vs < 0 || state.vs >= chars.length)) state.vs = null;
    state.chars = state.chars.filter((i) => chars[i]);
    rememberOo(state.oo);
    if (sureMode !== state.vs) { T.fillSure(rows, needs, state.vs); sureMode = state.vs; }
    T.applyDamageKey(rows, state.dmg);
    view = T.applyView(rows, state);
    start = end = -1;
    renderChrome();
    headH = $("head").offsetHeight || 44;
    if (scrollTop) $("scroll").scrollTop = 0;
    paint(true);
    writeHash();
  }
  function bind() {
    $("presets").onclick = (e) => {
      const b = e.target.closest("[data-preset]"); if (!b) return;
      const id = b.dataset.preset;
      if (state.preset === id) { state.preset = ""; state.sort = "order"; state.dir = "asc"; }
      else { state.preset = id; state.sort = T.PRESET_BY_ID[id].sort; state.dir = T.PRESET_BY_ID[id].dir; }
      pushNext = true; apply(true);
    };
    $("kinds").onclick = (e) => {
      const b = e.target.closest("[data-kind]"); if (!b) return;
      const k = b.dataset.kind;
      const i = state.kinds.indexOf(k);
      if (i >= 0) state.kinds.splice(i, 1); else state.kinds.push(k);
      pushNext = true; apply(true);
    };
    $("places").onclick = (e) => {
      const b = e.target.closest("[data-place]"); if (!b) return;
      state.place = b.dataset.place; pushNext = true; apply(true);
    };
    $("dmgAgg").onclick = (e) => {
      const b = e.target.closest("[data-dmg]"); if (!b) return;
      state.dmg = b.dataset.dmg === "min" ? "min" : "max";
      state.sort = "damage";
      state.dir = "desc";
      state.preset = "";
      pushNext = true; apply(true);
    };
    $("oo").onclick = (e) => {
      const b = e.target.closest("[data-oo]"); if (!b) return;
      const on = b.dataset.oo === "1";
      if (state.oo === on) return;
      state.oo = on;
      rememberOo(on);
      pushNext = true; apply(false);
    };
    $("picked").onclick = (e) => {
      const b = e.target.closest("[data-drop]"); if (!b) return;
      state.chars = state.chars.filter((i) => i !== +b.dataset.drop);
      pushNext = true; apply(true);
    };
    $("head").onclick = (e) => {
      const b = e.target.closest("[data-sort]"); if (!b) return;
      const key = b.dataset.sort;
      if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else { state.sort = key; state.dir = T.FIRST_DIR[key] || "asc"; }
      state.preset = "";
      pushNext = true; apply(true);
    };
    let timer = 0;
    $("q").value = state.text;
    $("q").oninput = () => {
      state.text = $("q").value;
      clearTimeout(timer);
      timer = setTimeout(() => { pushNext = false; apply(true); }, 120);
    };
    $("vs").onchange = () => {
      state.vs = $("vs").value === "" ? null : +$("vs").value;
      pushNext = true; apply(false);
    };
    $("scroll").addEventListener("scroll", () => { paint(false); }, { passive: true });
    window.addEventListener("hashchange", () => {
      const n = T.parseQuery(location.hash);
      const prevOo = state.oo;
      Object.assign(state, n);
      if (n.oo == null) state.oo = prevOo;
      else rememberOo(state.oo);
      $("q").value = state.text;
      apply(true);
    });
    window.addEventListener("resize", () => { start = -1; paint(true); });
    $("charBtn").onclick = openPicker;
    $("pkClose").onclick = closePicker;
    $("pkDone").onclick = () => { state.chars = draft.slice(); pushNext = true; closePicker(); apply(true); };
    $("pkQ").oninput = renderPicker;
    $("pkBody").onclick = (e) => {
      const b = e.target.closest(".ch"); if (!b) return;
      const i = +b.dataset.i;
      const at = draft.indexOf(i);
      if (at >= 0) draft.splice(at, 1); else draft.push(i);
      renderPicker();
    };
    document.addEventListener("keydown", (e) => {
      const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT");
      if (e.key === "Escape" && !$("picker").hidden) { closePicker(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); $("q").focus(); }
    });
  }
  function openPicker() {
    draft = state.chars.slice();
    $("pkQ").value = "";
    $("picker").hidden = false;
    document.body.classList.add("noscroll");
    renderPicker();
    setTimeout(() => $("pkQ").focus(), 30);
  }
  function closePicker() { $("picker").hidden = true; document.body.classList.remove("noscroll"); }
  function renderPicker() {
    const qv = N.norm($("pkQ").value.trim());
    const list = chars.map((c, i) => i).filter((i) => !qv || N.haystack(chars[i]).includes(qv) || N.charNo(chars[i]).replace("'", "") === qv);
    $("pkBody").innerHTML = list.length ? `<div class="grid">${list.map((i) => {
      const c = chars[i];
      return `<button type="button" class="ch${draft.indexOf(i) >= 0 ? " on" : ""}" data-i="${i}"><span class="no">${esc(N.charNo(c))}</span>${esc(c.name)}</button>`;
    }).join("")}</div>` : `<p class="empty">「${esc($("pkQ").value)}」に一致するキャラはいません。</p>`;
  }
  function boot(data) {
    chars = data.chars;
    rows = T.buildRows(data, C);
    needs = T.punishNeeds(chars, C);
    $("vs").innerHTML = `<option value="">平均</option>` + chars.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join("");
    bind();
    apply(false);
  }
  function load() {
    const tries = ["data.json", "../data/data.json"];
    (async () => {
      if (window.__DATA__) return window.__DATA__;
      for (const url of tries) {
        try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) {}
      }
      throw new Error("no data");
    })().then(boot).catch(() => { $("meta").textContent = "フレームデータを読み込めませんでした。"; });
  }
  load();
})();
