#!/usr/bin/env python3
"""Pre-submission checks for TRACE processed dashboard data."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SENSITIVE_PATTERNS = {
    "邮箱": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "中国大陆手机号": re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    "常见密钥": re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b"),
    "用户绝对路径": re.compile(r"/(?:Users|home)/[^/\s]+"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate processed TRACE data before submission.")
    parser.add_argument("path", type=Path)
    parser.add_argument("--allow-demo", action="store_true")
    args = parser.parse_args()
    payload = json.loads(args.path.read_text(encoding="utf-8"))
    metadata = payload.get("metadata", {})
    runs = payload.get("runs", [])
    checks: list[tuple[str, bool, str]] = []

    mode_label = "真实采集数据" if metadata.get("mode") == "real" else "演示数据（已显式允许）"
    checks.append(("数据模式可用于本次检查", metadata.get("mode") == "real" or args.allow_demo, mode_label))
    checks.append(("消息数不少于 150", metadata.get("message_count", 0) >= 150, str(metadata.get("message_count", 0))))
    task_types = {run.get("task_type") for run in runs}
    strategies = {run.get("prompt_variant") for run in runs}
    checks.append(("至少 3 类任务", len(task_types) >= 3, ", ".join(sorted(map(str, task_types)))))
    checks.append(("至少 2 种策略", len(strategies) >= 2, ", ".join(sorted(map(str, strategies)))))
    checks.append(("每次运行都有最终状态", all(run.get("final_status") in {"success", "failure"} for run in runs), f"{len(runs)} 次运行"))
    checks.append(("每次运行事件顺序唯一", all(len({event.get('turn_id') for event in run.get('events', [])}) == len(run.get('events', [])) for run in runs), "turn_id"))

    all_text = "\n".join(
        str(event.get("content") or "") + "\n" + str(event.get("error") or "")
        for run in runs
        for event in run.get("events", [])
    )
    for label, pattern in SENSITIVE_PATTERNS.items():
        checks.append((f"无{label}残留", pattern.search(all_text) is None, label))

    failed = False
    for label, ok, detail in checks:
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {label}：{detail}")
        failed = failed or not ok
    if failed:
        sys.exit(1)
    print("交付前数据检查通过。")


if __name__ == "__main__":
    main()

