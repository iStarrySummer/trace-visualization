# TRACE：AI Coding 错误恢复行为可视分析系统

TRACE 是《数据分析与可视化实践》题目二的可运行原型，研究问题为：在相同 AI Coding 任务与同一模型条件下，“直接提示”和“计划—执行—测试—反思”两种提示策略，是否呈现不同的首次通过率、错误恢复路径、修复轮次与工具调用效率。这个设计把题中的“提示词策略对比”和“AI Coding 错误修复效率”合并为一个受控研究，使结论既能由统计指标支持，也能由行为序列解释。视觉语言使用玫瑰红 `#CF5C6F` 表示直接提示，青绿 `#1F8A8A` 表示结构化反思，使策略语义在所有视图中保持一致。

当前仓库附带的是**确定性生成的演示数据**，只用于检查系统功能与视觉效果，不能作为课程提交中的真实采集数据。正式提交前必须按 `docs/采集与标注手册.md` 完成真实采集，把匿名化后的 JSONL 放入 `data/raw/`，再运行数据管道；页面顶部会根据数据元信息持续标明“演示数据”或“真实采集数据”，避免混淆。

## 运行

本项目不需要安装 npm 包，数据管道只依赖 Python 标准库；三个高级交互视图会由浏览器通过 jsDelivr 载入 Vega 6、Vega-Lite 6.1.0 与 vega-embed 7，因此首次打开需要联网。运行时执行：

```bash
python3 src/generate_demo.py
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/app/`。数据管道测试可执行：

```bash
python3 -m unittest discover -s tests -v
```

演示阶段可执行交付前检查：

```bash
python3 src/validate_dataset.py data/processed/dashboard.json --allow-demo
```

正式提交时去掉 `--allow-demo`；检查器会拒绝 `mode=demo`，并核对消息量、任务数、策略数、运行状态、事件顺序和常见敏感信息残留。

处理真实数据时执行：

```bash
python3 src/pipeline.py \
  --input data/raw/your_messages.jsonl \
  --output data/processed/dashboard.json \
  --js-output app/data.js \
  --mode real
```

## 系统视图与联动

系统在原有错误恢复路径图、任务×策略完成率矩阵与运行时间线之上，加入了九组 Vega-Lite 高级视图：参数驱动的气泡轨迹、`window(rank)` 条形图竞赛、`interval` 刷选联动、滚动均值与标准差波动带、分组回归、相关性热力图、核密度山脊图、最近点悬停十字线以及绑定尺度的缩放平移。两个播放视图由 JavaScript 推进 Vega 参数，其中策略轨迹预先插值为 48 帧；顶部筛选会同步更新全部视图，回归图和缩放图中的运行点可联动下方时间线。设计参考并改写自 [UW Data Visualization Curriculum](https://observablehq.com/@uwdata/data-visualization-curriculum)，完整第三方声明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## 仓库结构

```text
.
├── app/                    # 可运行静态系统
├── data/
│   ├── raw/                # 原始或演示 JSONL；正式数据需匿名化
│   ├── processed/          # 管道产出的结构化数据
│   └── data_dictionary.md  # 字段、来源、缺失与派生规则
├── docs/
│   ├── 调研与方案.md
│   ├── 采集与标注手册.md
│   └── 满分验收清单.md
├── report/案例报告-演示版.md
├── src/                    # 演示数据生成与通用处理管道
├── presentation/答辩大纲.md
└── tests/                  # 匿名化、分类和聚合测试
```

## 学术诚信与使用边界

正式报告应说明生成式 AI 被用于系统原型、代码解释和表达优化，但数据采集、分类抽检、结论确认与答辩解释由小组成员完成。不要提交本仓库中的演示结论作为实证结论，不要公开可识别的对话文本，也不要把相关关系写成因果关系。

