# スマブラSP 確定反撃チェッカー（試作）

相手の技をタップすると、ガードした自分のキャラの反撃候補を「確定 / 不可」と猶予フレームで一覧にする（密着前提）。逆向き（自分の技に対する相手の反撃）も出せる。

## 構成
- `scripts/fetch.py` … 検証窓フレームシート（公開スプレッドシート）から gviz CSV で取得 → `raw/`。`--all` で全ファイタータブ（89: ダッシュファイター・DLC・Mii 含む）。1.5秒間隔、取得済みはキャッシュを使う（`--refresh` で取り直し）
- `scripts/build_data.py` … `raw/` → `data/data.json`。解釈できなかった値は `logs/convert_log.txt`
- 判定は密着前提（リーチ・シールドノックバックは考慮しない）。フレームが間に合えば「確定」。猶予ラベル（シビア/余裕）のしきい値は `src/calc.js` の `THRESHOLDS`。注意バッジは廃止（コマンド入力時間・最速判定前提は「この計算について」に一行で記載）
- キャラ選択は検索（ひらがな・番号・通称）＋3列グリッド。シートが最後の調整より古いキャラは ⚠
- `src/` … `index.html` / `style.css` / `calc.js`（計算ロジック、Node でもブラウザでも動く）/ `app.js`（画面）
- `scripts/build_dist.py` … 全部を埋め込んだ単体HTML `dist/index.html` を作る
- `tests/calc.test.js` … 単体テスト（`node --test tests/`）
- `tests/compare_ufd.py` … Ultimate Frame Data との照合 → `tests/ufd_compare.md`
- `tests/shots.js` … 390px 幅スクリーンショット → `shots/`（playwright-core + /usr/bin/google-chrome）

## 再生成
```
python3 scripts/fetch.py --all && python3 scripts/build_data.py && python3 scripts/build_dist.py
node --test tests/ && python3 tests/compare_ufd.py && node tests/shots.js
```

## 公開
`dist/` をそのまま静的ホスティング（Vercel なら Output Directory = `dist`、ビルドコマンド不要）。`dist/index.html` は単体で動くのでスマホでファイルを開くだけでも使える。
（このリポジトリはまだどこにも公開・プッシュしていない）
