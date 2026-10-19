/* 画面ロジック。データは window.__DATA__（dist の単体HTML）か data.json を読む */
(function () {
  "use strict";
  const C = window.PunishCalc;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const state = { me: 0, opp: 1, mode: "A", moveId: null, ps: false, mat: {} };
  let D;

  const GROUPS = [
    ["弱・強攻撃・ダッシュ攻撃", (m) => m.category === "ground" && !/スマッシュ/.test(m.name) && m.input !== "command"],
    ["スマッシュ攻撃", (m) => m.category === "ground" && /スマッシュ/.test(m.name)],
    ["空中攻撃", (m) => m.category === "aerial"],
    ["必殺ワザ", (m) => m.category === "special" && m.input !== "command"],
    ["コマンド技", (m) => m.category === "command" || m.input === "command"],
  ];
  const hasHit = (m) => m.rows.some((r) => r.active && (r.damage == null || Math.max.apply(null, r.damage) > 0));
  // 表示名: 必殺ワザは「上B 昇竜拳（強）」のように技名を添える。ボタン/コマンドは別表示
  const shortName = (m) => {
    if (m.category === "special") {
      const v = m.variant || "";
      const base = v && !/^(地上|空中|地上・空中|通常|地上\s*\(空中\))$/.test(v) ? v : (m.title || "");
      const place = /^(地上|空中)$/.test(v) ? `・${v}` : "";
      return `${m.group}${base ? " " + base : ""}${place}${m.strength ? `（${m.strength}）` : ""}${m.landingVariant ? " " + m.landingVariant : ""}`;
    }
    return m.name.replace(/［(ボタン|コマンド)］$/, "");
  };

  function attackerChar() { return D.chars[state.mode === "A" ? state.opp : state.me]; }
  function defenderChar() { return D.chars[state.mode === "A" ? state.me : state.opp]; }
  function matOf(idx) { const c = D.chars[idx]; return c.materials.length ? (state.mat[idx] || c.materials[1] || c.materials[0]) : null; }

  let scrollToResult = false;
  function clampIdx(v, d) { return Number.isInteger(v) && v >= 0 && v < D.chars.length ? v : d; }
  function applyHash() {
    const q = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (q.has("me")) state.me = clampIdx(+q.get("me"), state.me);
    if (q.has("opp")) state.opp = clampIdx(+q.get("opp"), state.opp);
    state.mode = q.get("mode") === "B" ? "B" : "A";
    state.ps = q.get("ps") === "1";
    for (const [idx, key] of [[state.me, "mm"], [state.opp, "mo"]]) {
      const c = D.chars[idx];
      const v = q.get(key);
      if (c && c.materials.length && v && c.materials.includes(v)) state.mat[idx] = v;
    }
    const mv = q.get("move");
    const att = attackerChar();
    state.moveId = mv && att.moves.some((m) => m.id === mv) ? mv : null;
    scrollToResult = !!state.moveId;
  }
  function writeHash() {
    const p = new URLSearchParams();
    p.set("me", String(state.me));
    p.set("opp", String(state.opp));
    p.set("mode", state.mode);
    if (state.moveId) p.set("move", state.moveId);
    if (state.ps) p.set("ps", "1");
    const meC = D.chars[state.me], oppC = D.chars[state.opp];
    if (meC.materials.length) p.set("mm", matOf(state.me));
    if (oppC.materials.length) p.set("mo", matOf(state.opp));
    const next = "#" + p.toString();
    if (location.hash !== next) history.replaceState(null, "", next);
  }
  function init(data) {
    D = data;
    applyHash();
    $("meBtn").onclick = () => openPicker("me"); $("oppBtn").onclick = () => openPicker("opp");
    $("swap").onclick = () => { [state.me, state.opp] = [state.opp, state.me]; state.moveId = null; render(); };
    initPicker();
    $("modeA").onclick = () => setMode("A"); $("modeB").onclick = () => setMode("B");
    $("ps").onchange = (e) => { state.ps = e.target.checked; writeHash(); renderResult(); };
    window.addEventListener("hashchange", () => { applyHash(); render(); });
    $("builtAt").textContent = `データ取得: ${(D.meta.fetchedAt || "").slice(0, 10)} ／ 計算: スマブラSPECIAL 検証wiki の式`;
    render();
  }
  // ---- キャラ選択（検索＋グリッド）----
  const toKata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const norm = (s) => toKata(String(s).normalize("NFKC").toLowerCase()).replace(/[\s・&＆.．ー\-'’／/]/g, "");
  const charNo = (c) => (c.sheetTab.match(/^(\d+'?)/) || [])[1] || "";
  // 検索用の別名（通称・読み）。表示名は変えない
  const ALIAS = { "Mii": "ミイ ミー mii", "ドンキーコング": "dk", "Mr.ゲーム&ウォッチ": "ゲムヲ ゲーム&ウォッチ", "Wii Fit トレーナー": "ウィーフィット wiifit",
    "キャプテン・ファルコン": "cf", "ピクミン&オリマー": "オリマー", "ロゼッタ&チコ": "ロゼチコ", "バンジョー&カズーイ": "バンカズ",
    "ゼロスーツサムス": "ゼロサム", "パックンフラワー": "パックン", "トゥーンリンク": "トゥーン", "こどもリンク": "こどリン", "ガノンドロフ": "ガノン" };
  const haystack = (c) => norm(c.name + " " + c.sheetTab + " " + Object.keys(ALIAS).filter((k) => c.name.includes(k)).map((k) => ALIAS[k]).join(" "));
  let pickFor = null;
  const RECENT_KEY = "punish.recent";
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((i) => D.chars[i]); } catch (e) { return []; } };
  function initPicker() {
    $("pkClose").onclick = closePicker;
    $("pkQ").oninput = renderPicker;
    $("pkQ").onkeydown = (e) => { if (e.key === "Enter") { const b = $("pkBody").querySelector(".ch"); if (b) b.click(); } else if (e.key === "Escape") closePicker(); };
    $("pkBody").onclick = (e) => {
      const b = e.target.closest(".ch"); if (!b) return;
      const i = +b.dataset.i; state[pickFor] = i; state.moveId = null;
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([i].concat(recent().filter((x) => x !== i)).slice(0, 8))); } catch (err) {}
      closePicker(); render();
    };
  }
  function openPicker(who) {
    pickFor = who;
    $("pkTitle").textContent = who === "me" ? "自分のキャラを選ぶ" : "相手のキャラを選ぶ";
    $("pkTitle").className = who;
    $("pkQ").value = ""; $("picker").hidden = false; document.body.classList.add("noscroll");
    renderPicker();
    setTimeout(() => $("pkQ").focus(), 30);
  }
  function closePicker() { $("picker").hidden = true; document.body.classList.remove("noscroll"); }
  function tile(i) {
    const c = D.chars[i], cur = state[pickFor] === i;
    return `<button class="ch${cur ? " on" : ""}${c.stale ? " stale" : ""}" data-i="${i}"><span class="no">${esc(charNo(c))}</span>${esc(c.name)}${c.stale ? `<span class="st" title="データが古い可能性">⚠</span>` : ""}</button>`;
  }
  function renderPicker() {
    const qv = norm($("pkQ").value.trim());
    const all = D.chars.map((c, i) => i);
    const hit = qv ? all.filter((i) => { const c = D.chars[i]; return haystack(c).includes(qv) || charNo(c).replace("'", "") === qv; }) : all;
    let h = "";
    if (!qv) { const r = recent(); if (r.length) h += `<h3>最近</h3><div class="grid">${r.map(tile).join("")}</div><h3>全キャラ（${D.chars.length}）</h3>`; }
    h += hit.length ? `<div class="grid">${hit.map(tile).join("")}</div>` : `<p class="empty">「${esc($("pkQ").value)}」に一致するキャラがいません</p>`;
    h += `<p class="pkNote">⚠ = シートの最終更新が最後の調整より前（データが古い可能性）</p>`;
    $("pkBody").innerHTML = h;
  }
  function setMode(m) {
    state.mode = m; state.moveId = null;
    $("modeA").classList.toggle("on", m === "A"); $("modeB").classList.toggle("on", m === "B");
    render();
  }

  function renderMats() {
    let h = "";
    for (const [idx, who] of [[state.me, "自分"], [state.opp, "相手"]]) {
      const c = D.chars[idx];
      if (!c.materials.length) continue;
      const cur = matOf(idx);
      h += `<div class="mats"><span>${who}の${esc(c.name)} 素材:</span>` +
        c.materials.map((x) => `<button class="chip ${x === cur ? "on" : ""}" data-idx="${idx}" data-mat="${esc(x)}">${esc(x)}</button>`).join("") + "</div>";
    }
    $("mats").innerHTML = h;
    $("mats").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.mat[+b.dataset.idx] = b.dataset.mat; state.moveId = null; render(); }));
  }

  function render() {
    $("modeA").classList.toggle("on", state.mode === "A");
    $("modeB").classList.toggle("on", state.mode === "B");
    $("ps").checked = state.ps;
    for (const [k, id] of [["me", "meBtn"], ["opp", "oppBtn"]]) {
      const c = D.chars[state[k]];
      $(id).innerHTML = `<span class="nm">${esc(c.name)}</span>${c.stale ? `<span class="st" title="データが古い可能性">⚠</span>` : ""}<span class="dd">▾</span>`;
    }
    renderMats();
    const warn = [state.me, state.opp].filter((v, i, a) => a.indexOf(v) === i).map((i) => D.chars[i]).filter((c) => c.stale)
      .map((c) => `⚠ ${esc(c.name)}: ${esc(c.stale)}。数値はシート掲載時点のものです。`);
    $("banner").innerHTML = warn.map((w) => `<div class="banner">${w}</div>`).join("");
    const att = attackerChar();
    const attIdx = D.chars.indexOf(att);
    const mat = matOf(attIdx);
    const moves = att.moves.filter((m) => m.category !== "grab" && hasHit(m) && (!mat || !m.material || m.material === mat));
    const who = state.mode === "A" ? "相手" : "自分";
    let h = `<div class="hint" style="padding:2px 2px 8px">${who}（${esc(att.name)}）の技をタップ → ${state.mode === "A" ? "自分" : "相手"}の反撃が並びます</div>`;
    for (const [title, f] of GROUPS) {
      const list = moves.filter(f);
      if (!list.length) continue;
      h += `<div class="sec"><h2>${title}</h2><div class="moves">` + list.map((m) => {
        const a = C.shieldAdvantage(m);
        const sub = [m.input === "button" ? "ボタン" : m.input === "command" ? (m.command ? "コマンド " + m.command : "コマンド") : m.command || "", m.material || ""].filter(Boolean).join("・");
        return `<button class="mv ${m.id === state.moveId ? "on" : ""} ${a.ok ? "" : "na"}" data-id="${m.id}">${esc(shortName(m))}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;
      }).join("") + "</div></div>";
    }
    $("moveArea").innerHTML = h;
    $("moveArea").querySelectorAll(".mv").forEach((b) => (b.onclick = () => { state.moveId = b.dataset.id; render(); setTimeout(() => { const y = $("result").getBoundingClientRect().top + window.scrollY - document.querySelector("header").offsetHeight - 6; window.scrollTo({ top: y, behavior: "smooth" }); }, 0); }));
    renderResult();
    writeHash();
    if (scrollToResult && state.moveId) {
      scrollToResult = false;
      setTimeout(() => {
        const y = $("result").getBoundingClientRect().top + window.scrollY - document.querySelector("header").offsetHeight - 6;
        window.scrollTo({ top: y, behavior: "smooth" });
      }, 0);
    }
  }

  function fmtAdv(v) { return v > 0 ? `+${v}F` : `${v}F`; }

  function renderResult() {
    const att = attackerChar(), def = defenderChar();
    const move = att.moves.find((m) => m.id === state.moveId);
    if (!move) { $("result").innerHTML = ""; return; }
    const defIdx = D.chars.indexOf(def);
    const r = C.evaluate(att, move, def, { perfectShield: state.ps, defenderMaterial: matOf(defIdx) });
    const a = r.adv;
    const attWho = state.mode === "A" ? "相手" : "自分", defWho = state.mode === "A" ? "自分" : "相手";
    let h = `<div class="sum"><div class="t">${attWho}の ${esc(att.name)}「${esc(shortName(move))}${move.input === "button" ? "［ボタン］" : move.input === "command" && move.category !== "command" ? "［コマンド］" : ""}」${move.material ? "【" + esc(move.material) + "】" : ""}を${defWho}（${esc(def.name)}）がガード${state.ps ? "（ジャストシールド）" : ""}</div>`;
    if (move.command) h += `<div class="cmd">入力: ${esc(move.command)}${move.commandDerived ? "（シート備考から作成）" : ""}</div>`;
    if (!a.ok) {
      h += `<div class="big neg" style="font-size:16px">計算対象外</div><div class="s">${esc(a.reason)}</div></div>`;
      $("result").innerHTML = h; return;
    }
    h += `<div class="big ${a.primaryEff < 0 ? "neg" : ""}">${defWho}が ${fmtAdv(a.primaryEff)} 有利</div>`;
    const airTxt = move.landingVariant
      ? `空中必殺の着地: 着地隙${a.landingLag}F − ガード硬直（着地直前に当てた場合の最小値。空中にいる時間は含まない）`
      : `空中攻撃: 着地隙${a.landingLag}F − ガード硬直（着地直前に当てた場合の最小値）`;
    h += `<div class="s">${a.aerial ? airTxt : `最速の判定${a.multiHit ? "（多段技は最終段）" : ""}をガードした場合`}${!a.lateUnknown && a.worstEff !== a.primaryEff ? ` ／ 判定の終わり際なら ${fmtAdv(a.worstEff)}` : ""}${a.lateUnknown ? " ／ 判定の終わりはシート上で不定" : ""}</div>`;
    if (move.guardNote) h += `<div class="note">${esc(move.guardNote)}</div>`;
    h += `</div>`;
    const sure = r.list.filter((x) => x.status === "sure"), no = r.list.filter((x) => x.status === "impossible");
    const T = C.THRESHOLDS;
    h += `<div class="legend"><span><span class="b sure">確定</span> 密着ならフレームが間に合う</span><span><span class="b impossible">不可</span> フレーム不足</span>` +
      `<span><span class="t2 severe">シビア</span> 猶予0〜${T.severeMax}F</span><span><span class="t2 easy">余裕</span> 猶予${T.easyMin}F以上</span></div>`;
    const item = (x) => {
      const lbl = x.status === "sure" ? "確定" : "不可";
      const mcls = x.margin > 0 ? "pos" : x.margin === 0 ? "zero" : "neg";
      const routeTxt = x.cost ? `${x.routeLabel}（+${x.cost}F）` : x.routeLabel;
      const tier = x.tier === "severe" ? `<span class="t2 severe" title="猶予${T.severeMax}F以下: 最速入力が必要">シビア</span>` : x.tier === "easy" ? `<span class="t2 easy" title="猶予${T.easyMin}F以上">余裕</span>` : "";
      return `<li class="${x.status}"><div class="row1"><span class="b ${x.status}">${lbl}</span><span class="n">${esc(shortName(x.move))}${x.move.material ? `<small style="color:var(--sub);font-weight:400">【${esc(x.move.material)}】</small>` : ""}</span>${tier}<span class="m ${mcls}">猶予 ${x.margin >= 0 ? "+" : ""}${x.margin}F</span></div>` +
        `<div class="row2">${esc(routeTxt)} ／ 発生${x.startup}F → 必要${x.need}F</div>` +
        (x.move.input === "button" ? `<div class="cmd">ボタン入力</div>` : x.move.command ? `<div class="cmd">${x.move.input === "command" ? "コマンド入力" : "入力"}: ${esc(x.move.command)}</div>` : "") +
        `</li>`;
    };
    if (!sure.length) h += `<div class="hint">密着でもフレーム上で間に合う反撃はありません。</div>`;
    h += `<ul class="list">${sure.map(item).join("")}</ul>`;
    if (no.length) h += `<details><summary>不可（フレーム不足） ${no.length}件</summary><ul class="list">${no.map(item).join("")}</ul></details>`;
    $("result").innerHTML = h;
  }

  if (window.__DATA__) init(window.__DATA__);
  else fetch("data.json").then((r) => r.json()).then(init);
})();
