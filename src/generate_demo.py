#!/usr/bin/env python3
"""Generate deterministic, clearly labeled demo logs for interface QA only."""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pipeline import build_dashboard, write_outputs  # noqa: E402


TASKS = {
    "data_cleaning": {
        "prefix": "DAT",
        "title": "清洗缺失与重复记录",
        "difficulty": 0.43,
        "errors": [
            ("KeyError: missing column 'amount'", "DataSchema"),
            ("TypeError: cannot compare str and float", "TypeError"),
            ("AssertionError: duplicate rows remain", "AssertionError"),
        ],
    },
    "file_processing": {
        "prefix": "FIL",
        "title": "批量重命名与汇总文件",
        "difficulty": 0.53,
        "errors": [
            ("FileNotFoundError: input directory does not exist", "FileNotFound"),
            ("PermissionError: target is read-only", "Other"),
            ("AssertionError: expected 12 files, got 11", "AssertionError"),
        ],
    },
    "visualization": {
        "prefix": "VIS",
        "title": "修复图表数据映射与交互",
        "difficulty": 0.61,
        "errors": [
            ("TypeError: undefined is not iterable", "TypeError"),
            ("AssertionError: expected 3 series, got 2", "AssertionError"),
            ("LogicError: tooltip points to the wrong category", "Logic"),
        ],
    },
}


def add_event(
    events: list[dict],
    clock: datetime,
    *,
    task_id: str,
    task_type: str,
    run_id: str,
    role: str,
    content: str,
    prompt_variant: str,
    event_type: str,
    rng: random.Random,
    result: str = "running",
    tool_call: str | None = None,
    error: str | None = None,
) -> datetime:
    clock += timedelta(seconds=rng.uniform(4.5, 18.0))
    events.append(
        {
            "timestamp": clock.isoformat(),
            "task_id": task_id,
            "task_type": task_type,
            "run_id": run_id,
            "turn_id": len(events) + 1,
            "role": role,
            "content": content,
            "model": "示例模型-v1（非真实实验）",
            "prompt_variant": prompt_variant,
            "event_type": event_type,
            "response_time": round(rng.uniform(1.4, 9.5), 2) if role == "assistant" else None,
            "token_usage": rng.randint(80, 680) if role == "assistant" else None,
            "tool_call": tool_call,
            "error": error,
            "result": result,
            "is_demo": True,
        }
    )
    return clock


