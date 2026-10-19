import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from sportpredict.model import build_features, forecast, load_csv
from sportpredict.service import DEFAULT_DATA, Service


class DataAndModelTests(unittest.TestCase):
    def test_iso_dates_are_not_reversed(self):
        frame = load_csv(b"Date,HomeTeam,AwayTeam,FTHG,FTAG\n2024-08-05,A,B,1,0\n")
        self.assertEqual(str(frame.iloc[0].Date.date()), "2024-08-05")

    def test_invalid_and_duplicate_matches_are_removed(self):
        csv = b"Date,HomeTeam,AwayTeam,FTHG,FTAG\n01/08/2024,A,B,1,0\n01/08/2024,A,B,1,0\n02/08/2024,A,A,1,0\n03/08/2024,A,B,-1,0\n04/08/2024,A,B,1.5,0\n"
        frame = load_csv(csv)
        self.assertEqual(len(frame), 1)
        self.assertEqual(frame.attrs["removed"], 4)

    def test_same_day_outcomes_do_not_enter_features(self):
        frame = load_csv(b"Date,HomeTeam,AwayTeam,FTHG,FTAG\n01/08/2024,A,B,2,0\n01/08/2024,A,C,5,0\n02/08/2024,A,D,0,0\n")
        features, history = build_features(frame)
        self.assertEqual(features.home_form.tolist(), [0.0, 0.0, 3.0])
        self.assertEqual(len(history["A"]), 3)

    def test_forecast_includes_latest_completed_match(self):
        frame = load_csv(DEFAULT_DATA.read_bytes())
        features, history = build_features(frame)
        team = frame.iloc[-1].HomeTeam
        played = frame[(frame.HomeTeam == team) | (frame.AwayTeam == team)]
        self.assertEqual(len(history[team]), len(played))
        self.assertEqual(len(features), len(frame))
        probs = forecast(frame, "Real Madrid", "Barcelona")
        self.assertAlmostEqual(sum(probs.values()), 1.0)
        self.assertEqual(set(probs), {"H", "D", "A"})
        with self.assertRaises(ValueError):
            forecast(frame, "Real Madrid", "Real Madrid")


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "test.db"
        self.service = Service(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_seed_dataset_and_real_temporal_metrics(self):
        self.assertEqual(self.service.summary()["matches"], 380)
        metrics = self.service.statistics()["metrics"]
        self.assertEqual(metrics["training_count"] + metrics["test_count"], 380)
        self.assertGreater(metrics["test_from"], self.service.summary()["from"])
        self.assertLessEqual(metrics["accuracy"], 1)

    def test_replay_never_trains_on_target_or_future_results(self):
        match = self.service.bootstrap()["featured"]
        original = self.service.predict({"match_id": match["id"]})
        mask = self.service.frame.Date >= pd.Timestamp(match["date"])
        self.service.frame.loc[mask, "FTHG"] = 20
        self.service._cache.clear()
        modified = self.service.predict({"match_id": match["id"]})
        self.assertEqual(original["probabilities"], modified["probabilities"])
        self.assertLess(original["as_of"], match["date"])

    def test_profile_and_deduplicated_history_survive_restart(self):
        self.service.update_profile({"name": "Analista prueba", "role": "Docente", "favorite": "Barcelona"})
        match = self.service.bootstrap()["featured"]
        saved = self.service.save_prediction({"match_id": match["id"]})
        again = self.service.save_prediction({"match_id": match["id"], "probabilities": {"H": 1}})
        self.assertEqual(saved["id"], again["id"])
        restarted = Service(self.path)
        self.assertEqual(restarted.profile()["favorite"], "Barcelona")
        self.assertEqual(len(restarted.history()), 1)
        self.assertLess(restarted.history()[0]["probabilities"]["H"], 1)
        restarted.delete_prediction(saved["id"])
        self.assertEqual(restarted.history(), [])

    def test_import_is_validated_before_replacing_database(self):
        old_revision = self.service.revision
        with self.assertRaises(ValueError):
            self.service.import_data(b"Date,HomeTeam,AwayTeam,FTHG,FTAG\n01/08/2024,A,B,2,0\n", "bad.csv")
        self.assertEqual(Service(self.path).revision, old_revision)
        result = self.service.import_data(DEFAULT_DATA.read_bytes(), "new.csv")
        self.assertEqual(result["matches"], 380)
        self.assertIn("new.csv", Service(self.path).source)

    def test_scheduled_match_and_manual_result_update_history(self):
        fixture = self.service.add_fixture({"home": "Real Madrid", "away": "Barcelona",
                                           "date": date.today().isoformat(), "time": "20:00"})
        self.service.save_prediction({"match_id": fixture["id"]})
        self.assertIsNone(self.service.history()[0]["actual"])
        self.service.record_result(fixture["id"], {"home_goals": 1, "away_goals": 1})
        self.assertEqual(self.service.history()[0]["actual"], "D")
        future = self.service.add_fixture({"home": "Barcelona", "away": "Real Madrid",
            "date": (date.today() + timedelta(days=2)).isoformat(), "time": "20:00"})
        with self.assertRaises(ValueError):
            self.service.record_result(future["id"], {"home_goals": 2, "away_goals": 0})


if __name__ == "__main__":
    unittest.main()
