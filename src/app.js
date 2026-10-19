/* 画面ロジック。データは window.__DATA__（dist の単体HTML）か data.json を読む */
(function () {
  "use strict";
  const C = window.PunishCalc;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const state = { me: 0, opp: 1, mode: "A", moveId: null, ps: false, oo: false, mat: {}, group: 0 };
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
    p.set("oo", state.oo ? "1" : "0");
    const meC = D.chars[state.me], oppC = D.chars[state.opp];
    if (meC.materials.length) p.set("mm", matOf(state.me));
    if (oppC.materials.length) p.set("mo", matOf(state.opp));
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
    $("swap").onclick = swap;
    initPicker();
    $("modeA").onclick = () => setMode("A");
    $("modeB").onclick = () => setMode("B");
    $("ps").onchange = (e) => setPs(e.target.checked);
    $("psDock").onchange = (e) => setPs(e.target.checked);
    $("oo").onclick = (e) => { const b = e.target.closest("[data-oo]"); if (b) setOo(b.dataset.oo === "1"); };
    $("ooDock").onclick = (e) => { const b = e.target.closest("[data-oo]"); if (b) setOo(b.dataset.oo === "1"); };
    $("flip").onclick = () => setMode(state.mode === "A" ? "B" : "A");
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
  function setGroup(i) {
    if (!GROUPS[i] || state.group === i) return;
    state.group = i;
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
  function tile(i, recentChip) {
    const c = D.chars[i], cur = state[pickFor] === i;
    return `<button type="button" class="ch${cur ? " on" : ""}" data-i="${i}"><span class="no">${esc(charNo(c))}</span>${esc(recentChip ? c.name : c.name)}${c.stale ? `<span class="st" title="データが古い可能性">⚠</span>` : ""}</button>`;
  }
  function renderPicker() {
    const raw = $("pkQ").value.trim();
    const qv = norm(raw);
    const all = D.chars.map((c, i) => i);
    const hit = qv ? all.filter((i) => { const c = D.chars[i]; return haystack(c).includes(qv) || charNo(c).replace("'", "") === qv; }) : all;
    let h = "";
    if (!qv) {
      const r = recent();
      if (r.length) h += `<h3>最近使ったキャラ</h3><div class="recents">${r.map((i) => tile(i, true)).join("")}</div>`;
      h += `<h3>全キャラ（${D.chars.length}）</h3>`;
    }
    h += hit.length ? `<div class="grid">${hit.map((i) => tile(i)).join("")}</div>` : `<p class="empty">「${esc(raw)}」に一致するキャラはいません。読み・英語名・ファイター番号でも探せます。</p>`;
    h += `<p class="pkNote">⚠ はシートの最終更新が最後の調整より前です。</p>`;
    $("pkBody").innerHTML = h;
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
    document.querySelectorAll('a[href^="table.html"]').forEach((a) => { a.hash = "oo=" + (state.oo ? "1" : "0"); });
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
      $(id).innerHTML = `<span class="who ${k}">${who}</span><span class="nm">${esc(c.name)}</span>${c.stale ? `<span class="st" title="データが古い可能性">⚠</span>` : ""}<span class="dd">▾</span>`;
      $(id).setAttribute("aria-label", who + " " + c.name);
    }
    renderMats();
    const warn = [state.me, state.opp].filter((v, i, a) => a.indexOf(v) === i).map((i) => D.chars[i]).filter((c) => c.stale)
      .map((c) => `⚠ ${esc(c.name)}: ${esc(c.stale)}。数値はシート掲載時点のものです。`);
    $("banner").innerHTML = warn.map((w) => `<div class="banner">${w}</div>`).join("");
    const moves = visibleMoves();
    const counts = GROUPS.map((g) => moves.filter(g[2]).length);
    if (!counts[state.group]) { const i = counts.findIndex((n) => n); if (i >= 0) state.group = i; }
    $("groups").innerHTML = GROUPS.map((g, i) => counts[i] ? `<button type="button" role="tab" data-g="${i}" aria-selected="${i === state.group ? "true" : "false"}" aria-label="${esc(g[1])}">${esc(g[0])}</button>` : "").join("");
    $("groups").querySelectorAll("button").forEach((b) => (b.onclick = () => setGroup(+b.dataset.g)));
    const shown = moves.filter(GROUPS[state.group][2]);
    const who = state.mode === "A" ? "相手" : "自分";
    const att = attackerChar();
    $("lead").textContent = state.moveId ? "" : `${who}（${att.name}）の技を選ぶと、反撃が下に出ます。`;
    $("moveArea").innerHTML = shown.length ? `<div class="moves">` + shown.map((m) => {
      const a = C.shieldAdvantage(m);
      const sub = [m.input === "button" ? "ボタン" : m.input === "command" ? (m.command ? "コマンド " + m.command : "コマンド") : m.command || "", m.material || ""].filter(Boolean).join("・");
      return `<button type="button" class="mv ${m.id === state.moveId ? "on" : ""} ${a.ok ? "" : "na"}" data-id="${m.id}">${esc(shortName(m))}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;
    }).join("") + `</div>` : `<p class="empty">この種類の技はありません。</p>`;
    $("moveArea").querySelectorAll(".mv").forEach((b) => (b.onclick = () => {
      state.moveId = b.dataset.id;
      pushNext = true;
      scrollToResult = true;
      render();
    }));
    renderResult();
    writeHash();
    if (scrollToResult && state.moveId) {
      scrollToResult = false;
      const y = $("result").getBoundingClientRect().top + window.scrollY - $("top").offsetHeight - $("groups").offsetHeight - 8;
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top: Math.max(0, y), behavior });
    }
  }

  function fmtAdv(v) { return v > 0 ? `+${v}` : `${v}`; }
  function fmtM(v) { return `${v >= 0 ? "+" : ""}${v}F`; }

  function renderResult() {
    const att = attackerChar(), def = defenderChar();
    const move = att.moves.find((m) => m.id === state.moveId);
    if (!move) { $("result").innerHTML = ""; $("sheetBody").innerHTML = ""; return; }
    const defIdx = D.chars.indexOf(def);
    const r = C.evaluate(att, move, def, { perfectShield: state.ps, defenderMaterial: matOf(defIdx) });
    const a = r.adv;
    const attWho = state.mode === "A" ? "相手" : "自分", defWho = state.mode === "A" ? "自分" : "相手";
    const name = `${esc(shortName(move))}${move.input === "button" ? "［ボタン］" : move.input === "command" && move.category !== "command" ? "［コマンド］" : ""}`;
    let h = `<div class="sum"><div class="t">${attWho}の ${esc(att.name)}「${name}」${move.material ? "【" + esc(move.material) + "】" : ""}を${defWho}（${esc(def.name)}）がガード${state.ps ? "（ジャストシールド）" : ""}</div>`;
    if (move.command) h += `<div class="cmd">入力: ${esc(move.command)}${move.commandDerived ? "（シート備考から作成）" : ""}</div>`;
    const hits = C.formatHitboxes(move, state.oo);
    if (hits.text) h += `<div class="cmd">ダメージ ${esc(hits.text)}${state.oo ? "（1on1・基礎×1.2）" : ""}</div>`;
    const hitList = hits.items.map((it) => {
      const stunTxt = it.stuns ? it.stuns.map((s) => s + "F").join(" / ") : "—";
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
    h += `<div class="big ${cls}">${fmtAdv(a.primaryEff)}<span>F</span></div>`;
    h += `<div class="late">${a.lateUnknown ? "終わり際はシート上で不定" : a.worstEff === a.primaryEff ? "終わり際をガードしても同じ" : `終わり際をガードすると ${fmtAdv(a.worstEff)}F`}</div>`;
    if (a.bounceLag != null && a.landingLag != null && a.bounceLag !== a.landingLag) h += `<div class="note">ヒット時はバウンドの全体${a.bounceLag}Fから硬直を引いています。空振りの着地隙は${a.landingLag}Fです。</div>`;
    const altLine = (a.alt || []).filter((x) => x.adv != null && /アルセーヌ|（後）/.test(x.label));
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
      return `<li class="${x.status}"><div class="row1"><span class="b ${x.status}">${lbl}</span><span class="n">${esc(shortName(x.move))}${x.move.material ? `【${esc(x.move.material)}】` : ""}</span>${tier}<span class="m ${mcls}">${fmtM(x.margin)}</span></div>` +
        `<div class="row2">${esc(routeTxt)} ／ 発生${x.startup}F → 必要${x.need}F</div>${late}` +
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
      ? `空中必殺の着地。着地隙${a.landingLag}Fからガード硬直を引いた値で、着地直前に当てた場合の最小です。空中にいる時間は含みません。`
      : `空中攻撃。着地隙${a.landingLag}Fからガード硬直を引いた値で、着地直前に当てた場合の最小です。`;
    $("sheetTitle").textContent = shortName(move);
    $("sheetBody").innerHTML = `<p>${a.aerial ? airTxt : `地上の技。最速の判定${a.multiHit ? "（多段の最終段）" : ""}をガードした場合の有利は ${fmtAdv(a.primaryEff)}F。`}</p>` +
      `<p>${state.oo ? "ダメージはシートの基礎ダメージ×1.2（1on1補正）です。ガード硬直はシートの値のままなので、有利と確定は変わりません。" : "ダメージはシートの基礎ダメージです。1on1補正は掛けていません。"}</p>` +
      (a.bounceLag != null && a.landingLag != null && a.bounceLag !== a.landingLag ? `<p>この技はヒットするとバウンドします。シートのバウンド行の全体Fは${a.bounceLag}Fなので、有利は ${a.bounceLag}F − ガード硬直です。空振りの着地隙${a.landingLag}Fは使っていません。</p>` : "") +
      (altLine.length ? `<p>${altLine.map((x) => `${esc(x.label)}をガードした有利は ${fmtAdv(x.adv)}F`).join("。")}。確定の数は通常の段だけです。</p>` : "") +
      (hitList ? `<ul class="hits">${hitList}</ul>` : `<p>基礎ダメージはシートにありません。</p>`) +
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
