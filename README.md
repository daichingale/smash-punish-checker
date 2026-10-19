# スマブラSP 確定反撃チェッカー（試作）

相手の技をタップすると、ガードした自分のキャラの反撃候補を「確定 / 不可」と猶予フレームで一覧にする（密着前提）。逆向き（自分の技に対する相手の反撃）も出せる。

## 構成
- `scripts/fetch.py` … 検証窓フレームシート（公開スプレッドシート）から gviz CSV で取得 → `raw/`。`--all` で全ファイタータブ（89: ダッシュファイター・DLC・Mii 含む）。1.5秒間隔、取得済みはキャッシュを使う（`--refresh` で取り直し）
- `scripts/build_data.py` … `raw/` → `data/data.json`。解釈できなかった値は `logs/convert_log.txt`
- 判定は密着前提（リーチ・シールドノックバックは考慮しない）。フレームが間に合えば「確定」。猶予ラベル（シビア/余裕）のしきい値は `src/calc.js` の `THRESHOLDS`。注意バッジは廃止（コマンド入力時間・最速判定前提は「この計算について」に一行で記載）
- 必殺ワザの備考に条件のない着地隙が一つだけある技は「空中（着地）」（着地隙 − ガード硬直、着地直前）。地上と空中で全体Fが連続ブロックになっている技はそれぞれの数値。判定欄が空の空中版は、行名が一致するときだけ地上版の判定を使う
- キャラ選択は検索（ひらがな・ローマ字・番号・通称）＋最近使ったキャラ。技は種類のチップで絞り、結果は有利Fを大きく出す。ガードキャンセルを先に、シールド解除は折りたたみ。技を選ぶとヘッダーが1行になり、画面下に「逆 / ジャスト / 内訳」。戻るは URL のハッシュに従う。配色は OS のライト/ダークに合わせる。`dist/` にはオフライン用の service worker も出す。シートが最後の調整より古いキャラは ⚠
- `src/` … `index.html` / `style.css` / `calc.js`（計算ロジック、Node でもブラウザでも動く）/ `names.js`（キャラ検索）/ `app.js`（画面）。全技のランキングは `table.html`（`table.js` / `table-page.js`）。表は `dist/data.json` を読み、反撃チェックの HTML には表の分を足さない
- `scripts/build_dist.py` … 全部を埋め込んだ単体HTML `dist/index.html` と、表用の `dist/table.html`・`dist/data.json` を作る
- `tests/calc.test.js` / `tests/parse.test.js` / `tests/table.test.js` … 単体テスト（`npm test`。Node 22 ではディレクトリ指定だと失敗するためファイルを直接指定する）
- `tests/compare_ufd.py` … Ultimate Frame Data との照合 → `tests/ufd_compare.md`
- `tests/shots.js` … 390px 幅スクリーンショット → `shots/`（playwright-core + /usr/bin/google-chrome）

## 再生成
```
python3 scripts/fetch.py --all && python3 scripts/build_data.py && python3 scripts/build_dist.py
node --test tests/calc.test.js tests/parse.test.js && python3 -m unittest tests/test_parse.py && python3 tests/compare_ufd.py && node tests/shots.js
```

## 公開
https://smash-punish-checker.vercel.app で公開している。`main` への push で Vercel が `dist/` を自動デプロイする（Output Directory = `dist`、ビルドコマンド不要）。`dist/index.html` は単体で動くので、スマホにファイルを渡して開くだけでも使える。
