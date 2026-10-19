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
    const seq = rows.some((r) => SEQ_RE.test(r.label));
    const pRow = seq ? rows[rows.length - 1] : rows[0];
    // 終わりが '*' の判定は、終わり際の有利Fを数字にしない
    const lateUnknown = rows.some((r) => r.active && r.active.open);
    let primary, worst, detail = [];
    if (isAir) {
      const L = move.landingLag;
      if (L == null) return { ok: false, reason: "着地隙がシートに無い" };
      const f = (r, late) => (r.label.includes("着地") ? L - (late && !r.active.open ? r.active.end : r.active.starts[0]) - maxOf(r.stun) : L - maxOf(r.stun));
      primary = f(pRow, false);
      worst = lateUnknown ? primary : Math.min.apply(null, rows.map((r) => f(r, true)));
      detail = rows.map((r) => ({ label: r.label || "本体", stun: r.stun, adv: f(r, false) }));
    } else {
      const hit = seq ? lastStart(pRow) : pRow.active.starts[0];
      primary = pRow.total - hit - maxOf(pRow.stun);
      worst = lateUnknown ? primary : Math.min.apply(null, rows.map((r) => r.total - r.active.end - maxOf(r.stun)));
      detail = rows.map((r) => ({ label: r.label || "本体", stun: r.stun, total: r.total, hitFrame: r.active.starts[0], adv: r.total - r.active.starts[0] - maxOf(r.stun) }));
    }
    return { ok: true, primary, worst: Math.min(worst, primary), lateUnknown, primaryStun: maxOf(pRow.stun), primaryLabel: pRow.label || "", multiHit: seq, aerial: isAir, landingLag: isAir ? move.landingLag : null, detail };
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
      if (m.landingVariant) continue; // 着地版は攻撃側の見方。反撃手段としては元の必殺を使う
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

  const api = { THRESHOLDS, marginTier, shieldAdvantage, punishOptions, evaluate, startupOf, routeCost, isStarter, ROUTE_LABEL, SHIELD_DROP, GRAB_EXTRA, PERFECT_SHIELD_BONUS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PunishCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
