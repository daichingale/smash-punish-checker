/* キャラ検索用の正規化と読み。表示名は変えない */
(function (root) {
  "use strict";
const toKata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const norm = (s) => toKata(String(s).normalize("NFKC").toLowerCase()).replace(/[\s・&＆.．ー\-'’／/]/g, "");
const charNo = (c) => (c.sheetTab.match(/^(\d+'?)/) || [])[1] || "";
const ALIAS = { "Mii": "ミイ ミー mii", "ドンキーコング": "dk", "Mr.ゲーム&ウォッチ": "ゲムヲ ゲーム&ウォッチ", "Wii Fit トレーナー": "ウィーフィット wiifit",
  "キャプテン・ファルコン": "cf", "ピクミン&オリマー": "オリマー", "ロゼッタ&チコ": "ロゼチコ", "バンジョー&カズーイ": "バンカズ",
  "ゼロスーツサムス": "ゼロサム", "パックンフラワー": "パックン", "トゥーンリンク": "トゥーン", "こどもリンク": "こどリン", "ガノンドロフ": "ガノン" };
// 検索用の読み。表示名は変えない
const READ = { "マリオ": "まりお mario", "ドンキーコング": "どんきーこんぐ donkeykong", "リンク": "りんく link", "サムス": "さむす samus", "ダークサムス": "だーくさむす darksamus",
  "ヨッシー": "よっしー yoshi", "カービィ": "かーびぃ kirby", "フォックス": "ふぉっくす fox", "ピカチュウ": "ぴかちゅう pikachu", "ルイージ": "るいーじ luigi", "ネス": "ねす ness",
  "キャプテン・ファルコン": "きゃぷてんふぁるこん captainfalcon falcon", "プリン": "ぷりん jigglypuff purin", "ピーチ": "ぴーち peach", "デイジー": "でいじー daisy", "クッパ": "くっぱ bowser koopa",
  "アイスクライマー": "あいすくらいまー icies iceclimber", "シーク": "しーく sheik", "ゼルダ": "ぜるだ zelda", "ドクターマリオ": "どくたーまりお drmario doc", "ピチュー": "ぴちゅー pichu",
  "ファルコ": "ふぁるこ falco", "マルス": "まるす marth", "ルキナ": "るきな lucina", "こどもリンク": "こどもりんく younglink", "ガノンドロフ": "がのんどろふ ganondorf",
  "ミュウツー": "みゅうつー mewtwo", "ロイ": "ろい roy", "クロム": "くろむ chrom", "Mr.ゲーム&ウォッチ": "みすたーげーむ gamewatch gnw", "メタナイト": "めたないと metaknight",
  "ピット": "ぴっと pit", "ブラックピット": "ぶらっくぴっと darkpit", "ゼロスーツサムス": "ぜろすーつさむす zerosuit zss", "ワリオ": "わりお wario", "スネーク": "すねーく snake",
  "アイク": "あいく ike", "ゼニガメ": "ぜにがめ squirtle", "フシギソウ": "ふしぎそう ivysaur", "リザードン": "りざーどん charizard", "ディディーコング": "でぃでぃーこんぐ diddykong diddy",
  "リュカ": "りゅか lucas", "ソニック": "そにっく sonic", "デデデ": "ででで dedede", "ピクミン&オリマー": "ぴくみんおりまー olimar pikmin", "ルカリオ": "るかリオ lucario",
  "ロボット": "ろぼっと rob roboto", "トゥーンリンク": "とぅーんりんく toonlink", "ウルフ": "うるふ wolf", "むらびと": "むらびと villager", "ロックマン": "ろっくまん megaman rockman",
  "Wii Fit トレーナー": "うぃーふぃっと wiifittrainer", "ロゼッタ&チコ": "ろぜったちこ rosalina", "リトル・マック": "りとるまっく littlemac", "ゲッコウガ": "げっこうが greninja",
  "格闘Mii": "かくとうみい brawler", "剣術Mii": "けんじゅつみい swordfighter", "射撃Mii": "しゃげきみい gunner", "パルテナ": "ぱるてな palutena", "パックマン": "ぱっくまん pacman",
  "ルフレ": "るふれ robin", "シュルク": "しゅるく shulk", "クッパ Jr.": "くっぱじゅにあ bowserjr", "ダックハント": "だっくはんと duckhunt", "リュウ": "りゅう ryu", "ケン": "けん ken",
  "クラウド": "くらうど cloud", "カムイ": "かむい corrin", "ベヨネッタ": "べよねった bayonetta bayo", "インクリング": "いんくりんぐ inkling", "リドリー": "りどりー ridley",
  "シモン": "しもん simon", "リヒター": "りひたー richter", "キングクルール": "きんぐくるーる kingkrool kkr", "しずえ": "しずえ isabelle", "ガオガエン": "がおがえん incineroar",
  "パックンフラワー": "ぱっくんふらわー piranha plant", "ジョーカー": "じょーかー joker", "勇者": "ゆうしゃ hero", "バンジョー&カズーイ": "ばんじょーかずーい banjo", "テリー": "てりー terry",
  "ベレト／ベレス": "べれとべれす byleth", "ミェンミェン": "みぇんみぇん minmin", "スティーブ／アレックス": "すてぃーぶあれっくす steve alex", "セフィロス": "せふぃろす sephiroth",
  "ホムラ": "ほむら pyra homura", "ヒカリ": "ひかり mythra hikari", "カズヤ": "かずや kazuya", "ソラ": "そら sora" };
const haystack = (c) => norm(c.name + " " + c.sheetTab + " " + (READ[c.name] || "") + " " + Object.keys(ALIAS).filter((k) => c.name.includes(k)).map((k) => ALIAS[k]).join(" "));
// リザルトとティアの選択だけ、集合画像の代表に仲間の名前でも辿り着けるようにする
const groupHaystack = (c) => {
  const extra = c.name === "ゼニガメ" ? "ポケモントレーナー フシギソウ リザードン ふしぎそう りざーどん ivysaur charizard pokemontrainer 34 35"
    : c.name === "ホムラ" ? "ホムラ／ヒカリ ヒカリ ひかり mythra 80"
    : "";
  return haystack(c) + norm(extra);
};
const faceName = (name) => name === "ゼニガメ" ? "ポケモントレーナー" : name === "ホムラ" ? "ホムラ／ヒカリ" : name;

  const api = { norm, charNo, haystack, groupHaystack, faceName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Names = api;
})(typeof window !== "undefined" ? window : globalThis);
