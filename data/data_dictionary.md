# 数据字典

| 字段 | 类型 | 来源 | 含义与缺失处理 |
| --- | --- | --- | --- |
| timestamp | ISO 8601 字符串 | 平台/采集脚本 | 事件发生时间；无法精确取得时保留 null，不推测 |
| task_id | 字符串 | 实验设计 | 固定任务编号 |
| task_type | 枚举 | 实验设计 | data_cleaning、file_processing、visualization |
| run_id | 字符串 | 采集脚本 | 一次独立运行编号 |
| turn_id | 整数 | 采集脚本 | 运行内事件顺序，从 1 开始 |
| role | 枚举 | 原始日志 | user、assistant、tool；管道统一 agent 为 assistant |
| content | 字符串 | 原始日志 | 匿名化文本；邮箱、电话、令牌和用户目录自动替换 |
| model | 字符串 | 环境元信息 | 模型及版本；网页端未知版本时写平台展示名称并说明 |
| prompt_variant | 枚举 | 实验设计 | direct 或 reflect |
| event_type | 枚举 | 原始/派生 | receive、plan、code、tool、error、diagnose、fix、test、success、stop、clarify |
| response_time | 浮点数/null | 平台/采集脚本 | 单条响应秒数；未知为 null，禁止填 0 |
| token_usage | 整数/null | 平台/API | 输入输出 Token 合计；未知为 null |
| tool_call | 字符串/null | 工具日志 | 工具名称 |
| error | 字符串/null | 工具日志 | 匿名化错误文本 |
| result | 枚举/null | 工具/派生 | success、failure、running |
| action | 枚举 | 派生 | 面向可视化的中文行为类别 |
| error_type | 枚举/null | 派生 | 依据异常名和关键词规则分类 |
| final_status | 枚举 | 派生 | run 最后状态 success 或 failure |
| first_pass | 布尔 | 派生 | 首次测试前未出现 error/fix 且最终成功 |
| fix_rounds | 整数 | 派生 | fix 事件数量 |
| tool_calls | 整数 | 派生 | tool 事件或非空 tool_call 数量 |
| duration_sec | 浮点数 | 派生 | 首末时间戳之差；只有一个事件时为 0 |

演示数据额外在顶层 `metadata.mode` 标记为 `demo`，并为每条消息写入 `is_demo=true`。真实管道调用必须显式使用 `--mode real`，其来源说明由小组自行补充。

