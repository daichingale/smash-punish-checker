"""フレーム表記パーサの単体テスト。自信が無い形は None のままにする。"""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("build_data", ROOT / "scripts" / "build_data.py")
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)


class ParseActive(unittest.TestCase):
    def test_open_end(self):
        a = bd.parse_active("20-*")
        self.assertEqual(a["starts"], [20])
        self.assertTrue(a["open"])
        self.assertFalse(a["rehit"])

    def test_paren_open(self):
        a = bd.parse_active("(28-*)")
        self.assertEqual(a["starts"], [28])
        self.assertTrue(a["open"])

    def test_outside_window_only(self):
        a = bd.parse_active("79-126 (199-246)")
        self.assertEqual(a["starts"], [79])
        self.assertEqual(a["end"], 126)
        self.assertNotIn("open", a)

    def test_rehit_note_stripped(self):
        a = bd.parse_active("16-* (Rehit: 40)")
        self.assertEqual(a["starts"], [16])
        self.assertTrue(a["open"])
        self.assertTrue(a["rehit"])

    def test_reflect_is_not_rehit(self):
        a = bd.parse_active("12-14 (反射：7-20F)")
        self.assertEqual(a["starts"], [12])
        self.assertEqual(a["end"], 14)
        self.assertFalse(a["rehit"])

    def test_multi_window(self):
        a = bd.parse_active("15-22 15-17")
        self.assertEqual(a["starts"], [15, 15])
        self.assertEqual(a["end"], 22)

    def test_dash_in_paren(self):
        a = bd.parse_active("7 (-)")
        self.assertEqual(a["starts"], [7])
        self.assertEqual(a["end"], 7)
        self.assertNotIn("open", a)

    def test_fastest_of_two_windows(self):
        a = bd.parse_active("7-12 (27-32)")
        self.assertEqual(a["starts"], [7])
        self.assertEqual(a["end"], 12)

    def test_reject_ambiguous(self):
        for raw in ("1-2 (生成：14F)", "*", "1-?", "20-* ~ 30", "生成：17F", "", "9-11, 14-16, ..."):
            self.assertIsNone(bd.parse_active(raw), raw)

    def test_skip_window_whose_end_is_before_the_start(self):
        a = bd.parse_active("6-7, 10-11, 14-15, 18-19, 22-12, 26-27")
        self.assertEqual(a["starts"], [6, 10, 14, 18, 26])
        self.assertEqual(a["end"], 27)
        self.assertIsNone(bd.parse_active("22-12"))

    def test_ellipsis_inside_paren_keeps_the_outside_frames(self):
        raw = "12, 15, 18, 24, 27, 30, 36, 39, 42, 48, 51, 54 (, 60, 63, 66...) (Rehit: 12)"
        a = bd.parse_active(raw)
        self.assertEqual(a["starts"], [12, 15, 18, 24, 27, 30, 36, 39, 42, 48, 51, 54])
        self.assertEqual(a["end"], 54)
        self.assertTrue(a["rehit"])
        self.assertNotIn("open", a)


class ParseTotal(unittest.TestCase):
    def test_paren_only(self):
        self.assertEqual(bd.parse_total("(77)"), 77)

    def test_leading_digits(self):
        self.assertEqual(bd.parse_total("19 (6)"), 19)
        self.assertEqual(bd.parse_total("42 (+30)"), 42)

    def test_closed_range_is_the_smaller_end(self):
        self.assertEqual(bd.closed_ends("7 ~ 24", "plain"), (7, 24))
        self.assertEqual(bd.closed_ends("66 ~ 48", "plain"), (48, 66))
        self.assertEqual(bd.closed_ends("10F ~ 24F", "plain"), (10, 24))
        self.assertEqual(bd.closed_ends("7〜24", "plain"), (7, 24))
        self.assertEqual(bd.parse_total("7 ~ 24"), 7)

    def test_reject_dual_and_delta(self):
        self.assertIsNone(bd.parse_total("地上：21 空中：19"))
        self.assertIsNone(bd.parse_total("(+20)"))
        self.assertIsNone(bd.closed_ends("49 (+9~20)", "plain"))
        self.assertEqual(bd.parse_total("49 (+9~20)"), 49)
        self.assertIsNone(bd.closed_ends("20 (8)", "plain"))
        self.assertIsNone(bd.closed_ends("10 ~ 24F", "plain"))


