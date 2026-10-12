(function () {
  "use strict";

  const SCHEMA = "https://vega.github.io/schema/vega-lite/v6.1.0.json";
  const COLORS = {
    direct: "#CF5C6F",
    reflect: "#1F8A8A",
    directSoft: "#F6DDE2",
    reflectSoft: "#D6ECEB",
    amber: "#E0A030",
    indigo: "#5B6FB8",
    plum: "#8A6BB0",
    green: "#4C9A6A",
    accent: "#14708F",
    ink: "#14202B",
    muted: "#5B6A72",
    grid: "#D3DBE3",
    surface: "#FFFFFF",
    neutral: "#DCE4E9",
    failure: "#B23A52",
  };

  const CATEGORY = [
    COLORS.direct,
    COLORS.reflect,
    COLORS.amber,
    COLORS.indigo,
    COLORS.plum,
    COLORS.green,
  ];
  const strategyDomain = ["直接提示", "结构化反思"];
  const strategyRange = [COLORS.direct, COLORS.reflect];
  const players = new Map();
  let renderRevision = 0;

  function baseConfig() {
    return {
      background: null,
      font: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
      view: { stroke: null },
      axis: {
        labelColor: COLORS.muted,
        titleColor: COLORS.muted,
        domainColor: COLORS.grid,
        tickColor: COLORS.grid,
        gridColor: COLORS.grid,
        gridOpacity: 0.66,
        labelFontSize: 11,
        labelFontWeight: 700,
        titleFontSize: 11,
        titleFontWeight: 700,
        titlePadding: 9,
      },
      legend: {
        labelColor: COLORS.ink,
        titleColor: COLORS.muted,
        labelFontSize: 11,
        labelFontWeight: 700,
        titleFontSize: 11,
        titleFontWeight: 700,
        orient: "top",
        direction: "horizontal",
        symbolType: "circle",
      },
      header: {
        labelColor: COLORS.ink,
        labelFontSize: 11,
        labelFontWeight: 700,
        title: null,
      },
      range: { category: CATEGORY },
      selection: {
        interval: {
          fill: COLORS.reflect,
          fillOpacity: 0.14,
          stroke: COLORS.reflect,
          strokeWidth: 1.4,
        },
      },
    };
  }

  function rowsFromRuns(runs, labels) {
    const taskLabels = labels.task_types || {};
    const strategyLabels = labels.prompt_variants || {};
    return runs
      .map((run, sourceIndex) => ({
        run_id: run.run_id,
        task_type: run.task_type,
        task_label: taskLabels[run.task_type] || run.task_type,
        prompt_variant: run.prompt_variant,
        strategy_label: strategyLabels[run.prompt_variant] || run.prompt_variant,
        group_label: `${taskLabels[run.task_type] || run.task_type} · ${
          strategyLabels[run.prompt_variant] || run.prompt_variant
        }`,
        final_status: run.final_status,
        status_label: run.final_status === "success" ? "成功" : "失败",
        first_pass: run.first_pass,
        success_int: run.final_status === "success" ? 1 : 0,
        first_pass_int: run.first_pass ? 1 : 0,
        duration_sec: Number(run.duration_sec) || 0,
        fix_rounds: Number(run.fix_rounds) || 0,
        tool_calls: Number(run.tool_calls) || 0,
        message_count: Number(run.message_count) || 0,
        mean_response_sec: Number(run.mean_response_sec) || 0,
        started_at: run.events?.[0]?.timestamp || String(sourceIndex).padStart(4, "0"),
        source_index: sourceIndex,
      }))
      .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.source_index - b.source_index)
      .map((row, order) => ({ ...row, order: order + 1 }));
  }

  function strategyColorEncoding(title = null) {
    const hideLegend = title === false;
    return {
      field: "strategy_label",
      type: "nominal",
      title: hideLegend ? null : title,
      scale: { domain: strategyDomain, range: strategyRange },
      legend: hideLegend ? null : { title: null },
    };
  }

  function groupRows(rows, field) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = row[field];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return groups;
  }

  function extent(values, fallback = [0, 1]) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return fallback;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    return min === max ? [Math.min(0, min), max + 1] : [min, max];
  }

  function trajectoryData(rows, frames = 48) {
    const out = [];
    groupRows(rows, "group_label").forEach((group) => {
      const ordered = [...group].sort((a, b) => a.order - b.order);
      const states = [];
      let duration = 0;
      let successes = 0;
      let tools = 0;
      ordered.forEach((row) => {
        duration += row.duration_sec;
        successes += row.success_int;
        tools += row.tool_calls;
        states.push({ x: duration, y: successes, size: tools });
      });
      for (let frame = 0; frame < frames; frame += 1) {
        const position = (frame / Math.max(1, frames - 1)) * (states.length - 1);
        const low = Math.floor(position);
        const high = Math.min(states.length - 1, low + 1);
        const ratio = position - low;
        const interpolate = (field) => states[low][field] + (states[high][field] - states[low][field]) * ratio;
        out.push({
          frame,
          group_label: group[0].group_label,
          strategy_label: group[0].strategy_label,
          task_label: group[0].task_label,
          x: +interpolate("x").toFixed(2),
          y: +interpolate("y").toFixed(2),
          size: +interpolate("size").toFixed(2),
        });
      }
    });
    return out;
  }

  function trajectorySpec(rows, width) {
    const values = trajectoryData(rows);
    const xMax = Math.max(1, ...values.map((d) => d.x));
    const yMax = Math.max(1, ...values.map((d) => d.y));
    const sizeMax = Math.max(1, ...values.map((d) => d.size));
    return {
      $schema: SCHEMA,
      data: { values },
      width,
      height: 300,
      params: [{ name: "cur", value: 0 }],
      transform: [
        { calculate: "(datum.frame - cur + 6) / 6", as: "trail_opacity" },
        { filter: "datum.trail_opacity > 0 && datum.trail_opacity <= 1" },
      ],
      mark: { type: "circle", stroke: "white", strokeWidth: 1.2 },
      encoding: {
        x: {
          field: "x",
          type: "quantitative",
          title: "累计耗时（秒）",
          scale: { domain: [0, xMax * 1.05] },
        },
        y: {
          field: "y",
          type: "quantitative",
          title: "累计成功（次）",
          scale: { domain: [0, Math.ceil(yMax * 1.12)] },
        },
        size: {
          field: "size",
          type: "quantitative",
          title: "工具调用",
          scale: { domain: [0, sizeMax], range: [45, 780] },
        },
        color: strategyColorEncoding(),
        opacity: { field: "trail_opacity", type: "quantitative", scale: null, legend: null },
        order: { field: "frame" },
        tooltip: [
          { field: "task_label", title: "任务" },
          { field: "strategy_label", title: "策略" },
          { field: "x", title: "累计耗时", format: ".1f" },
          { field: "y", title: "累计成功", format: ".1f" },
          { field: "size", title: "工具调用", format: ".0f" },
        ],
      },
      config: baseConfig(),
    };
  }

  function raceData(rows) {
    const categories = [...new Set(rows.map((row) => row.group_label))];
    const values = new Map(categories.map((category) => [category, 0]));
    const meta = new Map(rows.map((row) => [row.group_label, row]));
    const out = [];
    rows.forEach((row, frame) => {
      values.set(row.group_label, values.get(row.group_label) + row.success_int);
      categories.forEach((category) => {
        const sample = meta.get(category);
        out.push({
          frame,
          group_label: category,
          task_label: sample.task_label,
          strategy_label: sample.strategy_label,
          value: values.get(category),
        });
      });
    });
    return out;
  }

  function raceSpec(rows, width) {
    const values = raceData(rows);
    const maxValue = Math.max(1, ...values.map((d) => d.value));
    const y = {
      field: "group_label",
      type: "nominal",
      sort: { field: "value", op: "max", order: "descending" },
      title: null,
      axis: { labelLimit: 150 },
    };
    const x = {
      field: "value",
      type: "quantitative",
      title: "累计完成（次）",
      scale: { domain: [0, maxValue + 1] },
    };
    return {
      $schema: SCHEMA,
      data: { values },
      width,
      height: 300,
      params: [{ name: "cur", value: 0 }],
      transform: [
        { filter: "datum.frame === cur" },
        { window: [{ op: "rank", as: "rank" }], sort: [{ field: "value", order: "descending" }] },
        { filter: "datum.rank <= 6" },
      ],
      encoding: { y, x },
      layer: [
        {
          mark: { type: "bar", cornerRadiusEnd: 6 },
          encoding: { color: strategyColorEncoding(), opacity: { value: 0.84 } },
        },
        {
          mark: { type: "text", align: "left", dx: 6, color: COLORS.ink, fontWeight: 700 },
          encoding: { text: { field: "value", type: "quantitative", format: ".0f" } },
        },
      ],
      config: baseConfig(),
    };
  }

  function brushSpec(rows, width) {
    const color = strategyColorEncoding();
    return {
      $schema: SCHEMA,
      data: { values: rows },
      spacing: 12,
      vconcat: [
        {
          width,
          height: 220,
          params: [{ name: "brush", select: { type: "interval", encodings: ["x"], clear: "dblclick" } }],
          mark: { type: "circle", size: 78, opacity: 0.84, strokeWidth: 1.4 },
          encoding: {
            x: { field: "duration_sec", type: "quantitative", title: "运行时长（秒）", scale: { zero: false } },
            y: { field: "fix_rounds", type: "quantitative", title: "修复轮次" },
            color: {
              condition: { param: "brush", field: "strategy_label", type: "nominal" },
              value: COLORS.neutral,
              scale: { domain: strategyDomain, range: strategyRange },
              legend: { title: null },
            },
            stroke: {
              field: "status_label",
              type: "nominal",
              scale: { domain: ["成功", "失败"], range: [COLORS.reflect, COLORS.failure] },
              legend: null,
            },
            tooltip: [
              { field: "run_id", title: "运行" },
              { field: "strategy_label", title: "策略" },
              { field: "duration_sec", title: "时长", format: ".1f" },
              { field: "fix_rounds", title: "修复轮次" },
            ],
          },
        },
        {
          width,
          height: 82,
          transform: [{ filter: { param: "brush" } }],
          mark: { type: "bar", cornerRadiusEnd: 5 },
          encoding: {
            x: { aggregate: "count", type: "quantitative", title: "选中运行数" },
            y: { field: "strategy_label", type: "nominal", title: null },
            color,
          },
        },
      ],
      config: baseConfig(),
    };
  }

  function rollingSpec(rows, width) {
    const values = rows.map((row, index) => ({ ...row, step: index + 1, success_pct: row.success_int * 100 }));
    const x = { field: "step", type: "quantitative", title: "运行序号" };
    return {
      $schema: SCHEMA,
      data: { values },
      width,
      height: 300,
      transform: [
        {
          window: [
            { op: "mean", field: "success_pct", as: "rolling_mean" },
            { op: "stdev", field: "success_pct", as: "rolling_stdev" },
          ],
          frame: [-4, 4],
          sort: [{ field: "step", order: "ascending" }],
        },
        { calculate: "datum.rolling_mean - (isValid(datum.rolling_stdev) ? datum.rolling_stdev : 0)", as: "low" },
        { calculate: "datum.rolling_mean + (isValid(datum.rolling_stdev) ? datum.rolling_stdev : 0)", as: "high" },
      ],
      layer: [
        {
          mark: { type: "area", color: COLORS.reflect, opacity: 0.18, interpolate: "monotone" },
          encoding: {
            x,
            y: { field: "low", type: "quantitative", title: "完成率（%）", scale: { domain: [-10, 110] } },
            y2: { field: "high" },
          },
        },
        {
          mark: { type: "point", color: COLORS.direct, size: 24, opacity: 0.38 },
          encoding: { x, y: { field: "success_pct", type: "quantitative" } },
        },
        {
          mark: { type: "line", color: COLORS.reflect, strokeWidth: 2.6, interpolate: "monotone" },
          encoding: {
            x,
            y: { field: "rolling_mean", type: "quantitative" },
            tooltip: [
              { field: "step", title: "序号" },
              { field: "rolling_mean", title: "滚动均值", format: ".1f" },
            ],
          },
        },
      ],
      config: baseConfig(),
    };
  }

  function regressionSpec(rows, width) {
    const color = strategyColorEncoding();
    const x = { field: "duration_sec", type: "quantitative", title: "运行时长（秒）", scale: { zero: false } };
    const y = { field: "fix_rounds", type: "quantitative", title: "修复轮次" };
    const tooltip = [
      { field: "run_id", title: "运行" },
      { field: "strategy_label", title: "策略" },
      { field: "duration_sec", title: "时长", format: ".1f" },
      { field: "fix_rounds", title: "修复轮次" },
      { field: "tool_calls", title: "工具调用" },
    ];
    const eligibleGroups = new Set(
      [...groupRows(rows, "strategy_label")]
        .filter(([, group]) => group.length >= 2 && new Set(group.map((row) => row.duration_sec)).size >= 2)
        .map(([strategy]) => strategy),
    );
    const regressionRows = rows.filter((row) => eligibleGroups.has(row.strategy_label));
    const layers = [
      {
        name: "run_points",
        mark: { type: "point", filled: true, opacity: 0.74, strokeWidth: 2.1 },
        encoding: {
          x,
          y,
          size: { field: "tool_calls", type: "quantitative", title: "工具调用", scale: { range: [45, 390] } },
          color: {
            condition: { test: "datum.final_status === 'failure'", value: COLORS.failure },
            field: "strategy_label",
            type: "nominal",
            title: null,
            scale: { domain: strategyDomain, range: strategyRange },
          },
          shape: {
            field: "status_label",
            type: "nominal",
            title: null,
            scale: { domain: ["成功", "失败"], range: ["circle", "cross"] },
          },
          tooltip,
        },
      },
    ];
    if (regressionRows.length) {
      layers.push({
        data: { values: regressionRows },
        transform: [{ regression: "fix_rounds", on: "duration_sec", groupby: ["strategy_label"] }],
        mark: { type: "line", strokeWidth: 2.5, opacity: 0.84 },
        encoding: { x, y, color },
      });
    }
    return {
      $schema: SCHEMA,
      data: { values: rows },
      width,
      height: 300,
      layer: layers,
      config: baseConfig(),
    };
  }

  function pearson(rows, a, b) {
    if (rows.length < 2) return a === b ? 1 : 0;
    const meanA = rows.reduce((sum, row) => sum + row[a], 0) / rows.length;
    const meanB = rows.reduce((sum, row) => sum + row[b], 0) / rows.length;
    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;
    rows.forEach((row) => {
      const da = row[a] - meanA;
      const db = row[b] - meanB;
      covariance += da * db;
      varianceA += da * da;
      varianceB += db * db;
    });
    const denominator = Math.sqrt(varianceA * varianceB);
    return denominator ? covariance / denominator : a === b ? 1 : 0;
  }

  function correlationData(rows) {
    const fields = [
      ["success_int", "完成"],
      ["first_pass_int", "首次通过"],
      ["fix_rounds", "修复轮次"],
      ["tool_calls", "工具调用"],
      ["duration_sec", "运行时长"],
      ["mean_response_sec", "响应均值"],
    ];
    const values = [];
    fields.forEach(([a, labelA]) => {
      fields.forEach(([b, labelB]) => {
        values.push({ a: labelA, b: labelB, r: +pearson(rows, a, b).toFixed(2) });
      });
    });
    return { order: fields.map(([, label]) => label), values };
  }

  function correlationSpec(rows, width) {
    const matrix = correlationData(rows);
    const axisX = { field: "a", type: "ordinal", sort: matrix.order, title: null, axis: { labelAngle: -28, labelLimit: 82 } };
    const axisY = { field: "b", type: "ordinal", sort: matrix.order, title: null };
    return {
      $schema: SCHEMA,
      data: { values: matrix.values },
      width,
      height: 300,
      layer: [
        {
          mark: { type: "rect", cornerRadius: 3 },
          encoding: {
            x: axisX,
            y: axisY,
            color: {
              field: "r",
              type: "quantitative",
              title: "相关系数",
              scale: { domain: [-1, 1], scheme: "redblue", reverse: true },
            },
            tooltip: [
              { field: "a", title: "指标" },
              { field: "b", title: "指标" },
              { field: "r", title: "相关", format: ".2f" },
            ],
          },
        },
        {
          mark: { type: "text", fontSize: 11, fontWeight: 700 },
          encoding: {
            x: { field: "a", type: "ordinal", sort: matrix.order },
            y: { field: "b", type: "ordinal", sort: matrix.order },
            text: { field: "r", type: "quantitative", format: ".2f" },
            color: { condition: { test: "abs(datum.r) > 0.56", value: "white" }, value: COLORS.ink },
          },
        },
      ],
      config: baseConfig(),
    };
  }

  function ridgeSpec(rows, width) {
    const durationExtent = extent(rows.map((row) => row.duration_sec));
    const padding = Math.max(2, (durationExtent[1] - durationExtent[0]) * 0.08);
    return {
      $schema: SCHEMA,
      data: { values: rows },
      width,
      height: 30,
      transform: [
        {
          density: "duration_sec",
          groupby: ["group_label", "strategy_label"],
          extent: [Math.max(0, durationExtent[0] - padding), durationExtent[1] + padding],
          steps: 80,
        },
      ],
      mark: { type: "area", interpolate: "monotone", fillOpacity: 0.8, stroke: "white", strokeWidth: 1.1 },
      encoding: {
        x: {
          field: "value",
          type: "quantitative",
          title: "运行时长（秒）",
          scale: { domain: [Math.max(0, durationExtent[0] - padding), durationExtent[1] + padding] },
        },
        y: { field: "density", type: "quantitative", scale: { range: [30, -12] }, axis: null },
        color: strategyColorEncoding(false),
        row: {
          field: "group_label",
          type: "nominal",
          title: null,
          header: { labelAngle: 0, labelAlign: "left", labelPadding: 7, labelLimit: 150 },
        },
      },
      config: { ...baseConfig(), facet: { spacing: 2 } },
    };
  }

  function cumulativeSuccessData(rows) {
    const out = [];
    groupRows(rows, "strategy_label").forEach((group, strategy) => {
      let successes = 0;
      [...group]
        .sort((a, b) => a.order - b.order)
        .forEach((row, index) => {
          successes += row.success_int;
          out.push({ strategy_label: strategy, step: index + 1, success_rate: (successes / (index + 1)) * 100 });
        });
    });
    return out;
  }

  function hoverSpec(rows, width) {
    const values = cumulativeSuccessData(rows);
    const x = { field: "step", type: "quantitative", title: "策略内运行序号" };
    const color = strategyColorEncoding();
    return {
      $schema: SCHEMA,
      data: { values },
      width,
      height: 300,
      layer: [
        {
          mark: { type: "line", strokeWidth: 2.4, interpolate: "monotone" },
          encoding: {
            x,
            y: { field: "success_rate", type: "quantitative", title: "累计完成率（%）", scale: { domain: [0, 100] } },
            color,
          },
        },
        {
          params: [
            {
              name: "hoverStep",
              select: { type: "point", on: "pointerover", nearest: true, fields: ["step"], clear: "pointerout" },
            },
          ],
          mark: { type: "point", filled: true, size: 82, stroke: "white", strokeWidth: 1.2 },
          encoding: {
            x,
            y: { field: "success_rate", type: "quantitative" },
            color,
            opacity: { condition: { param: "hoverStep", empty: false, value: 1 }, value: 0 },
            tooltip: [
              { field: "strategy_label", title: "策略" },
              { field: "step", title: "序号" },
              { field: "success_rate", title: "累计完成率", format: ".1f" },
            ],
          },
        },
        {
          mark: { type: "rule", strokeDash: [4, 4], color: COLORS.muted },
          encoding: {
            x,
            opacity: { condition: { param: "hoverStep", empty: false, value: 0.62 }, value: 0 },
          },
        },
      ],
      config: baseConfig(),
    };
  }

  function zoomSpec(rows, width) {
    return {
      $schema: SCHEMA,
      data: { values: rows },
      width,
      height: 300,
      params: [{ name: "zoomGrid", select: { type: "interval", bind: "scales" } }],
      mark: { type: "circle", opacity: 0.72, stroke: "white", strokeWidth: 1 },
      encoding: {
        x: { field: "duration_sec", type: "quantitative", title: "运行时长（秒）", scale: { zero: false } },
        y: { field: "mean_response_sec", type: "quantitative", title: "平均响应（秒）", scale: { zero: false } },
        color: strategyColorEncoding(),
        size: { field: "tool_calls", type: "quantitative", title: "工具调用", scale: { range: [45, 360] } },
        tooltip: [
          { field: "run_id", title: "运行" },
          { field: "task_label", title: "任务" },
          { field: "strategy_label", title: "策略" },
          { field: "duration_sec", title: "时长", format: ".1f" },
          { field: "mean_response_sec", title: "平均响应", format: ".2f" },
        ],
      },
      config: baseConfig(),
    };
  }

  function showFallback(container, message) {
    if (!container) return;
    container.innerHTML = `<div class="vega-fallback"><strong>图表未加载</strong><span>${message}</span></div>`;
  }

  function animateVegaMarks(container) {
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    container.classList.remove("is-chart-animated");
    const points = [...container.querySelectorAll("svg .mark-symbol.role-mark > path")];
    const positioned = points.map((point, sourceIndex) => {
      const matrix = point.getCTM();
      return { point, sourceIndex, x: matrix?.e ?? sourceIndex, y: matrix?.f ?? 0 };
    });
    const xs = positioned.map((item) => item.x);
    const ys = positioned.map((item) => item.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 1;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 1;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    positioned
      .map((item) => ({ ...item, diagonal: (item.x - minX) / spanX + (maxY - item.y) / spanY }))
      .sort((a, b) => a.diagonal - b.diagonal || a.sourceIndex - b.sourceIndex)
      .forEach((item, order, ordered) => {
        item.point.style.setProperty("--mark-index", String(Math.round((order / Math.max(1, ordered.length - 1)) * 30)));
      });
    container
      .querySelectorAll("svg .mark-rect.role-mark:not([class*='brush']) > path, svg .mark-rule.role-mark > line")
      .forEach((mark, index) => mark.style.setProperty("--mark-index", String(index % 22)));
    container.querySelectorAll("svg .mark-line.role-mark > path").forEach((path) => {
      try {
        const length = Math.max(1, path.getTotalLength());
        path.style.strokeDasharray = String(length);
        path.style.strokeDashoffset = String(length);
      } catch {
        path.style.strokeDasharray = "none";
        path.style.strokeDashoffset = "0";
      }
    });
    void container.offsetWidth;
    window.requestAnimationFrame(() => container.classList.add("is-chart-animated"));
  }

  async function embed(container, spec, onPick) {
    if (!container) return null;
    if (typeof window.vegaEmbed !== "function") {
      showFallback(container, "请检查 Vega 运行文件。 ");
      return null;
    }
    container.replaceChildren();
    try {
      const result = await window.vegaEmbed(container, spec, {
        actions: false,
        renderer: "svg",
        tooltip: { theme: "light" },
      });
      if (onPick) {
        result.view.addEventListener("click", (event, item) => {
          const runId = item?.datum?.run_id || item?.datum?.datum?.run_id;
          if (runId) onPick(runId);
        });
      }
      animateVegaMarks(container);
      return result.view;
    } catch (error) {
      console.error("TRACE Vega-Lite render failed", error);
      showFallback(container, "规范未能编译。 ");
      return null;
    }
  }

  function stopPlayer(key) {
    const player = players.get(key);
    if (player?.timer) window.clearInterval(player.timer);
    if (player?.button) player.button.textContent = "播放";
    players.delete(key);
  }

  function stopPlayers() {
    [...players.keys()].forEach(stopPlayer);
  }

  function wirePlayer(key, view, maxFrame) {
    const button = document.querySelector(`#${key}Play`);
    const range = document.querySelector(`#${key}Range`);
    const label = document.querySelector(`#${key}Frame`);
    if (!button || !range || !label) return;
    stopPlayer(key);
    range.max = String(maxFrame);
    range.value = "0";
    button.disabled = !view || maxFrame < 1;
    range.disabled = !view || maxFrame < 1;
    let position = 0;
    const total = maxFrame + 1;
    const updateLabel = () => {
      const digits = String(total).length;
      label.textContent = `${String(position + 1).padStart(digits, "0")} / ${total}`;
    };
    const setFrame = async (next) => {
      position = Math.max(0, Math.min(maxFrame, next));
      range.value = String(position);
      updateLabel();
      if (view) await view.signal("cur", position).runAsync();
    };
    const player = { button, range, label, timer: null };
    const pause = () => {
      if (player.timer) window.clearInterval(player.timer);
      player.timer = null;
      button.textContent = "播放";
    };
    range.oninput = () => {
      pause();
      setFrame(Number(range.value));
    };
    button.onclick = () => {
      if (player.timer) {
        pause();
        return;
      }
      if (position >= maxFrame) setFrame(0);
      button.textContent = "暂停";
      player.timer = window.setInterval(() => {
        if (position >= maxFrame) {
          pause();
          return;
        }
        setFrame(position + 1);
      }, 90);
    };
    players.set(key, player);
    updateLabel();
  }

  function chartWidth(selector, padding = 50) {
    const container = document.querySelector(selector);
    return Math.max(250, (container?.clientWidth || 620) - padding);
  }

  async function renderAll(runs, labels, onPick) {
    const revision = ++renderRevision;
    stopPlayers();
    const rows = rowsFromRuns(runs, labels);
    const selectors = [
      "#trajectoryChart",
      "#raceChart",
      "#brushChart",
      "#rollingChart",
      "#regressionChart",
      "#correlationChart",
      "#ridgeChart",
      "#hoverChart",
      "#zoomChart",
    ];
    if (!rows.length) {
      selectors.forEach((selector) => {
        const container = document.querySelector(selector);
        if (container) container.innerHTML = '<div class="empty-state">当前筛选没有可展示的数据。</div>';
      });
      return;
    }

    const promises = [
      embed(document.querySelector("#trajectoryChart"), trajectorySpec(rows, chartWidth("#trajectoryChart"))),
      embed(document.querySelector("#raceChart"), raceSpec(rows, chartWidth("#raceChart", 88))),
      embed(document.querySelector("#brushChart"), brushSpec(rows, chartWidth("#brushChart"))),
      embed(document.querySelector("#rollingChart"), rollingSpec(rows, chartWidth("#rollingChart"))),
      embed(document.querySelector("#regressionChart"), regressionSpec(rows, chartWidth("#regressionChart")), onPick),
      embed(document.querySelector("#correlationChart"), correlationSpec(rows, chartWidth("#correlationChart", 92))),
      embed(document.querySelector("#ridgeChart"), ridgeSpec(rows, chartWidth("#ridgeChart", 120))),
      embed(document.querySelector("#hoverChart"), hoverSpec(rows, chartWidth("#hoverChart"))),
      embed(document.querySelector("#zoomChart"), zoomSpec(rows, chartWidth("#zoomChart")), onPick),
    ];
    const views = await Promise.all(promises);
    if (revision !== renderRevision) return;
    wirePlayer("trajectory", views[0], 47);
    wirePlayer("race", views[1], Math.max(0, rows.length - 1));
  }

  window.TraceVega = { renderAll, colors: COLORS };
})();
