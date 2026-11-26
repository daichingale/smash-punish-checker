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
  // シートが同じ技に別行で書いた状態。倍率しか無い状態はここへ足さない。
  const CRIT_RE = /会心の一撃/;
  const INK_RE = /インク切れ/;
  /** 印の行があるとき、on ならその行だけ、off なら印の行を除く。印が無ければそのまま */
  function applyMark(current, source, re, on) {
    const marked = [];
    for (let i = 0; i < source.length; i++) if (re.test(source[i].label || "")) marked.push(source[i]);
    if (!marked.length) return { rows: current, used: false };
    if (on) return { rows: marked, used: true };
    const rest = [];
    for (let i = 0; i < current.length; i++) if (!re.test(current[i].label || "")) rest.push(current[i]);
    if (!rest.length) return { rows: current, used: false };
    return { rows: rest, used: false };
  }

  const maxOf = (a) => Math.max.apply(null, a);
  const minOf = (a) => Math.min.apply(null, a);
  /** 1行の中の判定名。シートの行ラベルが数字の個数と一致するときだけその名前を使い、それ以外は hit1 / hit2 */
  function partNames(row, n) {
    const label = String((row && row.label) || "").trim();
    if (n === 1) return [label || "hit1"];
    const parts = label.split(/[/、]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === n) return parts;
    const names = [];
    for (let i = 0; i < n; i++) names.push("hit" + (i + 1));
    return names;
  }
  /** ダメージと硬直の個数が一致するときだけ、同じ行の判定を対応づける。合わなければ null（推測しない） */
  function pairedHitboxes(row, advOf) {
    // 溜め・状況の幅は判定が2つあるのではない。対にすると名前を作ることになる
    if (row && row.stunSpan) return null;
    const damages = row && Array.isArray(row.damage) ? row.damage : null;
    const stuns = row && Array.isArray(row.stun) ? row.stun : null;
    if (!damages || !stuns || !damages.length || damages.length !== stuns.length) return null;
    for (let i = 0; i < damages.length; i++) {
      if (typeof damages[i] !== "number" || Number.isNaN(damages[i])) return null;
      if (typeof stuns[i] !== "number" || Number.isNaN(stuns[i])) return null;
    }
    const names = partNames(row, damages.length);
    return damages.map((damage, i) => ({ name: names[i], damage: damage, stun: stuns[i], adv: advOf(stuns[i]) }));
  }
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
   * primary: 最速判定（多段技は最終段）をガードした場合 / worst: いちばん遅い判定の終わり際をガードした場合
   * o.arsene: 真のとき、アルセーヌの段がある技はその段のガード硬直と全体Fを使う。段が無い技は通常のまま
   * o.crit: 真のとき、会心の一撃の行がある技はその行の硬直とダメージを使う。初期は通常の段
   * o.ink: 真のとき、インク切れの行がある技はその行を使う。初期はインクあり（通常の段）。硬直か全体Fが読めない行は使わない */
  function shieldAdvantage(move, o) {
    o = o || {};
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
    // アルセーヌありのときは、最初のアルセーヌ行から末尾までを使う。下強の持続のように
    // その行のあとに並ぶ段も、シートに書いてある硬直と全体Fのまま使う（数値は作らない）
    const arseneAt = rows.findIndex((r) => /アルセーヌ/.test(r.label));
    const baseRows = rows.filter((r) => !/アルセーヌ/.test(r.label));
    let use = baseRows.length && baseRows.length < rows.length ? baseRows : rows;
    let usedArsene = false;
    if (o.arsene && arseneAt >= 0) {
      use = rows.slice(arseneAt);
      usedArsene = true;
    }
    // 会心・インク切れは通常の段と交互に並ぶ。アルセーヌのように「最初の印から末尾」にはしない。
    // 印の行だけ硬直とダメージが違い、全体Fの空欄は結合セル（直前行と同じ）として既に入っている。
    const critPick = applyMark(use, rows, CRIT_RE, !!o.crit);
    use = critPick.rows;
    const usedCrit = critPick.used;
    const inkPick = applyMark(use, rows, INK_RE, !!o.ink);
    use = inkPick.rows;
    const usedInk = inkPick.used;
    // 前と後ろの両方がある技は、密着している正面の段だけを使う
    if (use.some((r) => /（前）/.test(r.label)) && use.some((r) => /（後）/.test(r.label))) {
      use = use.filter((r) => !/（後）/.test(r.label));
    }
    // 着地隙 L での空中有利。条件が複数あるときは、条件ごとにこの式を使う
    function stunEnds(row) {
      const hi = maxOf(row.stun);
      const lo = row.stunSpan ? minOf(row.stun) : hi;
      return { lo: lo, hi: hi, span: lo !== hi };
    }
    // 幅が1つだけのとき、きびしい端の反対。全体Fと硬直が両方幅のときは null（対応を作らない）
    function otherEnd(harsh, loose, spans) {
      if (spans !== 1 || loose == null || loose === harsh) return null;
      return loose;
    }
    function airBlock(useRows, lag, lagHi) {
      if (lag == null || !useRows.length) return null;
      const seqAir = useRows.some((r) => SEQ_RE.test(r.label));
      const row = seqAir ? useRows[useRows.length - 1] : useRows[0];
      const late = useRows.some((r) => r.active && r.active.open);
      const f = (r, atEnd) => (r.label.includes("着地") ? lag - (atEnd && !r.active.open ? r.active.end : r.active.starts[0]) - maxOf(r.stun) : lag - maxOf(r.stun));
      const prim = f(row, false);
      const worstAir = late ? prim : Math.min.apply(null, useRows.map((r) => f(r, true)));
      const base = row.label.includes("着地") ? lag - row.active.starts[0] : lag;
      const ofStun = (s) => base - s;
      const se = stunEnds(row);
      const lagSpan = typeof lagHi === "number" && lagHi !== lag;
      const at = (lg, st) => (row.label.includes("着地") ? lg - row.active.starts[0] - st : lg - st);
      const loose = otherEnd(prim, se.span ? at(lag, se.lo) : (lagSpan ? at(lagHi, se.hi) : prim), (se.span ? 1 : 0) + (lagSpan ? 1 : 0));
      return {
        seq: seqAir, pRow: row, lateUnknown: late, primary: prim, worst: worstAir, loose: loose,
        detail: useRows.map((r) => ({ label: r.label || "本体", stun: r.stun, adv: f(r, false) })),
        hitboxes: pairedHitboxes(row, ofStun), advOf: ofStun,
      };
    }
    // 会心・インク切れだけの複数行は、ラベルに Hit が残らない。シートの並びの最後を最終段にする
    const formSeq = use.length > 1 && (use.every((r) => CRIT_RE.test(r.label || "")) || use.every((r) => INK_RE.test(r.label || "")));
    const seq = use.some((r) => SEQ_RE.test(r.label)) || formSeq;
    const pRow0 = seq ? use[use.length - 1] : use[0];
    const caseSpecs = isAir && Array.isArray(move.landingCases) && move.landingCases.length >= 1 ? move.landingCases : null;
    // ヒットするとバウンドし、その行だけ全体Fが書いてあるときは、空振りの着地隙ではなくその全体F。
    // 備考が条件別に着地隙を書いているときは、その数字を使う（バウンド行では置き換えない）
    const bounce = isAir && !caseSpecs ? move.rows.find((r) => r.label === "バウンド" && r.damage == null && !r.stun && r.total != null) : null;
    const L = bounce ? bounce.total : move.landingLag;
    // 終わりが '*' の判定は、終わり際の有利Fを数字にしない
    let lateUnknown = use.some((r) => r.active && r.active.open);
    let pRow = pRow0, multi = seq, primary, worst, loose = null, detail = [], advOf, hitboxes;
    let landingCases = null, landingName = "", harshLag = null;
    const groundAdv = (r, late) => r.total - (late ? r.active.end : r.active.starts[0]) - maxOf(r.stun);
    if (isAir && caseSpecs) {
      const computed = [];
      for (let i = 0; i < caseSpecs.length; i++) {
        const c = caseSpecs[i];
        if (!c || typeof c.lag !== "number" || !c.name) continue;
        let subset = use;
        if (Array.isArray(c.labels) && c.labels.length) subset = use.filter((r) => c.labels.indexOf(r.label) >= 0);
        const sub = airBlock(subset, c.lag);
        if (!sub) continue;
        computed.push({ name: String(c.name), lag: c.lag, adv: sub.primary, sub: sub });
      }
      if (computed.length < 1) return { ok: false, reason: "着地隙の条件を分けられない" };
      let harsh = computed[0];
      for (let i = 1; i < computed.length; i++) if (computed[i].adv < harsh.adv) harsh = computed[i];
      landingCases = computed.map((c) => ({ name: c.name, lag: c.lag, adv: c.adv }));
      landingName = computed.filter((c) => c.adv === harsh.adv).map((c) => c.name).join("・");
      harshLag = harsh.lag;
      const sub = harsh.sub;
      multi = sub.seq; pRow = sub.pRow; lateUnknown = sub.lateUnknown;
      primary = sub.primary; worst = sub.worst; loose = sub.loose; detail = sub.detail; advOf = sub.advOf; hitboxes = sub.hitboxes;
    } else if (isAir) {
      if (L == null) return { ok: false, reason: "着地隙がシートに無い" };
      const lagHi = bounce
        ? (typeof bounce.totalHi === "number" ? bounce.totalHi : null)
        : (typeof move.landingLagHi === "number" ? move.landingLagHi : null);
      const sub = airBlock(use, L, lagHi);
      multi = sub.seq; pRow = sub.pRow; lateUnknown = sub.lateUnknown;
      primary = sub.primary; worst = sub.worst; loose = sub.loose; detail = sub.detail; advOf = sub.advOf; hitboxes = sub.hitboxes;
    } else {
      const hit = seq ? lastStart(pRow) : pRow.active.starts[0];
      const se = stunEnds(pRow);
      const totalLo = pRow.total;
      const totalHi = typeof pRow.totalHi === "number" ? pRow.totalHi : totalLo;
      const totalSpan = totalHi !== totalLo;
      primary = totalLo - hit - se.hi;
      loose = otherEnd(primary, se.span ? totalLo - hit - se.lo : totalHi - hit - se.hi, (se.span ? 1 : 0) + (totalSpan ? 1 : 0));
      worst = lateUnknown ? primary : Math.min.apply(null, use.map((r) => groundAdv(r, true)));
      detail = use.map((r) => ({ label: r.label || "本体", stun: r.stun, total: r.total, hitFrame: r.active.starts[0], adv: groundAdv(r, false) }));
      advOf = (s) => totalLo - hit - s;
      hitboxes = pairedHitboxes(pRow, advOf);
    }
    // 主数値に使った段だけ。硬直が違う判定の有利は、同じ発生F・同じ後隙から引く。多段の他の段は混ぜない
    // 着地の条件があるときは、条件ごとの有利（その条件のきびしい判定）も範囲に入れる
    const pool = [];
    if (hitboxes && hitboxes.length) for (let i = 0; i < hitboxes.length; i++) pool.push(hitboxes[i].adv);
    else pool.push(primary);
    if (loose != null) pool.push(loose);
    if (landingCases) for (let i = 0; i < landingCases.length; i++) pool.push(landingCases[i].adv);
    const advMin = minOf(pool);
    const advMax = maxOf(pool);
    const lagForAlt = harshLag != null ? harshLag : L;
    const alt = rows.filter((r) => use.indexOf(r) < 0).map((r) => ({
      label: r.label,
      adv: isAir ? (lagForAlt == null ? null : (r.label.includes("着地") ? lagForAlt - r.active.starts[0] - maxOf(r.stun) : lagForAlt - maxOf(r.stun))) : groundAdv(r, false),
    }));
    const damage = pRow.damage && pRow.damage.length ? maxOf(pRow.damage) : null;
    const total = pRow.total == null ? null : pRow.total;
    const shownLag = isAir ? (harshLag != null ? harshLag : move.landingLag) : null;
    const seOut = stunEnds(pRow);
    const totalHi = typeof pRow.totalHi === "number" && pRow.totalHi !== pRow.total ? pRow.totalHi : null;
    return {
      ok: true, primary, loose, worst: Math.min(worst, primary), lateUnknown, primaryStun: maxOf(pRow.stun),
      stunSpan: seOut.span, stunLo: seOut.lo, stunHi: seOut.hi,
      primaryLabel: pRow.label || "", multiHit: multi, aerial: isAir, landingLag: shownLag, landingName: landingName, landingCases: landingCases, bounceLag: bounce ? bounce.total : null, alt, damage, total, totalHi, detail, hitboxes, advMin, advMax, usedArsene, usedCrit, usedInk,
    };
  }

  /** 表の1行分。読めない値は null（画面では —）。有利は shieldAdvantage と同じ */
  function listFrames(move, o) {
    const startup = startupOf(move);
    const isAir = move.category === "aerial" || !!move.landingVariant;
    const landing = isAir && move.landingLag != null ? move.landingLag : null;
    const adv = shieldAdvantage(move, o);
    const activeRows = (move.rows || []).filter((r) => r.active);
    const activeEnd = !activeRows.length || activeRows.some((r) => r.active.open) ? null : Math.max.apply(null, activeRows.map((r) => r.active.end));
    const landingMax = isAir && move.landingLagHi != null && landing != null && move.landingLagHi !== landing ? move.landingLagHi : null;
    if (!adv.ok) {
      const r = firstHitRow(move);
      const span = r && r.stunSpan && r.stun && r.stun.length > 1;
      return {
        startup, activeEnd, landing, landingMax, adv: null, advMin: null, advMax: null,
        total: r && r.total != null ? r.total : null,
        totalMax: r && r.totalHi != null && r.totalHi !== r.total ? r.totalHi : (r && r.total != null ? r.total : null),
        damage: r && r.damage && r.damage.length ? maxOf(r.damage) : null,
        stun: r && r.stun && r.stun.length ? (span ? minOf(r.stun) : maxOf(r.stun)) : null,
        stunMax: r && r.stun && r.stun.length ? maxOf(r.stun) : null,
      };
    }
    return {
      startup, activeEnd, total: adv.total,
      totalMax: adv.totalHi != null ? adv.totalHi : adv.total,
      landing, landingMax,
      damage: adv.damage,
      stun: adv.stunSpan ? adv.stunLo : adv.primaryStun,
      stunMax: adv.stunSpan ? adv.stunHi : adv.primaryStun,
      adv: adv.primary, advMin: adv.advMin, advMax: adv.advMax,
    };
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

  /** きびしい判定では不可で、弱い判定や別の着地条件なら間に合うときの短い補足。確定側には付けない */
  function weakSureNote(hitboxes, primary, bonus, need, cases) {
    const names = [];
    if (hitboxes) {
      for (let i = 0; i < hitboxes.length; i++) {
        const h = hitboxes[i];
        if (h.adv > primary && h.adv + bonus - need >= 0) names.push(h.name);
      }
    }
    const lands = [];
    if (cases) {
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        if (c.adv > primary && c.adv + bonus - need >= 0) lands.push(c.name);
      }
    }
    const bits = [];
    if (names.length) bits.push(names.join("・") + "なら確定");
    if (lands.length) bits.push(lands.join("・") + "なら確定");
    return bits.join("。");
  }

  /** attacker の move をガードした defender の反撃一覧 */
  function evaluate(attacker, move, defender, o) {
    o = o || {};
    const adv = shieldAdvantage(move, { arsene: !!o.arsene, crit: !!o.crit, ink: !!o.ink });
    if (!adv.ok) return { adv, list: [] };
    const bonus = o.perfectShield ? PERFECT_SHIELD_BONUS : 0;
    const list = punishOptions(defender, o.defenderMaterial).map((opt) => {
      const cost = routeCost(opt.route, defender.jumpsquat, o.perfectShield);
      const need = opt.startup + cost;
      const margin = adv.primary + bonus - need;
      const marginWorst = adv.worst + bonus - need;
      const marginLoose = adv.loose == null ? null : adv.loose + bonus - need;
      // 密着を前提に、フレームが間に合えば「確定」（リーチ・ガードで押される距離は考慮しない）
      // 幅のある値は、きびしい端で確定・色・猶予ラベルを決める。ゆるい端だけ間に合うときは補足だけ足す
      const status = margin >= 0 ? "sure" : "impossible";
      const looseStatus = marginLoose == null ? status : (marginLoose >= 0 ? "sure" : "impossible");
      const spanNote = looseStatus !== status ? "溜め・状況しだい" : "";
      const weakNote = status === "impossible" ? weakSureNote(adv.hitboxes, adv.primary, bonus, need, adv.landingCases) : "";
      return { ...opt, cost, need, margin, marginWorst, marginLoose, status, tier: marginTier(margin), routeLabel: ROUTE_LABEL[opt.route], weakNote, spanNote };
    });
    // 猶予の大きい順（同じなら必要Fの小さい順）。「不可」は後ろ
    list.sort((a, b) => (a.status === b.status ? 0 : a.status === "sure" ? -1 : 1) || b.margin - a.margin || a.need - b.need);
    return { adv: { ...adv, primaryEff: adv.primary + bonus, worstEff: adv.worst + bonus, looseEff: adv.loose == null ? null : adv.loose + bonus }, list };
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
  /** ダメージ表示用。印の行にダメージが無いときは、ありにしても通常の段のダメージを残す */
  function applyMarkDamage(rows, re, on) {
    const marked = [];
    for (let i = 0; i < rows.length; i++) if (re.test(rows[i].label || "")) marked.push(rows[i]);
    if (!marked.length) return rows;
    const usable = on && marked.some((r) => Array.isArray(r.damage) && r.damage.some((d) => typeof d === "number" && !Number.isNaN(d)));
    if (usable) return marked;
    const rest = [];
    for (let i = 0; i < rows.length; i++) if (!re.test(rows[i].label || "")) rest.push(rows[i]);
    return rest.length ? rest : rows;
  }
  function hitboxParts(move, o) {
    o = o || {};
    let rows = (move && move.rows) || [];
    rows = applyMarkDamage(rows, CRIT_RE, !!o.crit);
    rows = applyMarkDamage(rows, INK_RE, !!o.ink);
    const parts = [];
    for (const row of rows) {
      const damages = (row.damage || []).filter((d) => typeof d === "number" && !Number.isNaN(d));
      if (!damages.length) continue;
      const stuns = (row.stun || []).filter((s) => typeof s === "number" && !Number.isNaN(s));
      const span = row.stunSpan && stuns.length >= 2 ? [minOf(stuns), maxOf(stuns)] : null;
      parts.push({
        label: String(row.label || "").trim(),
        damages,
        stuns: span ? null : (stuns.length === damages.length ? stuns.slice() : null),
        stunSpan: span,
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
      return { label: p.label, damages: nums, base: p.damages.slice(), stuns: p.stuns, stunSpan: p.stunSpan || null, text: body };
    });
    return { text: items.map((it) => it.text).join(" · "), items, max, min };
  }
  function formatHitboxes(move, oneOnOne, o) {
    return formatParts(hitboxParts(move, o), oneOnOne);
  }

  const api = {
    THRESHOLDS, marginTier, shieldAdvantage, listFrames, punishOptions, evaluate, weakSureNote, startupOf, routeCost, isStarter,
    ROUTE_LABEL, SHIELD_DROP, GRAB_EXTRA, PERFECT_SHIELD_BONUS,
    ONE_ON_ONE, scaleDamage, hitboxParts, formatParts, formatHitboxes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PunishCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