class ParseStun(unittest.TestCase):
    def test_range_uses_both_ends(self):
        self.assertEqual(bd.parse_stun("10F ~ 24F"), ([10, 24], None, None))
        self.assertEqual(bd.parse_stun("5 ~ 6F"), ([5, 6], None, None))
        self.assertEqual(bd.closed_ends("10F 〜 24F", "stun"), (10, 24))
        self.assertIsNone(bd.closed_ends("~ 5F", "stun"))
        self.assertIsNone(bd.closed_ends("8F ~ (10F)", "stun"))
        self.assertIsNone(bd.closed_ends("10F+", "stun"))

    def test_skip_reasons(self):
        self.assertEqual(bd.span_skip_reason("49 (+9~20)"), "加算の幅（基準値に足す量で、全体の両端ではない）")
        self.assertEqual(bd.span_skip_reason("8F ~ (10F)"), "片側が括弧（ボタン/コマンドか幅か決められない）")
        self.assertEqual(bd.span_skip_reason("~ 5F"), "起点が無い")
        self.assertIn("疑問符", bd.span_skip_reason("7 ~ 10?"))

    def test_glued_frames(self):
        self.assertEqual(bd.parse_stun("10F10F/12F"), ([10, 10, 12], None, None))

    def test_button_command_split(self):
        self.assertEqual(bd.parse_stun("10F/(12F)"), ([10], [12], "cmd"))

    def test_command_only(self):
        self.assertEqual(bd.parse_stun("(16F)"), (None, [16], "cmdonly"))

    def test_reject_open_upper(self):
        for raw in ("10F+", "~ 5F", "8F ~ (10F)", "11F+/10F+"):
            b, c, _ = bd.parse_stun(raw)
            self.assertIsNone(b, raw)
            self.assertIsNone(c, raw)


class VersionSplit(unittest.TestCase):
    def test_duplicate_block_only(self):
        rows = [
            {"label": "地上", "total": 53},
            {"label": "地上, 持続", "total": 53},
            {"label": "空中", "total": 60},
            {"label": "空中, 持続", "total": 60},
        ]
        g, a = bd.split_version_rows({"rows": rows})
        self.assertEqual([r["label"] for r in g], ["地上", "地上, 持続"])
        self.assertEqual([r["label"] for r in a], ["空中", "空中, 持続"])

    def test_partial_tags_are_not_split(self):
        rows = [
            {"label": "行き", "total": 45},
            {"label": "空振り, 地上", "total": 59},
            {"label": "空振り, 空中", "total": 45},
        ]
        self.assertIsNone(bd.split_version_rows({"rows": rows}))
        self.assertIsNone(bd.split_version_rows({"rows": [
            {"label": "通常射撃 (地上)"}, {"label": "通常射撃 (空中)"}, {"label": "前回避射撃"},
        ]}))