def create_run(task_type: str, strategy: str, repeat: int, rng: random.Random, start: datetime) -> list[dict]:
    spec = TASKS[task_type]
    code = "REF" if strategy == "reflect" else "DIR"
    run_id = f"{spec['prefix']}-{code}-{repeat:02d}"
    task_id = f"{spec['prefix']}-{(repeat - 1) % 3 + 1:02d}"
    events: list[dict] = []
    clock = start
    clock = add_event(
        events,
        clock,
        task_id=task_id,
        task_type=task_type,
        run_id=run_id,
        role="user",
        content=f"请完成任务：{spec['title']}，并以自动测试通过作为验收条件。",
        prompt_variant=strategy,
        event_type="receive",
        rng=rng,
    )
    if strategy == "reflect":
        clock = add_event(
            events,
            clock,
            task_id=task_id,
            task_type=task_type,
            run_id=run_id,
            role="assistant",
            content="计划：先检查输入结构，再做最小改动，运行测试并根据错误逐轮修复。",
            prompt_variant=strategy,
            event_type="plan",
            rng=rng,
        )
    clock = add_event(
        events,
        clock,
        task_id=task_id,
        task_type=task_type,
        run_id=run_id,
        role="assistant",
        content="已生成第一版实现，并保留关键边界条件检查。",
        prompt_variant=strategy,
        event_type="code",
        rng=rng,
    )

    anomaly = run_id == "VIS-DIR-07"
    initial_error_probability = spec["difficulty"] - (0.16 if strategy == "reflect" else 0.0)
    has_error = anomaly or rng.random() < initial_error_probability
    if not has_error:
        clock = add_event(
            events,
            clock,
            task_id=task_id,
            task_type=task_type,
            run_id=run_id,
            role="tool",
            content="pytest: 12 passed",
            prompt_variant=strategy,
            event_type="test",
            rng=rng,
            result="success",
            tool_call="pytest",
        )
        add_event(
            events,
            clock,
            task_id=task_id,
            task_type=task_type,
            run_id=run_id,
            role="assistant",
            content="任务完成，全部自动测试通过。",
            prompt_variant=strategy,
            event_type="success",
            rng=rng,
            result="success",
        )
        return events

    error_text, _ = rng.choice(spec["errors"])
    clock = add_event(
        events,
        clock,
        task_id=task_id,
        task_type=task_type,
        run_id=run_id,
        role="tool",
        content=f"pytest failed: {error_text}",
        prompt_variant=strategy,
        event_type="error",
        rng=rng,
        result="failure",
        tool_call="pytest",
        error=error_text,
    )
    if strategy == "reflect" or rng.random() < 0.55:
        clock = add_event(
            events,
            clock,
            task_id=task_id,
            task_type=task_type,
            run_id=run_id,
            role="assistant",
            content=f"诊断：失败与 {error_text.split(':')[0]} 对应，先验证输入假设，再定位最小修复点。",
            prompt_variant=strategy,
            event_type="diagnose",
            rng=rng,
        )

    max_rounds = 5 if anomaly else (rng.randint(1, 2) if strategy == "reflect" else rng.randint(1, 4))
    will_succeed = False if anomaly else rng.random() < (0.93 if strategy == "reflect" else 0.72)
    success_round = rng.randint(1, max_rounds) if will_succeed else max_rounds + 1
    for round_no in range(1, max_rounds + 1):
        clock = add_event(
            events,
            clock,
            task_id=task_id,
            task_type=task_type,
            run_id=run_id,
            role="assistant",
            content=f"第 {round_no} 轮修复：调整边界条件并补充防御式检查。",
            prompt_variant=strategy,
            event_type="fix",
            rng=rng,
        )
        passed = round_no >= success_round
        clock = add_event(
            events,
            clock,
            task_id=task_id,
            task_type=task_type,
            run_id=run_id,
            role="tool",
            content="pytest: 12 passed" if passed else f"pytest failed again: {error_text}",
            prompt_variant=strategy,
            event_type="test" if passed else "error",
            rng=rng,
            result="success" if passed else "failure",
            tool_call="pytest",
            error=None if passed else error_text,
        )
        if passed:
            add_event(
                events,
                clock,
                task_id=task_id,
                task_type=task_type,
                run_id=run_id,
                role="assistant",
                content="修复完成，回归测试全部通过。",
                prompt_variant=strategy,
                event_type="success",
                rng=rng,
                result="success",
            )
            return events

    add_event(
        events,
        clock,
        task_id=task_id,
        task_type=task_type,
        run_id=run_id,
        role="assistant",
        content="达到修复轮次上限，保留失败日志并终止本次运行。",
        prompt_variant=strategy,
        event_type="stop",
        rng=rng,
        result="failure",
    )
    return events


def main() -> None:
    rng = random.Random(20261011)
    base = datetime(2026, 9, 18, 9, 0, tzinfo=timezone(timedelta(hours=8)))
    all_events: list[dict] = []
    run_offset = 0
    for task_type in TASKS:
        for strategy in ("direct", "reflect"):
            for repeat in range(1, 11):
                all_events.extend(
                    create_run(task_type, strategy, repeat, rng, base + timedelta(minutes=run_offset * 11))
                )
                run_offset += 1

    raw_path = ROOT / "data" / "raw" / "demo_messages.jsonl"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    with raw_path.open("w", encoding="utf-8") as handle:
        for event in all_events:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    payload = build_dashboard(
        all_events,
        mode="demo",
        source_label="确定性演示数据（seed=20261011，仅用于界面验收）",
    )
    write_outputs(
        payload,
        ROOT / "data" / "processed" / "dashboard.json",
        ROOT / "app" / "data.js",
    )
    print(
        f"演示数据已生成：{payload['metadata']['message_count']} 条事件，"
        f"{payload['metadata']['run_count']} 次运行。"
    )


if __name__ == "__main__":
    main()

