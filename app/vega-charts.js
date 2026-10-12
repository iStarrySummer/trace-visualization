(function () {
  "use strict";

  const SCHEMA = "https://vega.github.io/schema/vega-lite/v6.1.0.json";
  const COLORS = {
    direct: "#D6604D",
    reflect: "#4393C3",
    directSoft: "#FDDBC7",
    reflectSoft: "#D1E5F0",
    teal: "#92C5DE",
    ink: "#2B2B2B",
    muted: "#6B6B6B",
    grid: "#D8D8D8",
    surface: "#FFFFFF",
    neutral: "#D1E5F0",
    error: "#B2182B",
    diagnose: "#D6604D",
    fix: "#4393C3",
    pass: "#2166AC",
    failure: "#B2182B",
  };

  const strategyDomain = ["直接提示", "结构化反思"];
  const strategyRange = [COLORS.direct, COLORS.reflect];

  function baseConfig() {
    return {
      background: null,
      font: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", serif',
      view: { stroke: null },
      axis: {
        labelColor: COLORS.muted,
        titleColor: COLORS.ink,
        domainColor: COLORS.grid,
        tickColor: COLORS.grid,
        gridColor: COLORS.grid,
        gridOpacity: 0.68,
        labelFontSize: 11,
        labelFontWeight: 700,
        titleFontSize: 11,
        titleFontWeight: 700,
        titlePadding: 10,
      },
      legend: {
        labelColor: COLORS.muted,
        titleColor: COLORS.ink,
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
        labelFontSize: 12,
        labelFontWeight: 700,
        title: null,
      },
      selection: {
        interval: { fill: COLORS.reflect, fillOpacity: 0.16, stroke: COLORS.reflect, strokeWidth: 1.5 },
        point: { on: "click", toggle: false },
      },
    };
  }

  function rowsFromRuns(runs, labels) {
    const taskLabels = labels.task_types || {};
    const strategyLabels = labels.prompt_variants || {};
    return runs.map((run) => ({
      run_id: run.run_id,
      task_type: run.task_type,
      task_label: taskLabels[run.task_type] || run.task_type,
      prompt_variant: run.prompt_variant,
      strategy_label: strategyLabels[run.prompt_variant] || run.prompt_variant,
      final_status: run.final_status,
      status_label: run.final_status === "success" ? "成功" : "失败",
      first_pass: run.first_pass,
      first_pass_label: run.first_pass ? "首次通过" : "进入修复",
      success_int: run.final_status === "success" ? 1 : 0,
      duration_sec: run.duration_sec,
      fix_rounds: run.fix_rounds,
      tool_calls: run.tool_calls,
      message_count: run.message_count,
      mean_response_sec: run.mean_response_sec,
      error_type: run.error_types[0] || "无错误",
    }));
  }

  function strategyColorEncoding(legendTitle = "提示策略") {
    return {
      field: "strategy_label",
      type: "nominal",
      title: legendTitle,
      scale: { domain: strategyDomain, range: strategyRange },
      legend: { orient: "top", title: null },
    };
  }

  function linkedSpec(rows, width) {
    const focusHeight = width < 620 ? 240 : 300;
    const hoverParam = {
      name: "hoverRun",
      select: { type: "point", fields: ["run_id"], on: "pointerover", nearest: true, toggle: false },
      value: [],
    };
    const clickParam = {
      name: "runPick",
      select: { type: "point", fields: ["run_id"], toggle: false, clear: "dblclick" },
      value: [],
    };
    const sharedX = {
      field: "duration_sec",
      type: "quantitative",
      title: "运行时长（秒）",
      scale: { zero: false, nice: true },
    };
    const sharedY = {
      field: "fix_rounds",
      type: "quantitative",
      title: "修复轮次（轮）",
      scale: { zero: true, nice: true },
    };
    const pointLayer = {
      name: "run_points",
      params: [hoverParam, clickParam],
      mark: { type: "point", filled: true, strokeWidth: 2.2 },
      encoding: {
        x: sharedX,
        y: sharedY,
        color: strategyColorEncoding(),
        stroke: {
          field: "status_label",
          type: "nominal",
          title: "最终状态",
          scale: { domain: ["成功", "失败"], range: [COLORS.pass, COLORS.failure] },
          legend: null,
        },
        size: {
          field: "tool_calls",
          type: "quantitative",
          title: "工具调用次数",
          scale: { range: [45, 360] },
        },
        shape: {
          field: "status_label",
          type: "nominal",
          title: "最终状态",
          scale: { domain: ["成功", "失败"], range: ["circle", "cross"] },
        },
        opacity: {
          condition: [
            { param: "runPick", empty: false, value: 1 },
            { param: "durationBrush", empty: true, value: 0.82 },
          ],
          value: 0.1,
        },
        tooltip: [
          { field: "run_id", type: "nominal", title: "运行" },
          { field: "task_label", type: "nominal", title: "任务" },
          { field: "strategy_label", type: "nominal", title: "策略" },
          { field: "status_label", type: "nominal", title: "状态" },
          { field: "duration_sec", type: "quantitative", title: "时长（秒）", format: ".1f" },
          { field: "fix_rounds", type: "quantitative", title: "修复轮次" },
          { field: "tool_calls", type: "quantitative", title: "工具调用" },
        ],
      },
    };
    const regressionLayer = {
      transform: [
        { regression: "fix_rounds", on: "duration_sec", groupby: ["strategy_label"] },
        { calculate: "max(datum.fix_rounds, 0)", as: "predicted_fixes" },
      ],
      mark: { type: "line", strokeWidth: 2.4, opacity: 0.72 },
      encoding: {
        x: { field: "duration_sec", type: "quantitative" },
        y: { field: "predicted_fixes", type: "quantitative" },
        color: strategyColorEncoding(),
      },
    };
    const guideLayer = {
      mark: { type: "rule", color: COLORS.muted, strokeDash: [3, 3], opacity: 0.6 },
      encoding: {
        x: { field: "duration_sec", type: "quantitative" },
        opacity: { condition: { param: "hoverRun", empty: false, value: 0.6 }, value: 0 },
      },
    };
    const haloTextLayer = {
      mark: {
        type: "text",
        align: "left",
        baseline: "bottom",
        dx: 7,
        dy: -7,
        fontSize: 11,
        fontWeight: 700,
        stroke: "white",
        strokeWidth: 4,
      },
      encoding: {
        x: sharedX,
        y: sharedY,
        text: { field: "run_id" },
        opacity: { condition: { param: "hoverRun", empty: false, value: 1 }, value: 0 },
      },
    };
    const textLayer = {
      ...haloTextLayer,
      mark: { ...haloTextLayer.mark, stroke: null, color: COLORS.ink },
    };

    return {
      $schema: SCHEMA,
      data: { values: rows },
      spacing: 10,
      vconcat: [
        {
          name: "focus",
          width,
          height: focusHeight,
          layer: [pointLayer, regressionLayer, guideLayer, haloTextLayer, textLayer],
        },
        {
          name: "overview",
          width,
          height: 72,
          params: [
            {
              name: "durationBrush",
              select: { type: "interval", encodings: ["x"], clear: "dblclick" },
            },
          ],
          mark: { type: "bar", cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
          encoding: {
            x: {
              field: "duration_sec",
              type: "quantitative",
              bin: { maxbins: 24 },
              title: "拖拽选择时长区间；双击清除",
            },
            y: { aggregate: "count", type: "quantitative", title: "运行数" },
            color: strategyColorEncoding(),
            opacity: { value: 0.72 },
          },
        },
      ],
      resolve: { scale: { color: "shared" } },
      config: baseConfig(),
    };
  }

  function facetSpec(rows, containerWidth) {
    const mobile = containerWidth < 640;
    const columns = mobile ? 1 : 3;
    const cellWidth = mobile
      ? Math.max(230, containerWidth - 78)
      : Math.max(120, Math.floor((containerWidth - 150) / 3));
    return {
      $schema: SCHEMA,
      data: { values: rows },
      transform: [
        {
          aggregate: [
            { op: "mean", field: "success_int", as: "success_rate" },
            { op: "count", as: "runs" },
            { op: "mean", field: "fix_rounds", as: "mean_fixes" },
          ],
          groupby: ["task_label", "strategy_label"],
        },
      ],
      facet: {
        field: "task_label",
        type: "nominal",
        title: null,
        header: { labelOrient: "top", labelPadding: 10 },
      },
      columns,
      spacing: 18,
      spec: {
        width: cellWidth,
        height: 150,
        layer: [
          {
            mark: { type: "bar", cornerRadiusTopLeft: 7, cornerRadiusTopRight: 7, width: 34 },
            encoding: {
              x: {
                field: "strategy_label",
                type: "nominal",
                title: null,
                axis: { labelAngle: 0, labelLimit: 80 },
              },
              y: {
                field: "success_rate",
                type: "quantitative",
                title: "完成率",
                scale: { domain: [0, 1] },
                axis: { format: ".0%", tickCount: 5 },
              },
              color: strategyColorEncoding(),
              opacity: { value: 0.82 },
              tooltip: [
                { field: "task_label", title: "任务" },
                { field: "strategy_label", title: "策略" },
                { field: "success_rate", title: "完成率", format: ".0%" },
                { field: "mean_fixes", title: "平均修复轮次", format: ".2f" },
                { field: "runs", title: "样本量" },
              ],
            },
          },
          {
            mark: { type: "text", dy: -9, color: COLORS.ink, fontSize: 11, fontWeight: 700 },
            encoding: {
              x: { field: "strategy_label", type: "nominal" },
              y: { field: "success_rate", type: "quantitative" },
              text: { field: "success_rate", type: "quantitative", format: ".0%" },
            },
          },
        ],
      },
      resolve: { scale: { y: "shared", color: "shared" }, legend: { color: "shared" } },
      config: baseConfig(),
    };
  }

  function crossfilterSpec(rows, containerWidth) {
    const mobile = containerWidth < 680;
    const direction = mobile ? "row" : "column";
    const repeat = {};
    repeat[direction] = ["duration_sec", "fix_rounds", "tool_calls"];
    const field = { repeat: direction };
    const chartWidth = mobile
      ? Math.max(230, containerWidth - 92)
      : Math.max(110, Math.floor((containerWidth - 122) / 3));
    const titleExpr =
      "datum.label === 'duration_sec' ? '运行时长（秒）' : datum.label === 'fix_rounds' ? '修复轮次（轮）' : '工具调用（次）'";
    const hist = {
      mark: { type: "bar", cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
      encoding: {
        x: {
          field,
          type: "quantitative",
          bin: { maxbins: 18 },
          title: null,
          axis: { titleExpr, labelFlush: false },
        },
        y: { aggregate: "count", type: "quantitative", title: "运行数" },
      },
    };
    return {
      $schema: SCHEMA,
      data: { values: rows },
      repeat,
      spacing: 18,
      spec: {
        width: chartWidth,
        height: mobile ? 92 : 150,
        layer: [
          {
            ...hist,
            params: [
              {
                name: "crossBrush",
                select: { type: "interval", encodings: ["x"], resolve: "intersect", clear: "dblclick" },
              },
            ],
            encoding: { ...hist.encoding, color: { value: COLORS.neutral } },
          },
          {
            ...hist,
            transform: [{ filter: { param: "crossBrush" } }],
            encoding: {
              ...hist.encoding,
              color: strategyColorEncoding(),
              opacity: { value: 0.86 },
            },
          },
        ],
      },
      resolve: { scale: { y: "independent", color: "shared" } },
      config: baseConfig(),
    };
  }

  function showFallback(container, message) {
    container.innerHTML = `<div class="vega-fallback"><strong>高级图表暂未加载</strong><span>${message}</span></div>`;
  }

  function animateVegaMarks(container) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    container.classList.remove("is-chart-animated");
    const points = [...container.querySelectorAll("svg .mark-symbol.role-mark > path")];
    const positionedPoints = points
      .map((point, sourceIndex) => {
        const matrix = point.getCTM();
        return { point, sourceIndex, x: matrix?.e ?? sourceIndex, y: matrix?.f ?? 0 };
      });
    const xs = positionedPoints.map((item) => item.x);
    const ys = positionedPoints.map((item) => item.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 1;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 1;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    positionedPoints
      .map((item) => ({
        ...item,
        diagonal: (item.x - minX) / spanX + (maxY - item.y) / spanY,
      }))
      .sort((a, b) => a.diagonal - b.diagonal || a.sourceIndex - b.sourceIndex)
      .forEach((item, order, ordered) => {
        const step = Math.round((order / Math.max(1, ordered.length - 1)) * 32);
        item.point.style.setProperty("--mark-index", String(step));
      });
    const otherMarks = container.querySelectorAll(
      "svg .mark-rect.role-mark:not([class*='brush']) > path, svg .mark-rule.role-mark > line",
    );
    otherMarks.forEach((mark, index) => {
      mark.style.setProperty("--mark-index", String(index % 22));
    });
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
      showFallback(container, "请检查 Vega、Vega-Lite 与 vega-embed 运行文件是否可访问。");
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
          const ariaLabel = event?.target?.getAttribute?.("aria-label") || "";
          const ariaRun = ariaLabel.match(/(?:运行|run_id):\s*([^;]+)/)?.[1]?.trim();
          const runId = item?.datum?.run_id || item?.datum?.datum?.run_id || ariaRun;
          if (runId) onPick(runId);
        });
      }
      animateVegaMarks(container);
      return result.view;
    } catch (error) {
      console.error("TRACE Vega-Lite render failed", error);
      showFallback(container, "图表规范未能编译，请查看浏览器控制台。其他分析视图仍可使用。");
      return null;
    }
  }

  let renderRevision = 0;

  async function renderAll(runs, labels, onPick) {
    const revision = ++renderRevision;
    const rows = rowsFromRuns(runs, labels);
    const linked = document.querySelector("#scatterChart");
    const facets = document.querySelector("#facetChart");
    const crossfilter = document.querySelector("#crossfilterChart");
    if (!rows.length) {
      [linked, facets, crossfilter].forEach((container) => {
        if (container) container.innerHTML = '<div class="empty-state">当前筛选没有可展示的数据。</div>';
      });
      return;
    }
    const linkedWidth = Math.max(270, (linked?.clientWidth || 760) - 64);
    const facetWidth = Math.max(300, (facets?.clientWidth || 760) - 18);
    const crossWidth = Math.max(300, (crossfilter?.clientWidth || 760) - 18);
    const promises = [
      embed(linked, linkedSpec(rows, linkedWidth), onPick),
      embed(facets, facetSpec(rows, facetWidth)),
      embed(crossfilter, crossfilterSpec(rows, crossWidth)),
    ];
    await Promise.all(promises);
    if (revision !== renderRevision) return;
  }

  window.TraceVega = { renderAll, colors: COLORS };
})();