class LandingNote(unittest.TestCase):
    def test_single_plain(self):
        self.assertEqual(
            bd.landing_variant_specs("着地隙：12F 着弾の1F後に発火。 火柱は相殺なし。"),
            [{"lag": 12, "label": "空中（着地）"}],
        )

    def test_repeated_same_value(self):
        self.assertEqual(
            bd.landing_variant_specs("着地隙：12F\n着地隙：12F"),
            [{"lag": 12, "label": "空中（着地）"}],
        )

    def test_named_pair_keeps_each_label(self):
        self.assertEqual(
            bd.landing_variant_specs("着地隙：26F（傘・開） 着地隙：40F（傘・閉）"),
            [
                {"lag": 26, "name": "傘・開", "label": "空中（着地）"},
                {"lag": 40, "name": "傘・閉", "label": "空中（着地）"},
            ],
        )
        self.assertEqual(
            bd.landing_variant_specs("着地隙(小)：16F 着地隙(大)：20F"),
            [
                {"lag": 16, "name": "小", "label": "空中（着地）"},
                {"lag": 20, "name": "大", "label": "空中（着地）"},
            ],
        )
        self.assertEqual(
            bd.landing_variant_specs("着地隙：20F (弱, 空振り) 着地隙：28F (弱, ヒット時)"),
            [
                {"lag": 20, "name": "弱, 空振り", "label": "空中（着地）"},
                {"lag": 28, "name": "弱, ヒット時", "label": "空中（着地）"},
            ],
        )

    def test_skip_unreadable_and_single_conditional(self):
        self.assertEqual(bd.landing_variant_specs("着地隙：7F (パラシュート)"), [])
        self.assertEqual(bd.landing_variant_specs("着地隙：15F 着地隙：22F"), [])
        self.assertEqual(bd.landing_variant_specs("着地隙は状況による"), [])
        self.assertEqual(bd.landing_variant_specs("着地は相殺なし。"), [])

    def test_plan_splits_named_and_keeps_plain(self):
        plain = {"category": "special", "rows": [
            {"label": "始", "rowNote": "着地隙：12F", "active": {"starts": [8]}, "stun": [3], "damage": [4]},
        ]}
        self.assertEqual(bd.landing_plan(plain), {"lag": 12})
        peach = {"variant": "地上・空中", "rows": [
            {"label": "〆", "rowNote": "着地隙：26F（傘・開） 着地隙：40F（傘・閉）", "active": {"starts": [31]}, "stun": [5], "damage": [4]},
        ]}
        self.assertEqual(bd.landing_plan(peach), {"cases": [
            {"name": "傘・開", "lag": 26}, {"name": "傘・閉", "lag": 40},
        ]})
        one = {"rows": [{"label": "Hit 1", "rowNote": "着地隙：7F (パラシュート)", "active": {"starts": [3]}, "stun": [4], "damage": [3]}]}
        self.assertIsNone(bd.landing_plan(one))
        empty = {"rows": [{"label": "", "rowNote": "着地隙：19F (飛行) 着地隙：30F (尻もち)"}]}
        self.assertIsNone(bd.landing_plan(empty))

    def test_plan_keeps_only_the_version_named_in_the_note(self):
        note = "着地隙：15F (通常, 弱) 着地隙：23F (通常, 強) 着地隙：10F (コマンド, 弱) 着地隙：15F (コマンド, 強)"
        weak = {"variant": "通常", "input": "button", "strength": "弱", "rows": [
            {"label": "Hit 1", "rowNote": note, "active": {"starts": [10]}, "stun": [5], "damage": [4]},
        ]}
        self.assertEqual(bd.landing_plan(weak), {"lag": 15})
        down = {"variant": "弱", "input": "button", "rows": [
            {"label": "Hit 1", "rowNote": "着地隙：20F (弱, 空振り) 着地隙：28F (弱, ヒット時) 着地隙：24F (強, 空振り)", "active": {"starts": [6]}, "stun": [2], "damage": [1]},
        ]}
        self.assertEqual(bd.landing_plan(down), {"cases": [
            {"name": "弱, 空振り", "lag": 20}, {"name": "弱, ヒット時", "lag": 28},
        ]})

    def test_plan_keeps_the_named_hit_and_drops_a_row_with_no_stun(self):
        # 移動は行があるが判定も硬直も無い。攻撃は行名と一致する。踏みつけは着地隙が書いていない。
        move = {"variant": "地上・空中", "rows": [
            {"label": "移動", "rowNote": "着地隙：8F (移動) 着地隙：35F (攻撃)", "active": None, "stun": None},
            {"label": "攻撃, 対地", "rowNote": "", "active": {"starts": [9]}, "stun": [13], "damage": [14]},
            {"label": "踏みつけ", "rowNote": "", "active": {"starts": [1]}, "stun": [8], "damage": [8]},
        ]}
        self.assertEqual(bd.landing_plan(move), {"cases": [
            {"name": "攻撃", "lag": 35, "labels": ["攻撃, 対地"]},
        ]})

    def test_plan_keeps_a_kick_when_the_other_lag_has_no_shield_row(self):
        move = {"variant": "地上・空中", "rows": [
            {"label": "つかみ, 対地", "rowNote": "着地隙：26F (移行前) 着地隙：18F (キック)", "active": {"starts": [18]}, "stun": None, "damage": None},
            {"label": "キック", "rowNote": "", "active": {"starts": [6]}, "stun": [13, 11], "damage": [14, 12]},
            {"label": "キック, 持続", "rowNote": "", "active": {"starts": [11]}, "stun": [11, 10], "damage": [12, 10]},
        ]}
        self.assertEqual(bd.landing_plan(move), {"cases": [
            {"name": "キック", "lag": 18, "labels": ["キック", "キック, 持続"]},
        ]})

    def test_plan_defers_when_an_unnamed_hit_could_belong_to_another_lag(self):
        # 通常・攻撃はどの行にも当たらない。最速はガードできるので、バウンドだけにすると対応が推測になる。
        sheik = {"variant": "地上・空中", "rows": [
            {"label": "最速", "rowNote": "着地隙：21F (通常) 着地隙：35F (攻撃) 着地隙：19F (バウンド)", "active": {"starts": [18]}, "stun": [10], "damage": [11]},
            {"label": "バウンド, 最速", "rowNote": "", "active": {"starts": [22]}, "stun": [12], "damage": [13]},
        ]}
        self.assertIsNone(bd.landing_plan(sheik))
        # 行が空で硬直も無い回復は、条件が読めても計算しない。
        empty = {"rows": [{"label": "", "rowNote": "着地隙：19F (飛行) 着地隙：30F (尻もち)"}]}
        self.assertIsNone(bd.landing_plan(empty))

    def test_plan_scopes_gun_shots_including_a_parsed_burst(self):
        burst = bd.parse_active("12, 15, 18, 24, 27, 30, 36, 39, 42, 48, 51, 54 (, 60, 63, 66...) (Rehit: 12)")
        self.assertIsNotNone(burst)
        gun = {"variant": "ガン", "rows": [
            {"label": "通常射撃", "rowNote": "着地隙：10F (通常射撃/回避射撃) 着地隙：20F (乱れ撃ち)", "active": {"starts": [12]}, "stun": [6], "damage": [5]},
            {"label": "前回避射撃", "rowNote": "", "active": {"starts": [20]}, "stun": [6], "damage": [6]},
            {"label": "乱れ撃ち (空中上入力)", "rowNote": "", "active": burst, "stun": [4], "damage": [3]},
        ]}
        plan = bd.landing_plan(gun)
        self.assertEqual(plan["cases"][0]["lag"], 10)
        self.assertEqual(plan["cases"][0]["labels"], ["通常射撃", "前回避射撃"])
        self.assertEqual(plan["cases"][1]["labels"], ["乱れ撃ち (空中上入力)"])


class ParseDamage(unittest.TestCase):
    def test_range_and_floor(self):
        self.assertEqual(bd.parse_damage("10 ~ 28"), [10.0, 28.0])
        self.assertEqual(bd.parse_damage("1+"), [1.0])

    def test_slash_hitboxes(self):
        self.assertEqual(bd.parse_damage("7/4"), [7.0, 4.0])
        self.assertEqual(bd.parse_damage("7/5"), [7.0, 5.0])
        self.assertEqual(bd.parse_damage("14.7/17.8"), [14.7, 17.8])

    def test_zero_plus_unknown(self):
        self.assertIsNone(bd.parse_damage("0+"))
        self.assertIsNone(bd.parse_damage("*"))


if __name__ == "__main__":
    unittest.main()
