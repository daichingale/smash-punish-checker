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
    // UFD の慣例に合わせる: 多段技は最終段、複数判定はシートに最初に書かれたガード硬直
    const rows = m.rows.filter((r) => r.active && (r.damage == null || Math.max(...r.damage) > 0) && r.stun && (m.category === "aerial" || r.total != null) && !r.label.includes("着地"));
    const seq = rows.some((r) => /Hit|連|〆|派生/.test(r.label));
    const fr = seq ? rows[rows.length - 1] : rows[0];
    let first = null;
    if (fr) {
      if (m.category === "aerial") first = m.landingLag != null ? m.landingLag - fr.stun[0] : null;
      else first = fr.total - (seq ? (fr.active.rehit ? fr.active.end : fr.active.starts[fr.active.starts.length - 1]) : fr.active.starts[0]) - fr.stun[0];
    }
    out[ch.name][base] = { startup: C.startupOf(m), total: m.category === "ground" ? (m.rows[0].total ?? null) : null, first, stun: fr ? fr.stun : null };
  }
}
process.stdout.write(JSON.stringify(out));
