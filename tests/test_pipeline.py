import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pipeline import aggregate_runs, anonymize_text, classify_error, normalize_event


class PipelineTests(unittest.TestCase):
    def test_anonymization(self):
        text = anonymize_text(
            "联系 test@example.com 或 13812345678；令牌 sk-abcdefghijklmnop；路径 /Users/alice/project"
        )
        self.assertNotIn("test@example.com", text)
        self.assertNotIn("13812345678", text)
        self.assertNotIn("sk-abcdefghijklmnop", text)
        self.assertNotIn("alice", text)
        self.assertIn("[EMAIL]", text)
        self.assertIn("[PHONE]", text)
        self.assertIn("[SECRET]", text)

    def test_error_classification(self):
        self.assertEqual(classify_error("KeyError: missing column amount"), "DataSchema")
        self.assertEqual(classify_error("TypeError: bad operand"), "TypeError")
        self.assertIsNone(classify_error(None))

    def test_run_aggregation(self):
        raw = [
            {
                "timestamp": "2026-01-01T00:00:00+08:00",
                "task_id": "T1",
                "task_type": "data_cleaning",
                "run_id": "R1",
                "turn_id": 1,
                "role": "user",
                "content": "任务",
                "prompt_variant": "direct",
                "event_type": "receive",
            },
            {
                "timestamp": "2026-01-01T00:00:08+08:00",
                "task_id": "T1",
                "task_type": "data_cleaning",
                "run_id": "R1",
                "turn_id": 2,
                "role": "tool",
                "content": "all passed",
                "prompt_variant": "direct",
                "event_type": "test",
                "tool_call": "pytest",
                "result": "success",
            },
        ]
        run = aggregate_runs([normalize_event(row, i) for i, row in enumerate(raw)])[0]
        self.assertEqual(run["final_status"], "success")
        self.assertTrue(run["first_pass"])
        self.assertEqual(run["duration_sec"], 8.0)
        self.assertEqual(run["tool_calls"], 1)


if __name__ == "__main__":
    unittest.main()

