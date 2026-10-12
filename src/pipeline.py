#!/usr/bin/env python3
"""TRACE data pipeline: normalize, anonymize, classify, and aggregate JSONL logs."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


ACTION_LABELS = {
    "receive": "接收任务",
    "plan": "规划",
    "code": "生成代码",
    "tool": "执行工具",
    "error": "检测错误",
    "diagnose": "诊断",
    "fix": "修复",
    "test": "验证",
    "success": "完成",
    "stop": "终止",
    "clarify": "澄清",
}

ROLE_MAP = {"agent": "assistant", "human": "user", "function": "tool"}

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)")
TOKEN_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b"
)
USER_PATH_RE = re.compile(r"/(?:Users|home)/[^/\s]+")

ERROR_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("SyntaxError", re.compile(r"syntaxerror|语法错误", re.I)),
    ("TypeError", re.compile(r"typeerror|类型错误", re.I)),
    ("AssertionError", re.compile(r"assertionerror|assert\s+failed|断言", re.I)),
    ("FileNotFound", re.compile(r"filenotfound|no such file|找不到文件", re.I)),
    ("DataSchema", re.compile(r"schema|missing column|keyerror|字段|列缺失", re.I)),
    ("Dependency", re.compile(r"modulenotfound|importerror|dependency|依赖", re.I)),
    ("Network/API", re.compile(r"timeout|connection|rate.?limit|http\s*[45]\d\d|网络|接口", re.I)),
    ("Logic", re.compile(r"wrong answer|expected .* got|逻辑|结果不一致", re.I)),
]

EVENT_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("plan", re.compile(r"计划|步骤|plan|approach", re.I)),
    ("diagnose", re.compile(r"根因|诊断|原因|traceback|because", re.I)),
    ("fix", re.compile(r"修复|修改|patch|fix", re.I)),
    ("test", re.compile(r"pytest|测试|验证|test", re.I)),
    ("code", re.compile(r"```|代码|function|def\s+|const\s+", re.I)),
    ("clarify", re.compile(r"请确认|能否提供|clarif|which file", re.I)),
]


def anonymize_text(value: Any) -> str:
    """Replace common identifiers while preserving analytical meaning."""
    if value is None:
        return ""
    text = str(value)
    text = EMAIL_RE.sub("[EMAIL]", text)
    text = PHONE_RE.sub("[PHONE]", text)
    text = TOKEN_RE.sub("[SECRET]", text)
    text = USER_PATH_RE.sub("/[USER]", text)
    return text


def classify_error(value: Any) -> str | None:
    text = anonymize_text(value).strip()
    if not text:
        return None
    for label, pattern in ERROR_RULES:
        if pattern.search(text):
            return label
    return "Other"


def infer_event_type(event: dict[str, Any]) -> str:
    explicit = str(event.get("event_type") or "").strip().lower()
    if explicit in ACTION_LABELS:
        return explicit
    if event.get("error"):
        return "error"
    result = str(event.get("result") or "").lower()
    if result == "success":
        return "success"
    if result == "failure":
        return "stop"
    if event.get("tool_call"):
        return "tool"
    content = anonymize_text(event.get("content"))
    for label, pattern in EVENT_RULES:
        if pattern.search(content):
            return label
    role = ROLE_MAP.get(str(event.get("role") or "").lower(), str(event.get("role") or "").lower())
    return "receive" if role == "user" else "code"


def parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_event(raw: dict[str, Any], index: int = 0) -> dict[str, Any]:
    event_type = infer_event_type(raw)
    role = ROLE_MAP.get(str(raw.get("role") or "assistant").lower(), str(raw.get("role") or "assistant").lower())
    if role not in {"user", "assistant", "tool"}:
        role = "assistant"
    response_time = raw.get("response_time")
    token_usage = raw.get("token_usage")
    normalized = {
        "timestamp": raw.get("timestamp"),
        "task_id": str(raw.get("task_id") or "unknown-task"),
        "task_type": str(raw.get("task_type") or "unknown"),
        "run_id": str(raw.get("run_id") or f"unknown-run-{index}"),
        "turn_id": int(raw.get("turn_id") or index + 1),
        "role": role,
        "content": anonymize_text(raw.get("content")),
        "model": str(raw.get("model") or "unknown"),
        "prompt_variant": str(raw.get("prompt_variant") or "unknown"),
        "event_type": event_type,
        "action": ACTION_LABELS[event_type],
        "response_time": float(response_time) if response_time not in (None, "") else None,
        "token_usage": int(token_usage) if token_usage not in (None, "") else None,
        "tool_call": anonymize_text(raw.get("tool_call")) or None,
        "error": anonymize_text(raw.get("error")) or None,
        "error_type": classify_error(raw.get("error")),
        "result": str(raw.get("result") or "running").lower(),
        "is_demo": bool(raw.get("is_demo", False)),
    }
    return normalized


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no} 不是合法 JSON: {exc}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"{path}:{line_no} 必须是 JSON 对象")
            rows.append(item)
    return rows


def aggregate_runs(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        grouped[event["run_id"]].append(event)

    runs: list[dict[str, Any]] = []
    for run_id, items in grouped.items():
        items.sort(key=lambda row: (row.get("turn_id", 0), str(row.get("timestamp") or "")))
        start = parse_timestamp(items[0].get("timestamp"))
        end = parse_timestamp(items[-1].get("timestamp"))
        duration = max(0.0, (end - start).total_seconds()) if start and end else 0.0
        has_error = any(item["event_type"] == "error" or item.get("error") for item in items)
        fix_rounds = sum(item["event_type"] == "fix" for item in items)
        tool_calls = sum(item["event_type"] in {"tool", "test"} or bool(item.get("tool_call")) for item in items)
        explicit = [item.get("result") for item in items if item.get("result") in {"success", "failure"}]
        final_status = explicit[-1] if explicit else ("success" if items[-1]["event_type"] == "success" else "failure")
        error_types = sorted({item["error_type"] for item in items if item.get("error_type")})
        response_values = [item["response_time"] for item in items if item.get("response_time") is not None]
        runs.append(
            {
                "run_id": run_id,
                "task_id": items[0]["task_id"],
                "task_type": items[0]["task_type"],
                "model": items[0]["model"],
                "prompt_variant": items[0]["prompt_variant"],
                "final_status": final_status,
                "first_pass": final_status == "success" and not has_error and fix_rounds == 0,
                "had_error": has_error,
                "fix_rounds": fix_rounds,
                "tool_calls": tool_calls,
                "duration_sec": round(duration, 1),
                "mean_response_sec": round(sum(response_values) / len(response_values), 2) if response_values else None,
                "message_count": len(items),
                "error_types": error_types,
                "actions": [item["action"] for item in items],
                "events": items,
            }
        )
    return sorted(runs, key=lambda run: run["run_id"])


def build_dashboard(
    raw_events: Iterable[dict[str, Any]], *, mode: str, source_label: str
) -> dict[str, Any]:
    normalized = [normalize_event(row, index) for index, row in enumerate(raw_events)]
    seen: set[tuple[str, int, str]] = set()
    deduped: list[dict[str, Any]] = []
    duplicate_count = 0
    for event in normalized:
        key = (event["run_id"], event["turn_id"], event["role"])
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        deduped.append(event)
    runs = aggregate_runs(deduped)
    missing = Counter()
    for field in ("timestamp", "response_time", "token_usage", "tool_call", "error"):
        missing[field] = sum(event.get(field) in (None, "") for event in deduped)
    return {
        "metadata": {
            "mode": mode,
            "source_label": source_label,
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "message_count": len(deduped),
            "run_count": len(runs),
            "duplicate_count": duplicate_count,
            "missing_counts": dict(missing),
            "ethics_note": "仅加载匿名化后的分析副本；演示数据不得作为实证结果提交。",
        },
        "labels": {
            "task_types": {
                "data_cleaning": "数据清洗",
                "file_processing": "文件处理",
                "visualization": "图表调试",
                "unknown": "未知任务",
            },
            "prompt_variants": {"direct": "直接提示", "reflect": "结构化反思", "unknown": "未知策略"},
            "actions": ACTION_LABELS,
        },
        "runs": runs,
    }


def write_outputs(payload: dict[str, Any], output: Path, js_output: Path | None = None) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    output.write_text(serialized + "\n", encoding="utf-8")
    if js_output:
        js_output.parent.mkdir(parents=True, exist_ok=True)
        js_output.write_text("window.DASHBOARD_DATA = " + serialized + ";\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build TRACE dashboard data from JSONL logs.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--js-output", type=Path)
    parser.add_argument("--mode", choices=("demo", "real"), default="real")
    parser.add_argument("--source-label", default="匿名化 JSONL 日志")
    args = parser.parse_args()
    raw_events = load_jsonl(args.input)
    payload = build_dashboard(raw_events, mode=args.mode, source_label=args.source_label)
    write_outputs(payload, args.output, args.js_output)
    print(
        f"已处理 {payload['metadata']['message_count']} 条事件、"
        f"{payload['metadata']['run_count']} 次运行；模式={args.mode}"
    )


if __name__ == "__main__":
    main()

