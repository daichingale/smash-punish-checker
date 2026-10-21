/* 全技表の行・ソート・プリセット。ブラウザ / Node 共通。計算は calc.js を使う */
(function (root) {
  "use strict";
  const KIND_LABEL = { tilt: "弱・強", smash: "スマッシュ", air: "空中", special: "必殺", command: "コマンド", grab: "つかみ" };
  const KIND_IDS = Object.keys(KIND_LABEL);
  const PLACE_LABEL = { ground: "地上", air: "空中" };
  const SORT_KEYS = ["order", "char", "name", "kind", "startup", "activeEnd", "total", "landing", "damage", "stun", "adv", "sure"];
  const FIRST_DIR = { startup: "asc", activeEnd: "asc", total: "asc", landing: "asc", damage: "desc", stun: "desc", adv: "desc", sure: "desc", char: "asc", name: "asc", kind: "asc", order: "asc" };
  const PRESETS = [
    { id: "fast", label: "発生が速い技", sort: "startup", dir: "asc" },
    { id: "safe", label: "ガードされても安全な技", sort: "adv", dir: "asc" },
    { id: "land", label: "着地隙が少ない空中攻撃", sort: "landing", dir: "asc", where: (r) => r.place === "air" && r.landing != null },
    { id: "total", label: "全体Fが短い技", sort: "total", dir: "asc" },
    { id: "tools", label: "キャラ別の最速手段", sort: "startup", dir: "asc", tools: true },
    { id: "punish", label: "確定反撃が多い技", sort: "sure", dir: "desc" },
  ];
  const PRESET_BY_ID = {};
  PRESETS.forEach((p) => { PRESET_BY_ID[p.id] = p; });

  const toKata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const norm = (s) => toKata(String(s).normalize("NFKC").toLowerCase()).replace(/[\s・&＆.．ー\-'’／/]/g, "");

  function moveLabel(m) {
    if (m.category === "special") {
      const v = m.variant || "";
      const base = v && !/^(地上|空中|地上・空中|通常|地上\s*\(空中\))$/.test(v) ? v : (m.title || "");
      const place = /^(地上|空中)$/.test(v) ? "・" + v : "";
      const tag = [m.versionLabel, m.landingVariant].filter(Boolean).join(" ");
      return m.group + (base ? " " + base : "") + place + (m.strength ? "（" + m.strength + "）" : "") + (tag ? " " + tag : "");
    }
    return m.name.replace(/［(ボタン|コマンド)］$/, "");
  }
  function kindOf(m) {
    if (m.category === "command" || m.input === "command") return "command";
    if (m.category === "aerial") return "air";
    if (m.category === "grab") return "grab";
    if (m.category === "special") return "special";
    if (m.category === "ground" && /スマッシュ/.test(m.name)) return "smash";
    return "tilt";
  }
  function placeOf(m) {
    if (m.category === "aerial" || m.landingVariant) return "air";
    if (m.versionLabel === "空中") return "air";
    const v = m.variant || "";
    if (v === "空中" || (v.includes("空中") && !v.includes("地上"))) return "air";
    return "ground";
  }
  function groupIndex(m) {
    if (m.category === "ground" && !/スマッシュ/.test(m.name) && m.input !== "command") return 0;
    if (m.category === "ground" && /スマッシュ/.test(m.name)) return 1;
    if (m.category === "aerial") return 2;
    if (m.category === "special" && m.input !== "command") return 3;
    if (m.category === "command" || m.input === "command") return 4;
    return 0;
  }
  function subLine(m, place) {
    return [m.landingVariant || PLACE_LABEL[place], m.material || "", m.input === "command" ? "コマンド" : ""].filter(Boolean).join(" · ");
  }

  function buildRows(data, calc, o) {
    o = o || {};
    const rows = [];
    let order = 0;
    data.chars.forEach((ch, ci) => {
      ch.moves.forEach((m) => {
        const f = calc.listFrames(m, o.arsene && ch.name === "ジョーカー" ? { arsene: true } : undefined);
        const kind = kindOf(m);
        const place = placeOf(m);
        const name = moveLabel(m);
        const parts = calc.hitboxParts(m);
        const span = calc.formatParts(parts, false);
        rows.push({
          order: order++, ci, id: m.id, char: ch.name, name, kind, place,
          group: groupIndex(m), material: m.material || "", command: m.command || "",
          slotGroup: m.group || "", sub: subLine(m, place),
          hay: norm(name + " " + (m.command || "") + " " + (m.material || "")),
          startup: f.startup, activeEnd: f.activeEnd, total: f.total, landing: f.landing,
          parts, damageMax: span.max, damageMin: span.min, damage: span.max,
          stun: f.stun, adv: f.adv, advMin: f.advMin == null ? null : f.advMin, advMax: f.advMax == null ? null : f.advMax, sure: null,
        });
      });
    });
    return rows;
  }

  function defaultMaterial(ch) {
    return ch.materials && ch.materials.length ? (ch.materials[1] || ch.materials[0]) : null;
  }
  function punishNeeds(chars, calc) {
    return chars.map((ch) => calc.punishOptions(ch, defaultMaterial(ch)).map((o) => o.startup + calc.routeCost(o.route, ch.jumpsquat, false)));
  }
  function countSure(adv, needs) {
    let k = 0;
    for (let i = 0; i < needs.length; i++) if (adv >= needs[i]) k++;
    return k;
  }
  /** vs が null なら全キャラ平均（小数1桁）。キャラ番号ならその相手への確定数。有利が無い技は null */
  function fillSure(rows, needs, vs) {
    const n = needs.length || 1;
    for (const row of rows) {
      if (row.adv == null) { row.sure = null; continue; }
      if (vs == null) {
        let s = 0;
        for (let i = 0; i < needs.length; i++) s += countSure(row.adv, needs[i]);
        row.sure = Math.round((s / n) * 10) / 10;
      } else row.sure = countSure(row.adv, needs[vs] || []);
    }
    return rows;
  }

  /** ダメージ列のソートキー。最大が初期。null は sortRows が末尾に置く */
  function applyDamageKey(rows, agg) {
    for (const r of rows) r.damage = agg === "min" ? r.damageMin : r.damageMax;
    return rows;
  }

  function fmtSigned(v) { return (v > 0 ? "+" : "") + v; }
  /** 判定で有利が変わる技は「+14〜+16」。ソートに使う主数値は別（adv） */
  function formatAdvRange(row) {
    if (!row || row.adv == null || Number.isNaN(row.adv)) return "—";
    const lo = row.advMin == null ? row.adv : row.advMin;
    const hi = row.advMax == null ? row.adv : row.advMax;
    if (lo === hi) return fmtSigned(row.adv);
    return fmtSigned(Math.min(lo, hi)) + "〜" + fmtSigned(Math.max(lo, hi));
  }

  function missing(v) { return v == null || (typeof v === "number" && Number.isNaN(v)); }
  function sortRows(rows, key, dir) {
    const sign = dir === "desc" ? -1 : 1;
    const out = rows.slice();
    out.sort((a, b) => {
      const av = a[key], bv = b[key];
      const aBad = missing(av), bBad = missing(bv);
      if (aBad || bBad) return aBad === bBad ? a.order - b.order : (aBad ? 1 : -1);
      if (typeof av === "number" && typeof bv === "number") {
        if (av !== bv) return av < bv ? -sign : sign;
        return a.order - b.order;
      }
      const c = String(av).localeCompare(String(bv), "ja");
      return c ? c * sign : a.order - b.order;
    });
    return out;
  }

  function toolPick(rows) {
    const best = new Map();
    function take(row, slot) {
      const k = row.ci + "/" + slot;
      const cur = best.get(k);
      if (!cur || row.startup < cur.startup || (row.startup === cur.startup && row.name < cur.name)) best.set(k, row);
    }
    for (const r of rows) {
      if (r.startup == null) continue;
      if (r.kind === "tilt" && /^弱/.test(r.name)) take(r, "jab");
      if (r.slotGroup === "上B" && r.place === "ground" && r.kind === "special") take(r, "upb");
      if (r.kind === "smash" && /^上スマッシュ/.test(r.name)) take(r, "usmash");
      if (r.kind === "air") take(r, "air");
      if (r.kind === "grab") take(r, "grab");
    }
    return Array.from(best.values());
  }

  function applyView(rows, q) {
    q = q || {};
    let out = rows;
    if (q.chars && q.chars.length) {
      const set = new Set(q.chars);
      out = out.filter((r) => set.has(r.ci));
    }
    if (q.kinds && q.kinds.length) {
      const set = new Set(q.kinds);
      out = out.filter((r) => set.has(r.kind));
    }
    if (q.place === "air" || q.place === "ground") out = out.filter((r) => r.place === q.place);
    if (q.text) {
      const n = norm(q.text);
      if (n) out = out.filter((r) => r.hay.includes(n));
    }
    const preset = PRESET_BY_ID[q.preset];
    if (preset && preset.tools) out = toolPick(out);
    else if (preset && preset.where) out = out.filter(preset.where);
    const sort = q.sort || (preset && preset.sort) || "order";
    const dir = q.dir || (preset && preset.dir) || "asc";
    return sortRows(out, sort, dir);
  }

  function parseQuery(hash) {
    const q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const chars = (q.get("c") || "").split(",").filter((s) => /^\d+$/.test(s)).map((s) => +s);
    const kinds = (q.get("kind") || "").split(",").filter((k) => PRESET_BY_ID && KIND_IDS.indexOf(k) >= 0);
    const preset = PRESET_BY_ID[q.get("preset")] ? q.get("preset") : "";
    const sort = SORT_KEYS.indexOf(q.get("sort")) >= 0 ? q.get("sort") : (preset ? PRESET_BY_ID[preset].sort : "order");
    const dirRaw = q.get("dir");
    const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (preset ? PRESET_BY_ID[preset].dir : "asc");
    const place = q.get("place") === "air" || q.get("place") === "ground" ? q.get("place") : "";
    const vsRaw = q.get("vs");
    const vs = vsRaw != null && /^\d+$/.test(vsRaw) ? +vsRaw : null;
    const dmg = q.get("dmg") === "min" ? "min" : "max";
    const ooRaw = q.get("oo");
    const oo = ooRaw === "1" ? true : ooRaw === "0" ? false : null;
    const arsene = q.get("ars") === "1";
    return { sort, dir, preset, kinds, place, chars, text: q.get("q") || "", vs, dmg, oo, arsene };
  }
  function serialize(s) {
    const p = new URLSearchParams();
    if (s.preset) p.set("preset", s.preset);
    if (s.sort && s.sort !== "order") p.set("sort", s.sort);
    if (s.dir === "desc" || (s.sort && s.sort !== "order")) p.set("dir", s.dir || "asc");
    if (s.kinds && s.kinds.length) p.set("kind", s.kinds.join(","));
    if (s.place) p.set("place", s.place);
    if (s.chars && s.chars.length) p.set("c", s.chars.join(","));
    if (s.text) p.set("q", s.text);
    if (s.vs != null) p.set("vs", String(s.vs));
    if (s.dmg === "min") p.set("dmg", "min");
    if (s.oo === true) p.set("oo", "1");
    else if (s.oo === false) p.set("oo", "0");
    if (s.arsene) p.set("ars", "1");
    return p.toString();
  }

  const api = {
    KIND_LABEL, KIND_IDS, PLACE_LABEL, SORT_KEYS, FIRST_DIR, PRESETS, PRESET_BY_ID,
    moveLabel, kindOf, placeOf, buildRows, punishNeeds, fillSure, sortRows, applyDamageKey, applyView, parseQuery, serialize, norm, formatAdvRange,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FrameTable = api;
})(typeof window !== "undefined" ? window : globalThis);
