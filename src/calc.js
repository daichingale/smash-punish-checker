/* 確定反撃の計算ロジック（ブラウザ / Node 共通）
 * 根拠: スマブラSPECIAL 検証wiki「ガード硬直差の計算方法」「ガード硬直」
 *  - ガード側の有利F = 攻撃側の後隙 − ガード硬直（ヒットストップは双方同数なので相殺）
 *    地上技・必殺ワザ: 後隙 = 全体F − 判定が出たF
 *    空中攻撃（着地際）: 後隙 = 着地隙（着地直前に当てた場合の最小値）
 *  - 反撃に必要なF（ガード硬直が終わってから）:
 *    ガーキャン上B・上スマ: 発生F / ガーキャン空中攻撃: ジャンプ踏切(通常3F)+発生F
 *    ガーキャンつかみ: 4F+発生F / シールド解除からの技: 11F+発生F
 *    ジャストシールド: 攻撃側の後隙+3F、ガード解除11Fとつかみ4Fが不要
 */
(function (root) {
  "use strict";
  const SHIELD_DROP = 11, GRAB_EXTRA = 4, PERFECT_SHIELD_BONUS = 3;
  /* 表示ラベルのしきい値（ここだけ変えれば画面・テストに反映される）
   *  severeMax: 猶予が 0〜severeMax F なら「シビア」（最速から1〜2F遅れると間に合わない）
   *  easyMin:   猶予が easyMin F 以上なら「余裕」（最速から7F≒0.12秒以上遅れても間に合う）
   */
  const THRESHOLDS = { severeMax: 2, easyMin: 8 };
  const SEQ_RE = /Hit|連|〆|派生/;
  const STARTER_SEQ = /^(弱1|横強1|空N1|空前1)/;

  const maxOf = (a) => Math.max.apply(null, a);
  function hasHit(row) {
    return !!row.active && (row.damage == null || maxOf(row.damage) > 0);
  }
  function firstHitRow(move) {
    // 着地判定（ランディングフォース）は技の出だしではないので発生Fの算出から除く
    return move.rows.find((r) => hasHit(r) && !r.label.includes("着地")) || null;
  }
  function startupOf(move) {
    const r = move.category === "grab" ? move.rows.find((x) => x.label === "その場" && x.active) : firstHitRow(move);
    return r ? r.active.starts[0] : null;
  }
  function lastStart(row) {
    // open（20-*）は終わりFがシートに無い。開始Fを最速として使い、終わり際は作らない
    if (row.active.open) return row.active.starts[row.active.starts.length - 1];
    return row.active.rehit ? row.active.end : row.active.starts[row.active.starts.length - 1];
  }

  /** 攻撃側の技をガードしたときのガード側有利F。
   * primary: 最速判定（多段技は最終段）をガードした場合 / worst: いちばん遅い判定の終わり際をガードした場合 */
  function shieldAdvantage(move) {
    if (move.category === "grab") return { ok: false, reason: "つかみはガードできない" };
    if (move.projectile) return { ok: false, reason: "飛び道具（防御側だけにヒットストップ・距離で変わる）のため計算対象外" };
    if (move.specialShield) return { ok: false, reason: "ガードさせた際の特殊仕様がある（シート備考）ため計算対象外" };
    // 空中（着地）の必殺は、空中攻撃と同じく着地隙で後隙を出す（全体Fは使わない）
    const isAir = move.category === "aerial" || !!move.landingVariant;
    const candidates = move.rows.filter((r) => {
      if (!hasHit(r) || !r.stun) return false;
      if (isAir) return true;
      return r.total != null;
    });
    // 開始が全体Fより後の窓は、溜め最大など別バージョンが短い全体Fに載っているだけ。
    // ただし全部がそうなら（召喚の持続など）従来どおりその行を使う。
    const inWindow = candidates.filter((r) => isAir || r.active.starts[0] <= r.total);
    const rows = inWindow.length ? inWindow : candidates;
    if (!rows.length) {
      const why = move.rows.some(hasHit)
        ? (isAir ? "ガード硬直が読めない" : "全体フレームかガード硬直がシートに無い／可変")
        : "攻撃判定の値が無い";
      return { ok: false, reason: why };
    }
    // 通常とアルセーヌが同じ技に並ぶときは、通常の段だけで有利を出す（アルセーヌは内訳だけ）
    const baseRows = rows.filter((r) => !/アルセーヌ/.test(r.label));
    let use = baseRows.length && baseRows.length < rows.length ? baseRows : rows;
    // 前と後ろの両方がある技は、密着している正面の段だけを使う
    if (use.some((r) => /（前）/.test(r.label)) && use.some((r) => /（後）/.test(r.label))) {
      use = use.filter((r) => !/（後）/.test(r.label));
    }
    const seq = use.some((r) => SEQ_RE.test(r.label));
    const pRow = seq ? use[use.length - 1] : use[0];
    // ヒットするとバウンドし、その行だけ全体Fが書いてあるときは、空振りの着地隙ではなくその全体F
    const bounce = isAir ? move.rows.find((r) => r.label === "バウンド" && r.damage == null && !r.stun && r.total != null) : null;
    const L = bounce ? bounce.total : move.landingLag;
    // 終わりが '*' の判定は、終わり際の有利Fを数字にしない
    const lateUnknown = use.some((r) => r.active && r.active.open);
    let primary, worst, detail = [];
    const groundAdv = (r, late) => r.total - (late ? r.active.end : r.active.starts[0]) - maxOf(r.stun);
    if (isAir) {
      if (L == null) return { ok: false, reason: "着地隙がシートに無い" };
      const f = (r, late) => (r.label.includes("着地") ? L - (late && !r.active.open ? r.active.end : r.active.starts[0]) - maxOf(r.stun) : L - maxOf(r.stun));
      primary = f(pRow, false);
      worst = lateUnknown ? primary : Math.min.apply(null, use.map((r) => f(r, true)));
      detail = use.map((r) => ({ label: r.label || "本体", stun: r.stun, adv: f(r, false) }));
    } else {
      const hit = seq ? lastStart(pRow) : pRow.active.starts[0];
      primary = pRow.total - hit - maxOf(pRow.stun);
      worst = lateUnknown ? primary : Math.min.apply(null, use.map((r) => groundAdv(r, true)));
      detail = use.map((r) => ({ label: r.label || "本体", stun: r.stun, total: r.total, hitFrame: r.active.starts[0], adv: groundAdv(r, false) }));
    }
    const alt = rows.filter((r) => use.indexOf(r) < 0).map((r) => ({
      label: r.label,
      adv: isAir ? (L == null ? null : (r.label.includes("着地") ? L - r.active.starts[0] - maxOf(r.stun) : L - maxOf(r.stun))) : groundAdv(r, false),
    }));
    const damage = pRow.damage && pRow.damage.length ? maxOf(pRow.damage) : null;
    const total = pRow.total == null ? null : pRow.total;
    return { ok: true, primary, worst: Math.min(worst, primary), lateUnknown, primaryStun: maxOf(pRow.stun), primaryLabel: pRow.label || "", multiHit: seq, aerial: isAir, landingLag: isAir ? move.landingLag : null, bounceLag: bounce ? bounce.total : null, alt, damage, total, detail };
  }

  /** 表の1行分。読めない値は null（画面では —）。有利は shieldAdvantage と同じ */
  function listFrames(move) {
    const startup = startupOf(move);
    const isAir = move.category === "aerial" || !!move.landingVariant;
    const landing = isAir && move.landingLag != null ? move.landingLag : null;
    const adv = shieldAdvantage(move);
    const activeRows = (move.rows || []).filter((r) => r.active);
    const activeEnd = !activeRows.length || activeRows.some((r) => r.active.open) ? null : Math.max.apply(null, activeRows.map((r) => r.active.end));
    if (!adv.ok) {
      const r = firstHitRow(move);
      return {
        startup, activeEnd, landing, adv: null,
        total: r && r.total != null ? r.total : null,
        damage: r && r.damage && r.damage.length ? maxOf(r.damage) : null,
        stun: r && r.stun && r.stun.length ? maxOf(r.stun) : null,
      };
    }
    return { startup, activeEnd, total: adv.total, landing, damage: adv.damage, stun: adv.primaryStun, adv: adv.primary };
  }

  function isStarter(move) {
    if (move.seqOf && !STARTER_SEQ.test(move.name)) return false;
    if (move.name.startsWith("10連")) return false;
    const fr = firstHitRow(move);
    if (fr && /^派生([2-9]|10)/.test(fr.label)) return false;
    return true;
  }

  /** ガード側キャラの反撃候補（経路つき） */
  function punishOptions(ch, material) {
    const out = [];
    const js = ch.jumpsquat;
    for (const m of ch.moves) {
      if (m.landingVariant || m.versionLabel === "空中" || m.derivedAir) continue; // 空中版は攻撃側の見方。反撃手段は地上版を使う
      if (material && m.material && m.material !== material) continue;
      if (!isStarter(m)) continue;
      const st = startupOf(m);
      if (st == null) continue;
      const v = m.variant || "";
      let route = null;
      if (m.category === "grab") route = "grab";
      else if (m.category === "aerial") route = "jump";
      else if (m.category === "special" && m.group === "上B") route = v.includes("空中") && !v.includes("地上") ? null : "oos";
      else if (m.category === "ground" && m.name.startsWith("上スマッシュ")) route = "oos";
      else if (m.category === "ground" || m.category === "command" || m.category === "special") {
        if (/ダッシュ攻撃|左踵落とし/.test(m.name)) route = null; // 走行が必要
        else if (/^(しゃがみ|立ち途中)/.test(m.name)) route = null; // しゃがみ状態が必要
        else if (m.category === "special" && v.includes("空中") && !v.includes("地上")) route = null;
        else route = "drop";
      }
      if (!route) continue;
      if (route === "jump" && js == null) continue;
      out.push({ move: m, route, startup: st });
    }
    return out;
  }

  const ROUTE_LABEL = { oos: "ガーキャン", jump: "ガーキャン空中", grab: "ガーキャンつかみ", drop: "シールド解除から" };
  function routeCost(route, js, perfect) {
    if (route === "oos") return 0;
    if (route === "jump") return js;
    if (route === "grab") return perfect ? 0 : GRAB_EXTRA;
    return perfect ? 0 : SHIELD_DROP;
  }

  /** 猶予のラベル: "severe"（シビア）/ "easy"（余裕）/ null */
  function marginTier(margin) {
    if (margin < 0) return null;
    if (margin <= THRESHOLDS.severeMax) return "severe";
    if (margin >= THRESHOLDS.easyMin) return "easy";
    return null;
  }

  /** attacker の move をガードした defender の反撃一覧 */
  function evaluate(attacker, move, defender, o) {
    o = o || {};
    const adv = shieldAdvantage(move);
    if (!adv.ok) return { adv, list: [] };
    const bonus = o.perfectShield ? PERFECT_SHIELD_BONUS : 0;
    const list = punishOptions(defender, o.defenderMaterial).map((opt) => {
      const cost = routeCost(opt.route, defender.jumpsquat, o.perfectShield);
      const need = opt.startup + cost;
      const margin = adv.primary + bonus - need;
      const marginWorst = adv.worst + bonus - need;
      // 密着を前提に、フレームが間に合えば「確定」（リーチ・ガードで押される距離は考慮しない）
      const status = margin >= 0 ? "sure" : "impossible";
      return { ...opt, cost, need, margin, marginWorst, status, tier: marginTier(margin), routeLabel: ROUTE_LABEL[opt.route] };
    });
    // 猶予の大きい順（同じなら必要Fの小さい順）。「不可」は後ろ
    list.sort((a, b) => (a.status === b.status ? 0 : a.status === "sure" ? -1 : 1) || b.margin - a.margin || a.need - b.need);
    return { adv: { ...adv, primaryEff: adv.primary + bonus, worstEff: adv.worst + bonus }, list };
  }

  /** アイテムなしの1対1で与ダメージに掛かる倍率。ガード硬直の式には入らない（検証wiki「ガード硬直」） */
  const ONE_ON_ONE = 1.2;

  function scaleDamage(n, oneOnOne) {
    if (!oneOnOne) return n;
    return Math.round(n * ONE_ON_ONE * 1000) / 1000;
  }
  function fmtDamageNum(n) {
    return String(Math.round(n * 100) / 100);
  }

  /** シートの行ラベルと基礎ダメージ。行メモからは名前を作らない。硬直は個数がダメージと一致するときだけ対応づける */
  function hitboxParts(move) {
    const parts = [];
    for (const row of (move && move.rows) || []) {
      const damages = (row.damage || []).filter((d) => typeof d === "number" && !Number.isNaN(d));
      if (!damages.length) continue;
      const stuns = (row.stun || []).filter((s) => typeof s === "number" && !Number.isNaN(s));
      parts.push({
        label: String(row.label || "").trim(),
        damages,
        stuns: stuns.length === damages.length ? stuns.slice() : null,
      });
    }
    return parts;
  }

  /** 表示文。ラベルがある行は「14 / 11 (先端)」。名前の無い複数値は hit1 / hit2 */
  function formatParts(parts, oneOnOne) {
    parts = parts || [];
    const unlabeled = parts.reduce((n, p) => n + (p.label ? 0 : p.damages.length), 0);
    let hit = 0, max = null, min = null;
    const items = parts.map((p) => {
      const nums = p.damages.map((d) => scaleDamage(d, !!oneOnOne));
      for (const n of nums) {
        if (max == null || n > max) max = n;
        if (min == null || n < min) min = n;
      }
      let body;
      if (p.label) body = nums.map(fmtDamageNum).join(" / ") + " (" + p.label + ")";
      else if (unlabeled <= 1) body = fmtDamageNum(nums[0]);
      else body = nums.map((n) => "hit" + (++hit) + " " + fmtDamageNum(n)).join(" / ");
      return { label: p.label, damages: nums, base: p.damages.slice(), stuns: p.stuns, text: body };
    });
    return { text: items.map((it) => it.text).join(" · "), items, max, min };
  }
  function formatHitboxes(move, oneOnOne) {
    return formatParts(hitboxParts(move), oneOnOne);
  }

  const api = {
    THRESHOLDS, marginTier, shieldAdvantage, listFrames, punishOptions, evaluate, startupOf, routeCost, isStarter,
    ROUTE_LABEL, SHIELD_DROP, GRAB_EXTRA, PERFECT_SHIELD_BONUS,
    ONE_ON_ONE, scaleDamage, hitboxParts, formatParts, formatHitboxes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PunishCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
