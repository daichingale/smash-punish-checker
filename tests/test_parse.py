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
        for raw in ("1-2 (生成：14F)", "*", "1-?", "20-* ~ 30", "生成：17F", ""):
            self.assertIsNone(bd.parse_active(raw), raw)


class ParseTotal(unittest.TestCase):
    def test_paren_only(self):
        self.assertEqual(bd.parse_total("(77)"), 77)

    def test_leading_digits(self):
        self.assertEqual(bd.parse_total("19 (6)"), 19)
        self.assertEqual(bd.parse_total("42 (+30)"), 42)

    def test_reject_dual_and_delta(self):
        self.assertIsNone(bd.parse_total("地上：21 空中：19"))
        self.assertIsNone(bd.parse_total("(+20)"))


class ParseStun(unittest.TestCase):
    def test_range_uses_both_ends(self):
        self.assertEqual(bd.parse_stun("10F ~ 24F"), ([10, 24], None, None))
        self.assertEqual(bd.parse_stun("5 ~ 6F"), ([5, 6], None, None))

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

    def test_skip_multiple_and_conditional(self):
        self.assertEqual(bd.landing_variant_specs("着地隙：26F（傘・開） 着地隙：40F（傘・閉）"), [])
        self.assertEqual(bd.landing_variant_specs("着地隙：7F (パラシュート)"), [])
        self.assertEqual(bd.landing_variant_specs("着地隙(小)：16F 着地隙(大)：20F"), [])
        self.assertEqual(bd.landing_variant_specs("着地隙：20F (弱, 空振り) 着地隙：28F (弱, ヒット時)"), [])
        self.assertEqual(bd.landing_variant_specs("着地隙は状況による"), [])
        self.assertEqual(bd.landing_variant_specs("着地は相殺なし。"), [])


class ParseDamage(unittest.TestCase):
    def test_range_and_floor(self):
        self.assertEqual(bd.parse_damage("10 ~ 28"), [10.0, 28.0])
        self.assertEqual(bd.parse_damage("1+"), [1.0])

    def test_zero_plus_unknown(self):
        self.assertIsNone(bd.parse_damage("0+"))
        self.assertIsNone(bd.parse_damage("*"))


if __name__ == "__main__":
    unittest.main()
