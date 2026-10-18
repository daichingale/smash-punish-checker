// スマホ幅 390px でのスクリーンショット（playwright-core + システムの Google Chrome）
const { chromium } = require("playwright-core");
const path = require("path");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const url = "file://" + path.resolve(__dirname, "../dist/index.html");
  const names = await (async () => { await page.goto(url); return page.evaluate(() => window.__DATA__.chars.map((c) => c.name)); })();
  const idx = (n) => names.findIndex((x) => x.startsWith(n));
  const shots = path.resolve(__dirname, "../shots");

  // 1) 自分=クラウド / 相手=マリオ、相手の上強をタップ
  await page.goto(url + `#me=${idx("クラウド")}&opp=${idx("マリオ")}`);
  await page.reload();
  await page.click(".mv:has-text('上強')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/01_cloud_vs_mario_utilt.png`, fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/01b_full.png`, fullPage: true });

  // 2) 自分=リュウ / 相手=カズヤ、コマンド技（雷神拳）
  await page.goto(url + `#me=${idx("リュウ")}&opp=${idx("カズヤ")}`);
  await page.reload();
  await page.click(".mv:has-text('雷神拳')");
  await page.waitForTimeout(600);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/02_ryu_vs_kazuya_raijin.png`, fullPage: false });

  // 3) 逆モード: 自分=スティーブ（鉄）/ 相手=ソラ、自分の横スマ
  await page.goto(url + `#me=${idx("スティーブ")}&opp=${idx("ソラ")}`);
  await page.reload();
  await page.click("#modeB");
  await page.click(".chip:has-text('鉄')");
  await page.click(".mv:has-text('横スマッシュ')");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/03_steve_iron_reverse.png`, fullPage: true });

  // 4) 新規キャラ: 自分=テリー / 相手=ケン 鉈落とし蹴り（コマンド専用ワザ）
  await page.goto(url + `#me=${idx("テリー")}&opp=${idx("ケン")}`);
  await page.reload();
  await page.click(".mv:has-text('鉈落とし蹴り')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/04_terry_vs_ken_natade.png`, fullPage: false });

  // 5) キャラ選択（89体）: グリッド表示と「ひらがな」検索
  await page.goto(url + `#me=${idx("マリオ")}&opp=${idx("ピーチ")}`);
  await page.reload();
  await page.click("#oppBtn");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/05_picker_grid.png`, fullPage: false });
  await page.fill("#pkQ", "みい");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/06_picker_search_mii.png`, fullPage: false });
  await page.click(".ch:has-text('剣術Mii')");
  const picked = await page.textContent("#oppBtn");
  if (!/剣術Mii/.test(picked)) errors.push("picker selection failed: " + picked);

  // 自動チェック: 全キャラ×全技でエラーが出ないか（1組だけでなく全組み合わせ）
  const res = await page.evaluate(() => {
    const C = window.PunishCalc, D = window.__DATA__; let n = 0, ok = 0, sure = 0, imp = 0, severe = 0, easy = 0, withCaution = 0;
    for (const a of D.chars) for (const m of a.moves) for (const d of D.chars) { if (m.category === "grab") continue; const r = C.evaluate(a, m, d, {}); n++; if (r.adv.ok) ok++; for (const x of r.list) { if (x.status === "sure") { sure++; if (x.tier === "severe") severe++; if (x.tier === "easy") easy++; if ("caution" in x) withCaution++; } else imp++; } }
    return { chars: D.chars.length, n, ok, sure, imp, severe, easy, withCaution, cautionBadgesInDom: document.querySelectorAll(".t2.caution").length };
  });
  console.log(JSON.stringify({ errors, res }));
  await browser.close();
})();
