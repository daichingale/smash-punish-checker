/* ティア表の状態。ブラウザ / Node 共通。フレームデータは読まない */
(function (root) {
  "use strict";
  const DEFAULT_COLORS = ["#d64545", "#e07a2f", "#e0b030", "#3aaa5a", "#3b82d6", "#8b5cf6", "#db2777", "#0f766e"];
  const DEFAULT_NAMES = ["S", "A", "B", "C", "D"];
  const MAX_TIERS = 24;
  const MAX_NAME = 16;

  function validColor(c) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(String(c || "").trim());
    return m ? "#" + m[1].toLowerCase() : "";
  }
  function defaultTiers() {
    return DEFAULT_NAMES.map((name, i) => ({ name: name, color: DEFAULT_COLORS[i] }));
  }
  function defaultState() {
    const tiers = defaultTiers();
    return { tiers: tiers, rows: tiers.map(() => []) };
  }
  function cloneState(s) {
    return {
      tiers: s.tiers.map((t) => ({ name: t.name, color: t.color })),
      rows: s.rows.map((r) => r.slice()),
    };
  }

  function poolIndices(state, count) {
    const used = new Set();
    for (const row of state.rows) for (const i of row) used.add(i);
    const out = [];
    for (let i = 0; i < count; i++) if (!used.has(i)) out.push(i);
    return out;
  }

  function removeIndex(state, index) {
    for (const row of state.rows) {
      const at = row.indexOf(index);
      if (at >= 0) row.splice(at, 1);
    }
  }

  /** at は「今の並び」での挿入位置。同じ段の中で後ろへ動かすときは、抜いた分を戻す */
  function moveFighter(state, index, tierIndex, at) {
    if (!Number.isInteger(index) || tierIndex < 0 || tierIndex >= state.rows.length) return false;
    const srcTier = state.rows.findIndex((r) => r.indexOf(index) >= 0);
    const srcPos = srcTier < 0 ? -1 : state.rows[srcTier].indexOf(index);
    removeIndex(state, index);
    const row = state.rows[tierIndex];
    let pos = at == null ? row.length : at;
    if (srcTier === tierIndex && srcPos >= 0 && srcPos < pos) pos -= 1;
    if (pos < 0) pos = 0;
    if (pos > row.length) pos = row.length;
    row.splice(pos, 0, index);
    return true;
  }
  function toPool(state, index) {
    removeIndex(state, index);
  }

  function addTier(state, name, color) {
    if (state.tiers.length >= MAX_TIERS) return false;
    const n = state.tiers.length;
    const label = String(name || "").trim().slice(0, MAX_NAME) || ("段" + (n + 1));
    state.tiers.push({ name: label, color: validColor(color) || DEFAULT_COLORS[n % DEFAULT_COLORS.length] });
    state.rows.push([]);
    return true;
  }
  function removeTier(state, tierIndex) {
    if (state.tiers.length <= 1) return false;
    if (tierIndex < 0 || tierIndex >= state.tiers.length) return false;
    state.tiers.splice(tierIndex, 1);
    state.rows.splice(tierIndex, 1);
    return true;
  }
  function moveTier(state, from, to) {
    if (from === to || from < 0 || to < 0 || from >= state.tiers.length || to >= state.tiers.length) return false;
    const t = state.tiers.splice(from, 1)[0];
    const r = state.rows.splice(from, 1)[0];
    state.tiers.splice(to, 0, t);
    state.rows.splice(to, 0, r);
    return true;
  }
  function renameTier(state, tierIndex, name) {
    const next = String(name == null ? "" : name).trim().slice(0, MAX_NAME);
    if (!next || tierIndex < 0 || tierIndex >= state.tiers.length) return false;
    state.tiers[tierIndex].name = next;
    return true;
  }
  function recolorTier(state, tierIndex, color) {
    const c = validColor(color);
    if (!c || tierIndex < 0 || tierIndex >= state.tiers.length) return false;
    state.tiers[tierIndex].color = c;
    return true;
  }

  function compact(state) {
    return {
      v: 1,
      t: state.tiers.map((t) => [t.name, t.color]),
      r: state.rows.map((row) => row.slice()),
    };
  }
  function encode(state) {
    return encodeURIComponent(JSON.stringify(compact(state)));
  }
  function parsePayload(text) {
    const tries = [];
    const s = String(text);
    try {
      const d = decodeURIComponent(s);
      if (d !== s) tries.push(d);
    } catch (e) { /* すでに展開済み、または壊れた % */ }
    tries.push(s);
    for (const raw of tries) {
      try { return JSON.parse(raw); } catch (e) { /* 次の候補 */ }
    }
    return null;
  }
  function decode(text, count) {
    if (text == null || text === "") return null;
    if (!Number.isInteger(count) || count < 1) return null;
    const data = parsePayload(text);
    if (!data || data.v !== 1 || !Array.isArray(data.t) || !Array.isArray(data.r)) return null;
    if (data.t.length !== data.r.length || data.t.length < 1 || data.t.length > MAX_TIERS) return null;
    const tiers = [];
    const rows = [];
    const seen = new Set();
    for (let i = 0; i < data.t.length; i++) {
      const pair = data.t[i];
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const name = String(pair[0] == null ? "" : pair[0]).trim().slice(0, MAX_NAME);
      const color = validColor(pair[1]);
      if (!name || !color) return null;
      tiers.push({ name: name, color: color });
      const src = data.r[i];
      if (!Array.isArray(src)) return null;
      const row = [];
      for (const n of src) {
        if (!Number.isInteger(n) || n < 0 || n >= count || seen.has(n)) continue;
        seen.add(n);
        row.push(n);
      }
      rows.push(row);
    }
    return { tiers: tiers, rows: rows };
  }

  /** 未配置の検索。読み・ローマ字・ファイター番号は Names と同じ条件 */
  function filterPool(indices, roster, query, haystack, norm, charNo) {
    const qv = norm(String(query || ""));
    if (!qv) return indices.slice();
    return indices.filter((i) => {
      const c = roster[i];
      if (!c) return false;
      return haystack(c).includes(qv) || String(charNo(c)).replace("'", "") === qv;
    });
  }

  function ink(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return l > 0.62 ? "#14181f" : "#ffffff";
  }

  const api = {
    DEFAULT_COLORS, DEFAULT_NAMES, MAX_TIERS, MAX_NAME,
    validColor, defaultState, cloneState, poolIndices,
    moveFighter, toPool, addTier, removeTier, moveTier, renameTier, recolorTier,
    compact, encode, decode, filterPool, ink,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TierList = api;
})(typeof window !== "undefined" ? window : globalThis);
