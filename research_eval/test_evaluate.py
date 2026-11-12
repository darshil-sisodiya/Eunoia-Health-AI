"""Synthetic unit fixtures only: never include these in paper results."""
import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import evaluate as e


class MetricTests(unittest.TestCase):
    def test_specialty_confusion_arithmetic(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            e.write_csv(root / "specialty_labels.csv", [
                dict(case_id=str(i), text=f"fixture {i}", expected_specialty=label,
                     reviewer_id="synthetic-test-only", source="unit fixture")
                for i, label in enumerate(["Cardiology", "Cardiology", "Dermatology"])
            ])
            with patch.object(e.mapper, "best_specialization", side_effect=["Cardiology", "Dermatology", "Dermatology"]):
                e.specialty(root, root, {})
            scores = e.read_csv(root / "specialty_summary.csv", ["accuracy", "macro_f1"])[0]
            self.assertAlmostEqual(float(scores["accuracy"]), 2 / 3)
            self.assertAlmostEqual(float(scores["macro_f1"]), 2 / 3)
            self.assertTrue((root / "specialty_confusion.pdf").is_file())

    def test_prescription_missing_extra_and_wrong(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            rows = [dict(document_id="fixture", item_id=str(i), field="dose", expected=a,
                         predicted=b, source="unit fixture", reviewer_id="synthetic-test-only")
                    for i, (a, b) in enumerate([("5 mg", " 5 MG "), ("2 mg", ""), ("3 mg", "4 mg"), ("", "7 mg")])]
            e.write_csv(root / "prescription_fields.csv", rows)
            e.prescriptions(root, root, {})
            result = e.read_csv(root / "prescription_summary.csv", ["exact_match_percent"])[0]
            self.assertAlmostEqual(float(result["exact_match_percent"]), 100 / 3)
            for key in ("missing", "incorrect", "extra_fields"):
                self.assertEqual(int(result[key]), 1)

    def test_usability_failure_remains_in_denominator(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            e.write_csv(root / "usability.csv", [
                dict(participant_id="fixture-a", task="fixture", success=1, duration_seconds=10, errors=0),
                dict(participant_id="fixture-b", task="fixture", success=0, duration_seconds=90, errors=2),
            ])
            e.usability(root, root, {})
            row = e.read_csv(root / "usability_summary.csv", ["completion_percent"])[0]
            self.assertEqual(float(row["completion_percent"]), 50)
            self.assertEqual(float(row["median_success_seconds"]), 10)

    def test_invalid_observations_are_rejected(self):
        with self.assertRaises(ValueError):
            e.number("nan", "latency")
        with self.assertRaises(ValueError):
            e.binary("yes")
        with self.assertRaises(ValueError):
            e.unique([{"id": "same"}, {"id": "same"}], ["id"])


if __name__ == "__main__":
    unittest.main()
