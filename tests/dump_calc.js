// compare_ufd.py 用: 各キャラの通常技について 発生/全体/最初の判定の硬直差 を出力
const C = require("../src/calc.js");
const d = require("../data/data.json");
const out = {};
for (const ch of d.chars) {
  out[ch.name] = {};
  for (const m of ch.moves) {
    if (!["ground", "aerial"].includes(m.category)) continue;
    if (ch.materials.length && m.material && m.material !== "木材") continue; // スティーブは木材で比較
    const base = m.name.replace(/ \(.*\)$/, "").replace(/（強）$/, "");
    if (out[ch.name][base]) continue;
    // 画面と同じ: 多段は通常の最終段、硬直は大きい方、バウンド行の全体F、アルセーヌと後ろ側は主数値にしない
    const a = C.shieldAdvantage(m);
    out[ch.name][base] = {
      startup: C.startupOf(m),
      total: m.category === "ground" ? (m.rows[0].total ?? null) : null,
      first: a.ok ? a.primary : null,
      stun: a.ok ? [a.primaryStun] : null,
    };
  }
}
process.stdout.write(JSON.stringify(out));
