/* 画面ロジック。データは window.__DATA__（dist の単体HTML）か data.json を読む */
(function () {
  "use strict";
  const C = window.PunishCalc;
  const Mii = window.MiiSlots;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const state = { me: 0, opp: 0, mode: "A", moveId: null, ps: false, oo: false, arsene: false, crit: false, ink: false, mat: {}, group: 0, slot: "", mu: false };
  const OO_KEY = "punish.oo";
  let D, pushNext = false, overlay = null;

  const GROUPS = [
    ["弱・強", "弱・強攻撃・ダッシュ攻撃", (m) => m.category === "ground" && !/スマッシュ/.test(m.name) && m.input !== "command"],
    ["スマッシュ", "スマッシュ攻撃", (m) => m.category === "ground" && /スマッシュ/.test(m.name)],
    ["空中", "空中攻撃", (m) => m.category === "aerial"],
    ["必殺", "必殺ワザ", (m) => m.category === "special" && m.input !== "command"],
    ["コマンド", "コマンド技", (m) => m.category === "command" || m.input === "command"],
  ];
  const hasHit = (m) => m.rows.some((r) => r.active && (r.damage == null || Math.max.apply(null, r.damage) > 0));
  const shortName = (m) => {
    if (m.category === "special") {
      const v = m.variant || "";
      const base = v && !/^(地上|空中|地上・空中|通常|地上\s*\(空中\))$/.test(v) ? v : (m.title || "");
      const place = /^(地上|空中)$/.test(v) ? `・${v}` : "";
      const tag = [m.versionLabel, m.landingVariant].filter(Boolean).join(" ");
      return `${m.group}${base ? " " + base : ""}${place}${m.strength ? `（${m.strength}）` : ""}${tag ? " " + tag : ""}`;
    }
    return m.name.replace(/［(ボタン|コマンド)］$/, "");
  };

  function attackerChar() { return D.chars[state.mode === "A" ? state.opp : state.me]; }
  function attackerIsMii() { return Mii.isMiiName(attackerChar().name); }
  function specialGroupIndex() { return GROUPS.findIndex((g) => g[0] === "必殺"); }
  function defenderChar() { return D.chars[state.mode === "A" ? state.me : state.opp]; }
  function matOf(idx) { const c = D.chars[idx]; return c.materials.length ? (state.mat[idx] || c.materials[1] || c.materials[0]) : null; }
  function visibleMoves() {
    const att = attackerChar();
    const mat = matOf(D.chars.indexOf(att));
    return att.moves.filter((m) => m.category !== "grab" && hasHit(m) && (!mat || !m.material || m.material === mat));
  }

  let scrollToResult = false;
  function clampIdx(v, d) { return Number.isInteger(v) && v >= 0 && v < D.chars.length ? v : d; }
  function groupOf(move) {
    const i = GROUPS.findIndex((g) => g[2](move));
    return i < 0 ? 0 : i;
  }
  function applyHash() {
    const q = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (q.has("me")) state.me = clampIdx(+q.get("me"), state.me);
    if (q.has("opp")) state.opp = clampIdx(+q.get("opp"), state.opp);
    state.mode = q.get("mode") === "B" ? "B" : "A";
    state.ps = q.get("ps") === "1";
    state.arsene = q.get("ars") === "1";
    state.crit = q.get("crit") === "1";
    state.ink = q.get("ink") === "1";
    if (q.has("oo")) state.oo = q.get("oo") === "1";
    else { try { state.oo = localStorage.getItem(OO_KEY) === "1"; } catch (e) { state.oo = false; } }
    try { localStorage.setItem(OO_KEY, state.oo ? "1" : "0"); } catch (e) {}
    for (const [idx, key] of [[state.me, "mm"], [state.opp, "mo"]]) {
      const c = D.chars[idx];
      const v = q.get(key);
      if (c && c.materials.length && v && c.materials.includes(v)) state.mat[idx] = v;
    }
    const mv = q.get("move");
    const att = attackerChar();
    state.moveId = mv && att.moves.some((m) => m.id === mv) ? mv : null;
    const g = q.get("g");
    if (g != null && /^\d$/.test(g) && +g < GROUPS.length) state.group = +g;
    else if (state.moveId) state.group = groupOf(att.moves.find((m) => m.id === state.moveId));
    const slot = q.get("slot") || "";
    state.slot = Mii.SLOT_IDS.indexOf(slot) >= 0 ? slot : "";
    state.mu = q.get("mu") === "1";
    scrollToResult = !!state.moveId;
  }
  function hashString() {
    const p = new URLSearchParams();
    p.set("me", String(state.me));
    p.set("opp", String(state.opp));
    p.set("mode", state.mode);
    p.set("g", String(state.group));
    if (state.moveId) p.set("move", state.moveId);
    if (state.ps) p.set("ps", "1");
    if (state.arsene) p.set("ars", "1");
    if (state.crit) p.set("crit", "1");
    if (state.ink) p.set("ink", "1");
    p.set("oo", state.oo ? "1" : "0");
    const meC = D.chars[state.me], oppC = D.chars[state.opp];
    if (meC.materials.length) p.set("mm", matOf(state.me));
    if (oppC.materials.length) p.set("mo", matOf(state.opp));
    if (state.slot && attackerIsMii()) p.set("slot", state.slot);
    if (state.mu) p.set("mu", "1");
    return p.toString();
  }
  function writeHash() {
    const next = hashString();
    const cur = new URLSearchParams(location.hash.replace(/^#/, "")).toString();
    const onOverlay = history.state && history.state.overlay;
    if (cur === next) {
      if (onOverlay) history.replaceState(null, "", "#" + next);
      pushNext = false;
      return;
    }
    const url = "#" + next;
    if (onOverlay || !pushNext) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    pushNext = false;
  }

  function init(data) {
    D = data;
    applyHash();
    $("meBtn").onclick = () => openPicker("me");
    $("oppBtn").onclick = () => openPicker("opp");
    $("glance").onclick = (e) => {
      const b = e.target.closest(".ex");
      if (!b) return;
      openMove(b.dataset.id);
    };
    $("matchup").addEventListener("toggle", () => {
      if (state.moveId) return;
      const open = $("matchup").open;
      if (open === state.mu) return;
      state.mu = open;
      writeHash();
    });
    $("matchup").addEventListener("click", (e) => {
      const b = e.target.closest(".murow");
      if (!b) return;
      openMove(b.dataset.id);
    });
    $("result").addEventListener("click", (e) => {
      if (!e.target.closest("[data-act=back]")) return;
      state.moveId = null;
      pushNext = true;
      render();
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      (state.mu ? $("matchup") : $("glance")).scrollIntoView({ behavior: behavior, block: "start" });
    });
    $("swap").onclick = swap;
    initPicker();
    $("modeA").onclick = () => setMode("A");
    $("modeB").onclick = () => setMode("B");
    $("ps").onchange = (e) => setPs(e.target.checked);
    $("psDock").onchange = (e) => setPs(e.target.checked);
    $("oo").onclick = (e) => { const b = e.target.closest("[data-oo]"); if (b) setOo(b.dataset.oo === "1"); };
    $("ooDock").onclick = (e) => { const b = e.target.closest("[data-oo]"); if (b) setOo(b.dataset.oo === "1"); };
    $("ars").onclick = (e) => { const b = e.target.closest("[data-ars]"); if (b) setArs(b.dataset.ars === "1"); };
    $("arsDock").onclick = (e) => { const b = e.target.closest("[data-ars]"); if (b) setArs(b.dataset.ars === "1"); };
    $("crit").onclick = (e) => { const b = e.target.closest("[data-crit]"); if (b) setCrit(b.dataset.crit === "1"); };
    $("critDock").onclick = (e) => { const b = e.target.closest("[data-crit]"); if (b) setCrit(b.dataset.crit === "1"); };
    $("ink").onclick = (e) => { const b = e.target.closest("[data-ink]"); if (b) setInk(b.dataset.ink === "1"); };
    $("inkDock").onclick = (e) => { const b = e.target.closest("[data-ink]"); if (b) setInk(b.dataset.ink === "1"); };
    $("flip").onclick = () => setMode(state.mode === "A" ? "B" : "A");
    $("slots").onclick = (e) => {
      const b = e.target.closest("[data-slot]");
      if (!b) return;
      setSlot(b.dataset.slot);
    };
    $("detailBtn").onclick = openSheet;
    $("sheetBack").onclick = dismissOverlay;
    $("sheetClose").onclick = dismissOverlay;
    const grab = $("sheetGrab");
    let y0 = 0;
    grab.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    grab.addEventListener("touchend", (e) => { if (e.changedTouches[0].clientY - y0 > 48) dismissOverlay(); });
    window.addEventListener("hashchange", () => { applyHash(); render(); });
    window.addEventListener("popstate", () => { if (overlay) { overlay = null; hideOverlays(); } });
    document.addEventListener("keydown", onKey);
    new ResizeObserver(() => {
      document.documentElement.style.setProperty("--bar", $("top").offsetHeight + "px");
    }).observe($("top"));
    $("builtAt").textContent = `データ取得: ${(D.meta.fetchedAt || "").slice(0, 10)} ／ 計算: スマブラSPECIAL 検証wiki の式`;
    render();
    if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "manifest.webmanifest";
      document.head.appendChild(link);
      window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
    }
  }

  function onKey(e) {
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (e.key === "Escape") { if (overlay) { e.preventDefault(); dismissOverlay(); } return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); openPicker("opp"); }
    else if (e.key === "x") { e.preventDefault(); swap(); }
    else if (e.key === "r") { e.preventDefault(); setMode(state.mode === "A" ? "B" : "A"); }
    else if (e.key === "j") { e.preventDefault(); setPs(!state.ps); }
    else if (e.key >= "1" && e.key <= "5") { e.preventDefault(); setGroup(+e.key - 1); }
  }
  function swap() {
    [state.me, state.opp] = [state.opp, state.me];
    state.moveId = null;
    pushNext = true;
    render();
  }
  function setMode(m) {
    if (state.mode === m) return;
    state.mode = m;
    state.moveId = null;
    pushNext = true;
    render();
  }
  function setPs(on) {
    on = !!on;
    if (state.ps === on) return;
    state.ps = on;
    pushNext = true;
    render();
  }
  function setOo(on) {
    on = !!on;
    if (state.oo === on) return;
    state.oo = on;
    try { localStorage.setItem(OO_KEY, on ? "1" : "0"); } catch (e) {}
    pushNext = true;
    render();
  }
  function setArs(on) {
    on = !!on;
    if (state.arsene === on) return;
    state.arsene = on;
    pushNext = true;
    render();
  }
  function setCrit(on) {
    on = !!on;
    if (state.crit === on) return;
    state.crit = on;
    pushNext = true;
    render();
  }
  function setInk(on) {
    on = !!on;
    if (state.ink === on) return;
    state.ink = on;
    pushNext = true;
    render();
  }
  function formOpts() {
    const name = attackerChar().name;
    return {
      arsene: state.arsene && name === "ジョーカー",
      crit: state.crit && name === "勇者",
      ink: state.ink && name === "インクリング",
    };
  }
  function setGroup(i) {
    if (!GROUPS[i] || state.group === i) return;
    state.group = i;
    pushNext = true;
    render();
  }
  function setSlot(id) {
    const next = Mii.toggleSlot(state.slot, id);
    if (next === state.slot) return;
    state.slot = next;
    if (next) {
      const gi = specialGroupIndex();
      if (gi >= 0) state.group = gi;
    }
    pushNext = true;
    render();
  }

  const norm = window.Names.norm;
  const charNo = window.Names.charNo;
  const haystack = window.Names.haystack;
  let pickFor = null;
  const RECENT_KEY = "punish.recent";
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((i) => D.chars[i]); } catch (e) { return []; } };
  function initPicker() {
    $("pkClose").onclick = dismissOverlay;
    $("pkQ").oninput = renderPicker;
    $("pkQ").onkeydown = (e) => { if (e.key === "Enter") { const b = $("pkBody").querySelector(".ch"); if (b) b.click(); } };
    $("pkBody").onclick = (e) => {
      const b = e.target.closest(".ch"); if (!b) return;
      const i = +b.dataset.i; state[pickFor] = i; state.moveId = null;
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([i].concat(recent().filter((x) => x !== i)).slice(0, 8))); } catch (err) {}
      pushNext = true;
      render();
      overlay = null;
      hideOverlays();
    };
  }
  function pushOverlay(kind) {
    const url = location.href;
    if (history.state && history.state.overlay) history.replaceState({ overlay: kind }, "", url);
    else history.pushState({ overlay: kind }, "", url);
    overlay = kind;
  }
  function openPicker(who) {
    if (overlay === "picker" && pickFor === who) { $("pkQ").focus(); return; }
    pickFor = who;
    $("pkTitle").textContent = who === "me" ? "自分のキャラ" : "相手のキャラ";
    $("pkTitle").className = who;
    $("pkQ").value = "";
    $("sheet").hidden = true;
    $("picker").hidden = false;
    document.body.classList.add("noscroll");
    pushOverlay("picker");
    renderPicker();
    setTimeout(() => $("pkQ").focus(), 30);
  }
  function hideOverlays() {
    $("picker").hidden = true;
    $("sheet").hidden = true;
    document.body.classList.remove("noscroll");
  }
  function dismissOverlay() {
    if (!overlay) return;
    const kind = overlay;
    overlay = null;
    hideOverlays();
    if (history.state && history.state.overlay === kind) history.back();
  }
  function faceSrc(i) { return "fighters/" + i + "/1.webp"; }
  function tile(i) {
    const c = D.chars[i], cur = state[pickFor] === i;
    return `<button type="button" class="ch${cur ? " on" : ""}" data-i="${i}" aria-label="${esc(c.name)}"><img src="${faceSrc(i)}" alt="" width="72" height="72" loading="lazy" decoding="async"><span class="nm">${esc(c.name)}</span><span class="no">${esc(charNo(c))}${c.stale ? `<span class="st" title="データが古い可能性">⚠</span>` : ""}</span></button>`;
  }
  function renderPicker() {
    const raw = $("pkQ").value.trim();
    const qv = norm(raw);
    const all = D.chars.map((c, i) => i);
    const hit = qv ? all.filter((i) => { const c = D.chars[i]; return haystack(c).includes(qv) || charNo(c).replace("'", "") === qv; }) : all;
    let h = "";
    if (!qv) {
      const r = recent();
      if (r.length) h += `<h3>最近使ったキャラ</h3><div class="recents">${r.map((i) => tile(i)).join("")}</div>`;
      h += `<h3>全キャラ（${D.chars.length}）</h3>`;
    }
    h += hit.length ? `<div class="grid">${hit.map((i) => tile(i)).join("")}</div>` : `<p class="empty">「${esc(raw)}」に一致するキャラはいません。読み・英語名・ファイター番号でも探せます。</p>`;
    h += `<p class="pkNote">⚠ はシートの最終更新が最後の調整より前です。</p>`;
    $("pkBody").innerHTML = h;
  }

  function renderSlots() {
    const el = $("slots");
    if (!attackerIsMii()) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    const lines = [];
    for (const s of Mii.SLOTS) {
      let line = lines[lines.length - 1];
      if (!line || line.dir !== s.dir) {
        line = { dir: s.dir, label: s.dirLabel, items: [] };
        lines.push(line);
      }
      line.items.push(s);
    }
    el.innerHTML = lines.map((line) => {
      const btns = line.items.map((s) => `<button type="button" data-slot="${s.id}" aria-pressed="${state.slot === s.id ? "true" : "false"}" aria-label="${esc(s.label)}">${s.num}</button>`).join("");
      return `<div class="slotline" role="group" aria-label="${esc(line.label)}"><span>${esc(line.label)}</span>${btns}</div>`;
    }).join("");
  }

  function renderMats() {
    let h = "";
    for (const [idx, who] of [[state.me, "自分"], [state.opp, "相手"]]) {
      const c = D.chars[idx];
      if (!c.materials.length) continue;
      const cur = matOf(idx);
      h += `<div class="mats"><span>${who}</span>` +
        c.materials.map((x) => `<button type="button" class="chip ${x === cur ? "on" : ""}" data-idx="${idx}" data-mat="${esc(x)}">${esc(x)}</button>`).join("") + "</div>";
    }
    $("mats").innerHTML = h;
    $("mats").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.mat[+b.dataset.idx] = b.dataset.mat; state.moveId = null; pushNext = true; render(); }));
  }

  function render() {
    document.body.classList.toggle("has-move", !!state.moveId);
    $("dock").hidden = !state.moveId;
    for (const id of ["ooOff", "ooOn", "ooOffDock", "ooOnDock"]) {
      const el = $(id);
      if (el) el.setAttribute("aria-pressed", (id.indexOf("On") >= 0) === state.oo ? "true" : "false");
    }
    const attName = attackerChar().name;
    const jokerAtt = attName === "ジョーカー";
    const heroAtt = attName === "勇者";
    const inkAtt = attName === "インクリング";
    for (const id of ["ars", "arsDock"]) { const el = $(id); if (el) el.hidden = !jokerAtt; }
    for (const id of ["crit", "critDock"]) { const el = $(id); if (el) el.hidden = !heroAtt; }
    for (const id of ["ink", "inkDock"]) { const el = $(id); if (el) el.hidden = !inkAtt; }
    document.body.classList.toggle("has-form", (jokerAtt || heroAtt || inkAtt) && !!state.moveId);
    for (const id of ["arsOff", "arsOn", "arsOffDock", "arsOnDock"]) {
      const el = $(id);
      if (el) el.setAttribute("aria-pressed", (id.indexOf("On") >= 0) === state.arsene ? "true" : "false");
    }
    for (const id of ["critOff", "critOn", "critOffDock", "critOnDock"]) {
      const el = $(id);
      if (el) el.setAttribute("aria-pressed", (id.indexOf("On") >= 0) === state.crit ? "true" : "false");
    }
    for (const id of ["inkOff", "inkOn", "inkOffDock", "inkOnDock"]) {
      const el = $(id);
      if (el) el.setAttribute("aria-pressed", (id.indexOf("On") >= 0) === state.ink ? "true" : "false");
    }
    document.querySelectorAll('a[href^="table.html"]').forEach((a) => {
      const p = new URLSearchParams();
      p.set("oo", state.oo ? "1" : "0");
      if (state.arsene) p.set("ars", "1");
      if (state.crit) p.set("crit", "1");
      if (state.ink) p.set("ink", "1");
      a.hash = p.toString();
    });
    $("modeA").classList.toggle("on", state.mode === "A");
    $("modeB").classList.toggle("on", state.mode === "B");
    $("modeA").setAttribute("aria-selected", state.mode === "A" ? "true" : "false");
    $("modeB").setAttribute("aria-selected", state.mode === "B" ? "true" : "false");
    $("ps").checked = state.ps;
    $("psDock").checked = state.ps;
    $("flip").textContent = state.mode === "A" ? "逆" : "通常";
    $("flip").setAttribute("aria-pressed", state.mode === "B" ? "true" : "false");
    $("flip").setAttribute("aria-label", state.mode === "A" ? "逆向きにする" : "通常の向きに戻す");
    for (const [k, id] of [["me", "meBtn"], ["opp", "oppBtn"]]) {
      const c = D.chars[state[k]];
      const who = k === "me" ? "自分" : "相手";
      $(id).innerHTML = `<img class="face" src="${faceSrc(state[k])}" alt="" width="48" height="48" decoding="async"><span class="who ${k}">${who}</span><span class="nm">${esc(c.name)}</span>${c.stale ? `<span class="st" title="データが古い可能性">⚠</span>` : ""}<span class="dd">▾</span>`;
      $(id).setAttribute("aria-label", (k === "me" ? "自分のキャラ " : "相手のキャラ ") + c.name);
    }
    if (!attackerIsMii()) state.slot = "";
    renderMats();
    renderSlots();
    const warn = [state.me, state.opp].filter((v, i, a) => a.indexOf(v) === i).map((i) => D.chars[i]).filter((c) => c.stale)
      .map((c) => `⚠ ${esc(c.name)}: ${esc(c.stale)}。数値はシート掲載時点のものです。`);
    $("banner").innerHTML = warn.map((w) => `<div class="banner">${w}</div>`).join("");
    const moves = visibleMoves();
    const counts = GROUPS.map((g) => moves.filter(g[2]).length);
    if (!counts[state.group]) { const i = counts.findIndex((n) => n); if (i >= 0) state.group = i; }
    $("groups").innerHTML = GROUPS.map((g, i) => counts[i] ? `<button type="button" role="tab" data-g="${i}" aria-selected="${i === state.group ? "true" : "false"}" aria-label="${esc(g[1])}">${esc(g[0])}</button>` : "").join("");
    $("groups").querySelectorAll("button").forEach((b) => (b.onclick = () => setGroup(+b.dataset.g)));
    let shown = moves.filter(GROUPS[state.group][2]);
    const slotOn = !!state.slot && GROUPS[state.group][0] === "必殺";
    if (state.slot) shown = Mii.filterBySlot(shown, state.slot);
    const unnamed = slotOn && shown.some((m) => Mii.miiSlot(m) == null);
    $("lead").textContent = state.moveId ? "" : slotOn
      ? Mii.slotLabel(state.slot) + " の必殺に絞っています。" + (unnamed ? "番号のない技も残しています。" : "") + "同じチップをもう一度押すと解除します。対キャラ早見は全技のままです。"
      : "上の対キャラ早見に、確定がある技をまとめています。下の行を押すと、その技だけの数字が出ます。";
    const slotExists = slotOn && attackerChar().moves.some((m) => Mii.miiSlot(m) === state.slot);
    const emptyMsg = slotOn
      ? (slotExists ? "この番号の必殺は、当たる判定がシートに無いため一覧にありません。" : "この番号の必殺はありません。")
      : "この種類の技はありません。";
    $("moveArea").innerHTML = shown.length ? `<div class="moves">` + shown.map((m) => {
      const a = C.shieldAdvantage(m, formOpts());
      const sub = [m.input === "button" ? "ボタン" : m.input === "command" ? (m.command ? "コマンド " + m.command : "コマンド") : m.command || "", m.material || ""].filter(Boolean).join("・");
      return `<button type="button" class="mv ${m.id === state.moveId ? "on" : ""} ${a.ok ? "" : "na"}" data-id="${m.id}">${esc(shortName(m))}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;
    }).join("") + `</div>` : `<p class="empty">${emptyMsg}</p>`;
    $("moveArea").querySelectorAll(".mv").forEach((b) => (b.onclick = () => {
      state.moveId = b.dataset.id;
      pushNext = true;
      scrollToResult = true;
      render();
    }));
    renderGlance();
    renderMatchup();
    renderResult();
    writeHash();
    if (scrollToResult && state.moveId) {
      scrollToResult = false;
      const y = $("result").getBoundingClientRect().top + window.scrollY - $("top").offsetHeight - $("groups").offsetHeight - 8;
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top: Math.max(0, y), behavior });
    }
  }

  function openMove(id) {
    const move = attackerChar().moves.find((m) => m.id === id);
    if (!move) return;
    state.moveId = move.id;
    state.group = groupOf(move);
    pushNext = true;
    scrollToResult = true;
    render();
  }
  function routeShort(route) {
    return route === "drop" ? "解除" : "ガーキャン";
  }
  /** 1行に収める短い技名。全文は shortName を title と読み上げに残す */
  function listName(m) {
    if ((m.category === "special" || m.category === "command") && m.group) {
      const place = m.landingVariant ? "着地" : (m.versionLabel || (m.variant === "地上" || m.variant === "空中" ? m.variant : ""));
      const extra = [place, m.strength].filter(Boolean).join("・");
      return extra ? m.group + "・" + extra : m.group;
    }
    return shortName(m);
  }
  function tierMark(tier) {
    if (tier === "severe") return `<span class="t2 severe">シビア</span>`;
    if (tier === "easy") return `<span class="t2 easy">余裕</span>`;
    return "";
  }
  function renderMatchup() {
    const det = $("matchup");
    if (state.moveId) { det.hidden = true; return; }
    det.hidden = false;
    if (det.open !== !!state.mu) det.open = !!state.mu;
    const att = attackerChar(), def = defenderChar();
    const defIdx = D.chars.indexOf(def);
    const attWho = state.mode === "A" ? "相手" : "自分";
    const defWho = state.mode === "A" ? "自分" : "相手";
    const opts = Object.assign({ perfectShield: state.ps, defenderMaterial: matOf(defIdx) }, formOpts());
    const g = C.matchupGlance(att, def, visibleMoves(), opts);
    const count = det.querySelector(".mucount");
    if (count) count.textContent = "確定 " + g.sure.length + "件";
    const form = formOpts();
    const notes = [];
    if (state.ps) notes.push("ジャストシールドした場合です。");
    if (form.arsene) notes.push("アルセーヌありです。");
    if (form.crit) notes.push("会心の一撃ありです。");
    if (form.ink) notes.push("インク切れです。");
    const cap = attWho + "の全技です。ガードしたときの、" + defWho + "の最速の確定反撃を、有利が大きい順に並べています。";
    const advCls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "zero");
    const rowBtn = (row, kind) => {
      const full = shortName(row.move);
      const name = listName(row.move);
      const b = row.best;
      let label, cells;
      if (kind === "skip") {
        label = attWho + "の" + full + "は計算対象外";
        cells = `<span class="nm" title="${esc(full)}">${esc(name)}</span><span class="adv">—</span><span class="pn">対象外</span><span class="route"></span><span class="mg"></span><span class="tier"></span>`;
      } else if (!b) {
        label = attWho + "の" + full + "をガード、有利" + fmtAdv(row.adv) + "F。確定の反撃はありません";
        cells = `<span class="nm" title="${esc(full)}">${esc(name)}</span><span class="adv ${advCls(row.adv)}">${fmtAdv(row.adv)}</span><span class="pn">確定なし</span><span class="route"></span><span class="mg"></span><span class="tier"></span>`;
      } else {
        const punishFull = shortName(b.move);
        const punish = listName(b.move);
        const tierWord = b.tier === "severe" ? "、シビア" : b.tier === "easy" ? "、余裕" : "";
        label = attWho + "の" + full + "をガード、有利" + fmtAdv(row.adv) + "F。" + defWho + "は" + punishFull + "、" + b.routeLabel + "、猶予" + fmtAdv(b.margin) + "F" + tierWord;
        cells = `<span class="nm" title="${esc(full)}">${esc(name)}</span><span class="adv ${advCls(row.adv)}">${fmtAdv(row.adv)}</span><span class="pn" title="${esc(punishFull)}">${esc(punish)}</span><span class="route" title="${esc(b.routeLabel)}">${routeShort(b.route)}</span><span class="mg ${advCls(b.margin)}">${fmtAdv(b.margin)}</span><span class="tier">${tierMark(b.tier)}</span>`;
      }
      return `<button type="button" class="murow${kind === "none" ? " none" : ""}" data-id="${esc(row.move.id)}" aria-label="${esc(label)}">${cells}</button>`;
    };
    const head = `<div class="muhead" aria-hidden="true"><span>技</span><span>有利</span><span>反撃</span><span>出し方</span><span>猶予</span><span></span></div>`;
    let body = `<p class="mucap">${esc(cap)}</p>` + (notes.length ? `<p class="munote">${notes.map(esc).join("")}</p>` : "");
    if (g.sure.length) body += head + g.sure.map((r) => rowBtn(r, "sure")).join("");
    else body += `<p class="empty">確定の反撃はありません。</p>`;
    if (g.none.length) body += `<details class="miss"><summary>確定なし ${g.none.length}件</summary>${g.none.map((r) => rowBtn(r, "none")).join("")}</details>`;
    if (g.skipped.length) body += `<details class="miss"><summary>計算対象外 ${g.skipped.length}件</summary>${g.skipped.map((r) => rowBtn(r, "skip")).join("")}</details>`;
    $("matchupBody").innerHTML = body;
  }
  function easeWord(margin) {
    if (margin >= C.THRESHOLDS.easyMin) return "余裕があります";
    if (margin <= C.THRESHOLDS.severeMax) return "入力はシビアです";
    return "間に合います";
  }
  function glanceName(m) {
    if ((m.category === "special" || m.category === "command") && m.group) {
      const extra = [m.strength, m.landingVariant].filter(Boolean).join(" ");
      return m.group + (extra ? "（" + extra + "）" : "");
    }
    return shortName(m);
  }
  function familiarRank(m) {
    const n = glanceName(m);
    if (n === "上強") return 0;
    if (n === "横強") return 1;
    if (n === "下強") return 2;
    if (n === "上スマッシュ") return 3;
    if (n === "横スマッシュ") return 4;
    if (n === "下スマッシュ") return 5;
    if (/^空[前N後上下]/.test(n)) return 6;
    if (n === "上B") return 7;
    if (/^弱/.test(n)) return 8;
    return 30;
  }
  function whoName(idx) {
    const c = D.chars[idx];
    return esc(c.name) + (c.materials.length ? "（" + esc(matOf(idx)) + "）" : "");
  }
  function renderGlance() {
    const el = $("glance");
    if (state.moveId) { el.innerHTML = ""; return; }
    const att = attackerChar(), def = defenderChar();
    const attIdx = D.chars.indexOf(att), defIdx = D.chars.indexOf(def);
    const attWho = state.mode === "A" ? "相手" : "自分";
    const defWho = state.mode === "A" ? "自分" : "相手";
    const opts = Object.assign({ perfectShield: state.ps, defenderMaterial: matOf(defIdx) }, formOpts());
    const rows = [];
    for (const m of visibleMoves()) {
      const r = C.evaluate(att, m, def, opts);
      if (!r.adv.ok) continue;
      const best = r.list.find((x) => x.status === "sure" && x.route !== "drop");
      rows.push({ move: m, adv: r.adv.primaryEff, best: best });
    }
    const can = rows.filter((x) => x.best);
    const cannot = rows.filter((x) => !x.best);
    const tally = new Map();
    for (const row of can) {
      const id = row.best.move.id;
      let t = tally.get(id);
      if (!t) { t = { opt: row.best, n: 0 }; tally.set(id, t); }
      t.n += 1;
    }
    let top = null;
    for (const t of tally.values()) if (!top || t.n > top.n) top = t;
    let say = defWho + "の" + whoName(defIdx) + "が、" + attWho + "の" + whoName(attIdx) + "をガードしたときです。";
    if (top && top.n >= 2) say += esc(glanceName(top.opt.move)) + "なら、" + top.n + "個の技に間に合います。";
    else if (can.length) say += "シールドを解かずに返せる技が" + can.length + "個あります。";
    else say += "シールドを解かずに間に合う反撃はありません。下の技を開くと、理由が分かります。";
    if (state.ps) say += "ジャストシールドした場合です。";
    const form = formOpts();
    if (form.arsene) say += "アルセーヌありで見ています。";
    if (form.crit) say += "会心の一撃ありで見ています。";
    if (form.ink) say += "インク切れで見ています。";
    const buckets = GROUPS.map(() => []);
    for (const row of can) buckets[groupOf(row.move)].push(row);
    for (const b of buckets) b.sort((a, c) => familiarRank(a.move) - familiarRank(c.move) || c.adv - a.adv);
    const picked = [];
    const seen = new Set();
    for (let guard = 0; picked.length < 4 && guard < 8; guard++) {
      let added = false;
      for (const b of buckets) {
        while (b.length && (seen.has(glanceName(b[0].move)) || b[0].move.landingVariant)) b.shift();
        if (!b.length) continue;
        const row = b.shift();
        seen.add(glanceName(row.move));
        picked.push(row);
        added = true;
        if (picked.length >= 4) break;
      }
      if (!added) break;
    }
    const familiar = cannot.filter((row) => groupOf(row.move) <= 2);
    const missPool = (familiar.length ? familiar : cannot).slice().sort((a, b) => b.adv - a.adv);
    const miss = missPool[0];
    const line = (row, nope) => {
      const name = esc(glanceName(row.move));
      if (nope) return `<button type="button" class="ex nope" data-id="${esc(row.move.id)}">${attWho}の${name}をガード → シールドを解かずに返すのは間に合いません。</button>`;
      return `<button type="button" class="ex" data-id="${esc(row.move.id)}">${attWho}の${name}をガード → ${esc(glanceName(row.best.move))}で返せる。${easeWord(row.best.margin)}</button>`;
    };
    el.innerHTML = `<p class="say">${say}</p>` + picked.map((row) => line(row, false)).join("") + (miss ? line(miss, true) : "");
  }

  function fmtAdv(v) { return v > 0 ? `+${v}` : `${v}`; }
  function fmtAdvSpan(harsh, loose) {
    if (loose == null || loose === harsh) return fmtAdv(harsh);
    const lo = Math.min(harsh, loose), hi = Math.max(harsh, loose);
    return fmtAdv(lo) + "〜" + fmtAdv(hi);
  }
  function fmtM(v) { return `${v >= 0 ? "+" : ""}${v}F`; }
  function dmgText(n) {
    const v = C.scaleDamage(n, state.oo);
    return String(Math.round(v * 100) / 100);
  }
  /** 着地隙に条件名があるとき、条件名と有利 */
  function landingBreakdown(a) {
    const cs = a.landingCases;
    if (!cs || !cs.length) return "";
    const bonus = state.ps ? C.PERFECT_SHIELD_BONUS : 0;
    return cs.map((c) => `<li>${esc(c.name)}　着地隙 ${c.lag}F　ガード有利 ${fmtAdv(c.adv + bonus)}F</li>`).join("");
  }
  /** 同じ段で有利が変わるときだけ、判定ごとの内訳。1判定・個数不一致・有利が同じときは空 */
  function hitboxBreakdown(a) {
    const hs = a.hitboxes;
    if (!hs || hs.length < 2) return "";
    let lo = hs[0].adv, hi = hs[0].adv;
    for (let i = 1; i < hs.length; i++) { if (hs[i].adv < lo) lo = hs[i].adv; if (hs[i].adv > hi) hi = hs[i].adv; }
    if (lo === hi) return "";
    const bonus = state.ps ? C.PERFECT_SHIELD_BONUS : 0;
    return hs.map((h) => `<li>${esc(h.name)}　ダメージ ${esc(dmgText(h.damage))}　ガード硬直 ${h.stun}F　ガード有利 ${fmtAdv(h.adv + bonus)}F</li>`).join("");
  }

  function renderResult() {
    const att = attackerChar(), def = defenderChar();
    const move = att.moves.find((m) => m.id === state.moveId);
    if (!move) { $("result").innerHTML = ""; $("sheetBody").innerHTML = ""; return; }
    const defIdx = D.chars.indexOf(def);
    const r = C.evaluate(att, move, def, Object.assign({ perfectShield: state.ps, defenderMaterial: matOf(defIdx) }, formOpts()));
    const a = r.adv;
    const attWho = state.mode === "A" ? "相手" : "自分", defWho = state.mode === "A" ? "自分" : "相手";
    const name = `${esc(shortName(move))}${move.input === "button" ? "［ボタン］" : move.input === "command" && move.category !== "command" ? "［コマンド］" : ""}`;
    let h = `<button type="button" class="backlist" data-act="back">例の一覧に戻る</button><div class="sum"><div class="t">${attWho}の ${esc(att.name)}「${name}」${move.material ? "【" + esc(move.material) + "】" : ""}を${defWho}（${esc(def.name)}）がガード${state.ps ? "（ジャストシールド）" : ""}</div>`;
    if (move.command) h += `<div class="cmd">入力: ${esc(move.command)}${move.commandDerived ? "（シート備考から作成）" : ""}</div>`;
    const hits = C.formatHitboxes(move, state.oo, formOpts());
    if (hits.text) h += `<div class="cmd">ダメージ ${esc(hits.text)}${state.oo ? "（1on1・基礎×1.2）" : ""}</div>`;
    const hitList = hits.items.map((it) => {
      const stunTxt = it.stunSpan ? it.stunSpan[0] + "〜" + it.stunSpan[1] + "F" : it.stuns ? it.stuns.map((s) => s + "F").join(" / ") : "—";
      const base = state.oo ? `（基礎 ${it.base.map((n) => String(Math.round(n * 100) / 100)).join(" / ")}）` : "";
      return `<li>${esc(it.text)}${base}　ガード硬直 ${stunTxt}</li>`;
    }).join("");
    if (!a.ok) {
      h += `<div class="big neg" style="font-size:28px">対象外</div><div class="late">${esc(a.reason)}</div></div>`;
      $("result").innerHTML = h;
      $("sheetBody").innerHTML = `<p>${esc(a.reason)}</p>` +
        (hitList ? `<ul class="hits">${hitList}</ul>` : "") +
        `<p>有利と確定の数値は作りません。ページ下部の出典と、計算の前提を見てください。</p>`;
      return;
    }
    const cls = a.primaryEff > 0 ? "pos" : a.primaryEff < 0 ? "neg" : "zero";
    const advText = fmtAdvSpan(a.primaryEff, a.looseEff);
    const wide = a.looseEff != null && a.looseEff !== a.primaryEff;
    h += `<div class="big ${cls}${wide ? " wide" : ""}">${advText}<span>F</span></div>`;
    if (wide) h += `<div class="late">溜め・状況によって ${advText}F。表示の色と確定は、いちばんきびしい側です。</div>`;
    const landBoxes = landingBreakdown(a);
    if (landBoxes) {
      const bonus = state.ps ? C.PERFECT_SHIELD_BONUS : 0;
      const advs = a.landingCases.map((c) => c.adv + bonus);
      const lo = Math.min.apply(null, advs), hi = Math.max.apply(null, advs);
      const span = a.landingCases.length < 2
        ? `着地の条件は「${esc(a.landingName || a.landingCases[0].name)}」です。表示と確定はこの着地です。`
        : lo === hi
        ? `着地の条件は${a.landingCases.length}つで、有利は同じです。表示と確定はこの値です。`
        : `着地の条件によって ${fmtAdv(lo)}〜${fmtAdv(hi)}F。表示と確定はいちばんきびしい着地です。`;
      h += `<div class="late">${span}</div><ul class="hbox">${landBoxes}</ul>`;
    }
    const boxes = hitboxBreakdown(a);
    if (boxes) {
      const bonus = state.ps ? C.PERFECT_SHIELD_BONUS : 0;
      const hs = a.hitboxes;
      let lo = hs[0].adv, hi = hs[0].adv;
      for (let i = 1; i < hs.length; i++) { if (hs[i].adv < lo) lo = hs[i].adv; if (hs[i].adv > hi) hi = hs[i].adv; }
      h += `<div class="late">判定によって ${fmtAdv(lo + bonus)}〜${fmtAdv(hi + bonus)}F。表示と確定はいちばんきびしい判定です。</div><ul class="hbox">${boxes}</ul>`;
    }
    h += `<div class="late">${a.lateUnknown ? "終わり際はシート上で不定" : a.worstEff === a.primaryEff ? "終わり際をガードしても同じ" : `終わり際をガードすると ${fmtAdv(a.worstEff)}F`}</div>`;
    if (a.bounceLag != null && a.landingLag != null && a.bounceLag !== a.landingLag) h += `<div class="note">ヒット時はバウンドの全体${a.bounceLag}Fから硬直を引いています。空振りの着地隙は${a.landingLag}Fです。</div>`;
    const altLine = (a.alt || []).filter((x) => x.adv != null && /アルセーヌ|会心の一撃|インク切れ|（後）/.test(x.label));
    if (a.usedArsene) h += `<div class="note">アルセーヌの段のガード硬直と全体Fで計算しています。</div>`;
    if (a.usedCrit) h += `<div class="note">会心の一撃の行のガード硬直とダメージで計算しています。</div>`;
    if (a.usedInk) h += `<div class="note">インク切れの行のガード硬直とダメージで計算しています。</div>`;
    if (altLine.length) h += `<div class="note">${altLine.map((x) => `${esc(x.label)}は ${fmtAdv(x.adv + (state.ps ? C.PERFECT_SHIELD_BONUS : 0))}F`).join("、")}（確定の数には入れていません）</div>`;
    if (move.guardNote) h += `<div class="note">${esc(move.guardNote)}</div>`;
    h += `</div>`;
    const sure = r.list.filter((x) => x.status === "sure"), no = r.list.filter((x) => x.status === "impossible");
    const T = C.THRESHOLDS;
    h += `<div class="legend"><span class="b sure">確定</span> 密着なら間に合う　<span class="b impossible">不可</span> フレーム不足　<span class="t2 severe">シビア</span> 0〜${T.severeMax}F　<span class="t2 easy">余裕</span> ${T.easyMin}F以上</div>`;
    const item = (x) => {
      const lbl = x.status === "sure" ? "確定" : "不可";
      const mcls = x.margin > 0 ? "pos" : x.margin === 0 ? "zero" : "neg";
      const routeTxt = x.cost ? `${x.routeLabel}（+${x.cost}F）` : x.routeLabel;
      const tier = x.tier === "severe" ? `<span class="t2 severe" title="猶予${T.severeMax}F以下。最速入力が必要">シビア</span>` : x.tier === "easy" ? `<span class="t2 easy" title="猶予${T.easyMin}F以上">余裕</span>` : "";
      const late = !a.lateUnknown && x.marginWorst !== x.margin ? `<div class="row3">終わり際の猶予 ${fmtM(x.marginWorst)}</div>` : "";
      const weak = x.weakNote ? `<div class="row3">${esc(x.weakNote)}</div>` : "";
      const span = x.spanNote ? `<div class="row3">${esc(x.spanNote)}</div>` : "";
      return `<li class="${x.status}"><div class="row1"><span class="b ${x.status}">${lbl}</span><span class="n">${esc(shortName(x.move))}${x.move.material ? `【${esc(x.move.material)}】` : ""}</span>${tier}<span class="m ${mcls}">${fmtM(x.margin)}</span></div>` +
        `<div class="row2">${esc(routeTxt)} ／ 発生${x.startup}F → 必要${x.need}F</div>${span}${weak}${late}` +
        (x.move.input === "button" ? `<div class="cmd">ボタン入力</div>` : x.move.command ? `<div class="cmd">${x.move.input === "command" ? "コマンド入力" : "入力"}: ${esc(x.move.command)}</div>` : "") +
        `</li>`;
    };
    const buckets = [["oos", "上B・上スマッシュ"], ["jump", "空中"], ["grab", "つかみ"]];
    h += `<h2 class="block">ガードキャンセル <small>シールドを解かずに出す</small></h2>`;
    let any = false;
    for (const [route, label] of buckets) {
      const list = sure.filter((x) => x.route === route);
      if (!list.length) continue;
      any = true;
      h += `<h3 class="block">${label}</h3><ul class="list">${list.map(item).join("")}</ul>`;
    }
    if (!any) h += `<p class="empty">ガーキャンで間に合う反撃はありません。</p>`;
    const drops = sure.filter((x) => x.route === "drop");
    if (drops.length) h += `<details class="drop"><summary>シールド解除から ${drops.length}件（+11F）</summary><ul class="list">${drops.map(item).join("")}</ul></details>`;
    if (no.length) h += `<details><summary>不可 ${no.length}件</summary><ul class="list">${no.map(item).join("")}</ul></details>`;
    $("result").innerHTML = h;
    const airTxt = move.landingVariant
      ? (a.landingCases && a.landingCases.length >= 2
        ? `空中必殺の着地。備考の着地隙は条件で違います。表示の ${fmtAdv(a.primaryEff)}F は、いちばんきびしい着地（${esc(a.landingName)}、着地隙${a.landingLag}F）からガード硬直を引いた値です。着地までの時間は含みません。`
        : a.landingCases && a.landingCases.length === 1
        ? `空中必殺の着地。備考の着地隙は「${esc(a.landingCases[0].name)}」の ${a.landingLag}F です。表示の ${fmtAdv(a.primaryEff)}F は、その着地隙からガード硬直を引いた値です。着地までの時間は含みません。`
        : `空中必殺の着地。着地隙${a.landingLag}Fからガード硬直を引いた値で、着地直前に当てた場合の最小です。空中にいる時間は含みません。`)
      : `空中攻撃。着地隙${a.landingLag}Fからガード硬直を引いた値で、着地直前に当てた場合の最小です。`;
    $("sheetTitle").textContent = shortName(move);
    const spanTxt = wide
      ? `<p>シートの値が幅で書かれています。有利は ${advText}F で、確定・色・猶予はいちばんきびしい側（${fmtAdv(a.primaryEff)}F）です。両端で確定が変わる反撃には「溜め・状況しだい」と付けています。</p>`
      : "";
    $("sheetBody").innerHTML = `<p>${a.aerial ? airTxt : `地上の技。最速の判定${a.multiHit ? "（多段の最終段）" : ""}をガードした場合の有利は ${wide ? advText + "F" : fmtAdv(a.primaryEff) + "F"}。`}</p>` +
      spanTxt +
      `<p>${state.oo ? "ダメージはシートの基礎ダメージ×1.2（1on1補正）です。ガード硬直はシートの値のままなので、有利と確定は変わりません。" : "ダメージはシートの基礎ダメージです。1on1補正は掛けていません。"}</p>` +
      (a.bounceLag != null && a.landingLag != null && a.bounceLag !== a.landingLag ? `<p>この技はヒットするとバウンドします。シートのバウンド行の全体Fは${a.bounceLag}Fなので、有利は ${a.bounceLag}F − ガード硬直です。空振りの着地隙${a.landingLag}Fは使っていません。</p>` : "") +
      (a.usedArsene ? `<p>アルセーヌの段のガード硬直と全体Fで有利と確定を出しています。アルセーヌの段が無い技は、この切り替えでも通常の値のままです。</p>` : "") +
      (a.usedCrit ? `<p>会心の一撃の行に書いてあるガード硬直とダメージで有利と確定を出しています。その行が無い技は、この切り替えでも通常の値のままです。</p>` : "") +
      (a.usedInk ? `<p>インク切れの行に書いてあるガード硬直とダメージで有利と確定を出しています。その行が無い技は、この切り替えでも通常の値のままです。</p>` : "") +
      (altLine.length ? `<p>${altLine.map((x) => `${esc(x.label)}をガードした有利は ${fmtAdv(x.adv)}F`).join("。")}。${a.usedArsene ? "この段は確定の数に入れていません。" : "確定の数は通常の段だけです。"}</p>` : "") +
      (hitList ? `<ul class="hits">${hitList}</ul>` : `<p>基礎ダメージはシートにありません。</p>`) +
      (landBoxes ? (a.landingCases.length >= 2
        ? `<p>着地隙は条件ごとに違います。下は、それぞれからガード硬直を引いた有利です。確定と不可は、いちばんきびしい着地（${fmtAdv(a.primaryEff)}F）で分けています。</p>`
        : `<p>備考に着地隙が書いてある条件のうち、ガード硬直と対応するのは「${esc(a.landingCases[0].name)}」です。有利は、その着地隙からガード硬直を引いた値です。</p>`) + `<ul class="hbox">${landBoxes}</ul>` : "") +
      (boxes ? `<p>この段は判定ごとにガード硬直が違います。下は、それぞれをガードしたときの有利です。確定と不可は、ガード硬直が大きい方（${fmtAdv(a.primaryEff)}F）で分けています。</p><ul class="hbox">${boxes}</ul>` : "") +
      `<p>${a.lateUnknown ? "判定の終わりがシート上で不定なので、終わり際の数字は出していません。" : `判定の終わり際をガードした場合の有利は ${fmtAdv(a.worstEff)}F。カードの2行目は、そのときの猶予です。`}</p>` +
      `<p>密着が前提です。リーチと、ガードで押される距離は見ていません。コマンド入力の時間も含めていません。</p>` +
      (move.guardNote ? `<p>${esc(move.guardNote)}</p>` : "");
  }

  function openSheet() {
    if (!$("sheetBody").textContent) return;
    $("picker").hidden = true;
    $("sheet").hidden = false;
    document.body.classList.add("noscroll");
    pushOverlay("sheet");
    $("sheetClose").focus();
  }

  if (window.__DATA__) init(window.__DATA__);
  else fetch("data.json").then((r) => r.json()).then(init);
})();
