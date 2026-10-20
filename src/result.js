/* 大会リザルトとキャラ使用人数。ブラウザ / Node 共通。フレームデータは読まない。
 * 数え方: 選手名が同じ人は1人。その人が同じキャラを色違いで何回入れても1。
 * 別キャラはキャラごとに1。名前が空の行は、行ごとに別の人として数える。 */
(function (root) {
  "use strict";
  const TIER_SPEC = [
    { name: "S", color: "#d64545" },
    { name: "A", color: "#e07a2f" },
    { name: "B", color: "#e0b030" },
    { name: "C", color: "#3aaa5a" },
    { name: "D", color: "#3b82d6" },
  ];
  const MAX_NAME = 80;
  const MAX_PLAYER = 40;
  const MAX_ROWS = 128;
  const MAX_CHARS = 8;

  function playerKey(name) {
    return String(name == null ? "" : name).normalize("NFKC").trim().toLowerCase();
  }
  function cleanText(s, max) {
    return String(s == null ? "" : s).normalize("NFKC").trim().slice(0, max);
  }
  function validSlot(n) {
    return Number.isInteger(n) && n >= 1 && n <= 8;
  }
  function cleanChars(list, rosterCount) {
    const out = [];
    const seen = new Set();
    for (const item of list || []) {
      if (!item || !Number.isInteger(item.id) || item.id < 0) continue;
      if (Number.isInteger(rosterCount) && item.id >= rosterCount) continue;
      if (!validSlot(item.color)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ id: item.id, color: item.color });
      if (out.length >= MAX_CHARS) break;
    }
    return out;
  }
  function cleanEntrants(n) {
    if (n == null || n === "") return null;
    const v = typeof n === "number" ? n : Number(String(n).trim());
    if (!Number.isInteger(v) || v < 1 || v > 9999) return null;
    return v;
  }
  function cleanPlace(n) {
    const v = typeof n === "number" ? n : Number(String(n == null ? "" : n).trim());
    if (!Number.isInteger(v) || v < 1 || v > 9999) return null;
    return v;
  }
  function normalizeEvent(raw, rosterCount) {
    if (!raw || typeof raw !== "object") return null;
    const src = raw.event && typeof raw.event === "object" ? raw.event : raw;
    const rowsSrc = Array.isArray(raw.rows) ? raw.rows : [];
    const rows = [];
    for (const row of rowsSrc) {
      if (!row || typeof row !== "object") continue;
      const place = cleanPlace(row.place);
      if (place == null) continue;
      rows.push({
        place: place,
        player: cleanText(row.player, MAX_PLAYER),
        chars: cleanChars(row.chars, rosterCount),
      });
      if (rows.length >= MAX_ROWS) break;
    }
    return {
      event: {
        name: cleanText(src.name, MAX_NAME),
        date: cleanText(src.date, 32),
        entrants: cleanEntrants(src.entrants),
      },
      rows: rows,
    };
  }
  function defaultEvent() {
    const rows = [];
    for (let i = 1; i <= 8; i++) rows.push({ place: i, player: "", chars: [] });
    return { event: { name: "", date: "", entrants: null }, rows: rows };
  }
  function cloneEvent(ev) {
    return {
      event: { name: ev.event.name, date: ev.event.date, entrants: ev.event.entrants },
      rows: ev.rows.map((r) => ({ place: r.place, player: r.player, chars: r.chars.map((c) => ({ id: c.id, color: c.color })) })),
    };
  }

  function encode(ev) {
    return encodeURIComponent(JSON.stringify({ v: 1, event: ev.event, rows: ev.rows }));
  }
  function parsePayload(text) {
    const tries = [];
    const s = String(text);
    try {
      const d = decodeURIComponent(s);
      if (d !== s) tries.push(d);
    } catch (e) { /* 展開できない */ }
    tries.push(s);
    for (const raw of tries) {
      try { return JSON.parse(raw); } catch (e) { /* 次 */ }
    }
    return null;
  }
  function decode(text, rosterCount) {
    if (text == null || text === "") return null;
    const data = parsePayload(text);
    if (!data || data.v !== 1) return null;
    return normalizeEvent(data, rosterCount);
  }

  /** 1大会、配列、{ events: [] } のいずれも読む。読めなければ null */
  function parseBundle(text, rosterCount) {
    const data = typeof text === "string" ? parsePayload(text) : text;
    if (!data) return null;
    let list = null;
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data.events)) list = data.events;
    else if (data.v === 1 && (data.event || data.rows)) list = [data];
    else return null;
    const events = [];
    for (const item of list) {
      const ev = normalizeEvent(item, rosterCount);
      if (ev) events.push(ev);
    }
    return events.length ? events : null;
  }
  function exportBundle(events) {
    return { v: 1, events: (events || []).map(cloneEvent) };
  }

  /** 同じ大会名と日付は上書きする。どちらも空なら別大会として足す */
  function upsertEvent(library, ev) {
    const next = cloneEvent(ev);
    const name = next.event.name;
    const date = next.event.date;
    if (name || date) {
      const i = library.findIndex((e) => e.event.name === name && e.event.date === date);
      if (i >= 0) { library[i] = next; return library; }
    }
    library.push(next);
    return library;
  }

  function rowIdentity(evIndex, row, rowIndex) {
    const key = playerKey(row.player);
    if (key) return key;
    return "\0" + evIndex + ":" + rowIndex;
  }

  /** キャラごとの使用人数。同じ選手×同じキャラは1 */
  function countUsage(events) {
    const byChar = new Map();
    const players = new Set();
    (events || []).forEach((ev, ei) => {
      (ev.rows || []).forEach((row, ri) => {
        const who = rowIdentity(ei, row, ri);
        let used = false;
        const seen = new Set();
        for (const ch of row.chars || []) {
          if (!ch || !Number.isInteger(ch.id) || seen.has(ch.id)) continue;
          seen.add(ch.id);
          used = true;
          if (!byChar.has(ch.id)) byChar.set(ch.id, new Set());
          byChar.get(ch.id).add(who);
        }
        if (used || playerKey(row.player)) players.add(who);
      });
    });
    const n = players.size;
    const rows = [];
    byChar.forEach((set, id) => {
      rows.push({ id: id, count: set.size, ratio: n ? set.size / n : 0 });
    });
    rows.sort((a, b) => b.count - a.count || a.id - b.id);
    return { players: n, rows: rows };
  }

  function sortUsage(rows, key, dir, nameOf) {
    const sign = dir === "asc" ? 1 : -1;
    const out = (rows || []).slice();
    out.sort((a, b) => {
      if (key === "name") {
        const c = String(nameOf ? nameOf(a.id) : a.id).localeCompare(String(nameOf ? nameOf(b.id) : b.id), "ja");
        if (c) return c * sign;
      } else if (a.count !== b.count) return a.count < b.count ? -sign : sign;
      return a.id - b.id;
    });
    return out;
  }
  function formatPercent(ratio) {
    if (ratio == null || Number.isNaN(ratio)) return "—";
    const p = Math.round(ratio * 1000) / 10;
    return (p % 1 === 0 ? String(p) : p.toFixed(1)) + "%";
  }

  /** 使用人数の多い順に S〜D へほぼ均等に入れる。0人のキャラは入れない */
  function rankingToTiers(rows) {
    const used = (rows || []).filter((r) => r && r.count > 0).slice().sort((a, b) => b.count - a.count || a.id - b.id);
    const tiers = TIER_SPEC.map((t) => ({ name: t.name, color: t.color }));
    const bands = tiers.map(() => []);
    const n = used.length;
    used.forEach((item, i) => {
      const band = n ? Math.min(tiers.length - 1, Math.floor(i * tiers.length / n)) : 0;
      bands[band].push(item.id);
    });
    return { tiers: tiers, rows: bands };
  }

  const api = {
    TIER_SPEC, MAX_CHARS, playerKey, validSlot, normalizeEvent, defaultEvent, cloneEvent,
    encode, decode, parseBundle, exportBundle, upsertEvent, countUsage, sortUsage, formatPercent, rankingToTiers,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ResultBoard = api;
})(typeof window !== "undefined" ? window : globalThis);
