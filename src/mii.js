/* Miiファイターの必殺番号。シートの group（NB1 / 横B2 / 上B3 / 下B1）が
 * 1〜3 で確定できるときだけ番号を付ける。技名と group が食い違うときは付けない。
 * 番号が無い技は絞り込みでも残す（その他）。
 */
(function (root) {
  "use strict";
  const SLOT_RE = /^(NB|横B|上B|下B)([1-3])(?!\d)/;
  const DIR_CODE = { NB: "n", "横B": "s", "上B": "u", "下B": "d" };
  const DIRS = [["n", "通常"], ["s", "横"], ["u", "上"], ["d", "下"]];
  const MII_NAMES = ["格闘Mii", "剣術Mii", "射撃Mii"];
  const SLOTS = [];
  for (let d = 0; d < DIRS.length; d++) {
    for (let n = 1; n <= 3; n++) {
      const code = DIRS[d][0];
      SLOTS.push({ id: code + n, dir: code, num: n, dirLabel: DIRS[d][1], label: DIRS[d][1] + n });
    }
  }
  const SLOT_IDS = SLOTS.map((s) => s.id);

  function parseSlot(text) {
    const m = SLOT_RE.exec(String(text == null ? "" : text).trim());
    return m ? DIR_CODE[m[1]] + m[2] : null;
  }
  /** 必殺番号。確実なときだけ "n1" / "s2" / "u3" / "d1"。それ以外は null */
  function miiSlot(move) {
    if (!move || typeof move !== "object") return null;
    const groupText = move.group != null ? move.group : move.slotGroup;
    const hasGroup = groupText != null && String(groupText) !== "";
    const fromGroup = parseSlot(groupText);
    const fromName = parseSlot(move.name);
    if (fromGroup && fromName && fromGroup !== fromName) return null;
    if (fromGroup) return fromGroup;
    if (!hasGroup) return fromName;
    return null;
  }
  function isMiiName(name) {
    return MII_NAMES.indexOf(name) >= 0;
  }
  function slotLabel(id) {
    for (let i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i].label;
    return "";
  }
  /** 同じチップをもう一度押すと解除。未知の id は今の選択を変えない */
  function toggleSlot(current, id) {
    const cur = SLOT_IDS.indexOf(current) >= 0 ? current : "";
    if (SLOT_IDS.indexOf(id) < 0) return cur;
    return cur === id ? "" : id;
  }
  /** 番号が無い技は残す。slot が空や未知なら絞らない */
  function filterBySlot(moves, slot) {
    const list = moves || [];
    if (!slot || SLOT_IDS.indexOf(slot) < 0) return list.slice();
    return list.filter((m) => {
      const s = miiSlot(m);
      return s == null || s === slot;
    });
  }

  const api = { SLOTS, SLOT_IDS, MII_NAMES, miiSlot, isMiiName, slotLabel, toggleSlot, filterBySlot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MiiSlots = api;
})(typeof window !== "undefined" ? window : globalThis);
