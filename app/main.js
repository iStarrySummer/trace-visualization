(() => {
  "use strict";

  const data = window.DASHBOARD_DATA;
  const $ = (selector) => document.querySelector(selector);
  const svgNS = "http://www.w3.org/2000/svg";
  const taskLabels = data?.labels?.task_types || {};
  const strategyLabels = data?.labels?.prompt_variants || {};
  const errorLabels = {
    SyntaxError: "语法错误",
    TypeError: "类型错误",
    AssertionError: "断言失败",
    FileNotFound: "文件缺失",
    DataSchema: "数据结构",
    Dependency: "依赖问题",
    "Network/API": "网络/API",
    Logic: "逻辑错误",
    Other: "其他错误",
  };
  const colors = {
    direct: "#D6604D",
    reflect: "#4393C3",
    directSoft: "#FDDBC7",
    reflectSoft: "#D1E5F0",
    ink: "#2B2B2B",
    muted: "#6B6B6B",
    neutral: "#F7F7F7",
    error: "#B2182B",
    diagnose: "#D6604D",
    fix: "#4393C3",
    pass: "#2166AC",
    fail: "#B2182B",
  };

  const state = {
    task: "all",
    strategy: "all",
    status: "all",
    selectedRun: null,
  };

  const elements = {
    taskFilter: $("#taskFilter"),
    strategyFilter: $("#strategyFilter"),
    statusFilter: $("#statusFilter"),
    flow: $("#flowChart"),
    matrix: $("#matrixChart"),
    scatter: $("#scatterChart"),
    tooltip: $("#tooltip"),
  };

  if (!data || !Array.isArray(data.runs)) {
    document.body.innerHTML =
      '<main class="empty-state"><p>数据文件未加载。请先运行 <code>python3 src/generate_demo.py</code>，再通过本地 HTTP 服务器打开页面。</p></main>';
    return;
  }

  function unique(values) {
    return [...new Set(values)].sort();
  }

  function fillSelect(select, values, labels) {
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labels[value] || value;
      select.append(option);
    });
  }

  fillSelect(elements.taskFilter, unique(data.runs.map((run) => run.task_type)), taskLabels);
  fillSelect(
    elements.strategyFilter,
    unique(data.runs.map((run) => run.prompt_variant)),
    strategyLabels,
  );

  function filteredRuns() {
    return data.runs.filter(
      (run) =>
        (state.task === "all" || run.task_type === state.task) &&
        (state.strategy === "all" || run.prompt_variant === state.strategy) &&
        (state.status === "all" || run.final_status === state.status),
    );
  }

  function pct(numerator, denominator) {
    if (!denominator) return "—";
    return `${Math.round((numerator / denominator) * 100)}%`;
  }

  function rate(runs, predicate) {
    return runs.length ? runs.filter(predicate).length / runs.length : 0;
  }

  function median(values) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const metricAnimations = new WeakMap();

  function setMetricValue(selector, target, formatter) {
    const element = $(selector);
    if (!element) return;
    if (target === null || !Number.isFinite(target)) {
      const previous = metricAnimations.get(element);
      if (previous) window.cancelAnimationFrame(previous);
      element.textContent = "—";
      element.dataset.metricValue = "";
      return;
    }
    const previousValue = Number.parseFloat(element.dataset.metricValue);
    const startValue = Number.isFinite(previousValue) ? previousValue : 0;
    element.dataset.metricValue = String(target);
    const previous = metricAnimations.get(element);
    if (previous) window.cancelAnimationFrame(previous);
    if (reducedMotion.matches || Math.abs(startValue - target) < 0.01) {
      element.textContent = formatter(target);
      return;
    }
    const startTime = performance.now();
    const duration = 420;
    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - progress) ** 3;
      element.textContent = formatter(startValue + (target - startValue) * eased);
      if (progress < 1) {
        metricAnimations.set(element, window.requestAnimationFrame(tick));
      } else {
        metricAnimations.delete(element);
      }
    };
    metricAnimations.set(element, window.requestAnimationFrame(tick));
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function clear(node) {
    node.replaceChildren();
  }

  function showTooltip(event, html) {
    elements.tooltip.innerHTML = html;
    elements.tooltip.hidden = false;
    const x = Math.min(window.innerWidth - 300, event.clientX + 14);
    const y = Math.min(window.innerHeight - 140, event.clientY + 14);
    elements.tooltip.style.left = `${Math.max(8, x)}px`;
    elements.tooltip.style.top = `${Math.max(8, y)}px`;
  }

  function hideTooltip() {
    elements.tooltip.hidden = true;
  }

  function renderMetadata() {
    const meta = data.metadata;
    const demo = meta.mode === "demo";
    $("#modeLabel").textContent = demo ? "演示数据" : "真实数据";
    $("#sourceNote").textContent = demo ? "仅供功能验收" : "匿名化数据";
    $("#messageCount").textContent = `${meta.message_count} 条事件 · ${meta.run_count} 次运行`;
    $("#headerSource").textContent = demo ? "演示数据" : "真实数据";
    $("#top").classList.toggle("is-real", !demo);
  }

  function renderMetrics(runs) {
    const successes = runs.filter((run) => run.final_status === "success");
    const firstPass = runs.filter((run) => run.first_pass);
    const errored = runs.filter((run) => run.had_error);
    const recovered = errored.filter((run) => run.final_status === "success");
    const successRate = runs.length ? successes.length / runs.length : 0;
    const firstPassRate = runs.length ? firstPass.length / runs.length : 0;
    const recoveryRate = errored.length ? recovered.length / errored.length : 0;
    setMetricValue("#metricRuns", runs.length, (value) => String(Math.round(value)));
    setMetricValue(
      "#metricSuccess",
      runs.length ? successRate * 100 : null,
      (value) => `${Math.round(value)}%`,
    );
    setMetricValue(
      "#metricFirstPass",
      runs.length ? firstPassRate * 100 : null,
      (value) => `${Math.round(value)}%`,
    );
    setMetricValue(
      "#metricRecovery",
      errored.length ? recoveryRate * 100 : null,
      (value) => `${Math.round(value)}%`,
    );
    setMetricValue(
      "#metricFixes",
      median(runs.map((run) => run.fix_rounds)),
      (value) => value.toFixed(1),
    );
    setProgressRing("#metricSuccessRing", successRate);
    setProgressRing("#metricFirstPassRing", firstPassRate);
    setProgressRing("#metricRecoveryRing", recoveryRate);
  }

  function setProgressRing(selector, value) {
    const ring = $(selector);
    if (!ring) return;
    const percentage = Math.max(0, Math.min(100, value * 100));
    ring.style.strokeDasharray = `${percentage.toFixed(1)} 100`;
  }

  function recoveryPath(run) {
    const strategy = strategyLabels[run.prompt_variant] || run.prompt_variant;
    const entry = run.first_pass ? "首次通过" : "进入修复";
    const error = run.error_types.length ? errorLabels[run.error_types[0]] || run.error_types[0] : "无错误";
    const rounds = run.fix_rounds >= 3 ? "3+ 轮修复" : `${run.fix_rounds} 轮修复`;
    const result = run.final_status === "success" ? "最终成功" : "最终失败";
    return [strategy, entry, error, rounds, result];
  }

  function renderFlow(runs) {
    clear(elements.flow);
    if (!runs.length) {
      elements.flow.innerHTML = '<div class="empty-state">当前筛选没有可展示的恢复路径。</div>';
      return;
    }
    const width = Math.max(650, elements.flow.clientWidth || 760);
    const height = 370;
    const margin = { top: 42, right: 70, bottom: 18, left: 68 };
    const layerNames = ["提示策略", "初次结果", "首个错误", "修复轮次", "最终状态"];
    const nodeMaps = layerNames.map(() => new Map());
    const links = new Map();
    runs.forEach((run) => {
      const path = recoveryPath(run);
      path.forEach((label, layer) => {
        const key = `${layer}|${label}`;
        if (!nodeMaps[layer].has(key)) nodeMaps[layer].set(key, { key, label, layer, count: 0 });
        nodeMaps[layer].get(key).count += 1;
        if (layer) {
          const source = `${layer - 1}|${path[layer - 1]}`;
          const linkKey = `${source}→${key}`;
          if (!links.has(linkKey)) links.set(linkKey, { source, target: key, count: 0, result: path[4] });
          links.get(linkKey).count += 1;
        }
      });
    });
    const xStep = (width - margin.left - margin.right) / (layerNames.length - 1);
    const maxNodeCount = Math.max(
      ...nodeMaps.flatMap((map) => [...map.values()].map((node) => node.count)),
    );
    const nodes = [];
    nodeMaps.forEach((map, layer) => {
      const layerNodes = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      const available = height - margin.top - margin.bottom;
      const gap = layerNodes.length > 1 ? Math.min(15, available * 0.06) : 0;
      const heights = layerNodes.map((node) => 20 + (node.count / maxNodeCount) * 34);
      const total = heights.reduce((sum, value) => sum + value, 0) + gap * (layerNodes.length - 1);
      let y = margin.top + Math.max(0, (available - total) / 2);
      layerNodes.forEach((node, index) => {
        node.x = margin.left + layer * xStep;
        node.y = y;
        node.height = heights[index];
        node.width = 12;
        nodes.push(node);
        y += node.height + gap;
      });
    });
    const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": "从提示策略、初次结果、错误类型、修复轮次到最终状态的恢复路径图",
    });
    layerNames.forEach((name, index) => {
      const label = svgElement("text", {
        x: margin.left + index * xStep,
        y: 18,
        "text-anchor": index === 0 ? "start" : index === layerNames.length - 1 ? "end" : "middle",
        class: "flow-layer-label",
      });
      label.textContent = name;
      svg.append(label);
    });
    [...links.values()]
      .sort((a, b) => a.count - b.count)
      .forEach((link, index) => {
        const source = nodeByKey.get(link.source);
        const target = nodeByKey.get(link.target);
        const x1 = source.x + source.width;
        const y1 = source.y + source.height / 2;
        const x2 = target.x;
        const y2 = target.y + target.height / 2;
        const curve = Math.max(30, (x2 - x1) * 0.48);
        const path = svgElement("path", {
          d: `M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`,
          class: "flow-link",
          stroke: link.result === "最终失败" ? colors.fail : colors.pass,
          "stroke-width": Math.max(2, Math.min(18, 1.5 + link.count * 0.72)),
          pathLength: 1,
        });
        path.style.setProperty("--link-index", String(index % 20));
        path.addEventListener("mousemove", (event) =>
          showTooltip(event, `<strong>${source.label} → ${target.label}</strong><br>${link.count} 次运行`),
        );
        path.addEventListener("mouseleave", hideTooltip);
        svg.append(path);
      });
    nodes.forEach((node, index) => {
      const group = svgElement("g", {
        class: "flow-node",
        role: "button",
        tabindex: "0",
        "aria-label": `${layerNames[node.layer]}：${node.label}，${node.count} 次运行`,
      });
      group.style.animationDelay = `${Math.min(index, 18) * 22}ms`;
      const selected =
        (node.layer === 0 && strategyLabels[state.strategy] === node.label) ||
        (node.layer === 4 && (state.status === "success" ? "最终成功" : "最终失败") === node.label);
      let fill = colors.neutral;
      if (node.layer === 0) fill = node.label === strategyLabels.direct ? colors.direct : colors.reflect;
      if (node.layer === 1) fill = node.label === "首次通过" ? colors.pass : colors.error;
      if (node.layer === 2) fill = node.label === "无错误" ? colors.pass : colors.error;
      if (node.layer === 3) fill = colors.fix;
      if (node.layer === 4) fill = node.label === "最终成功" ? colors.pass : colors.fail;
      const rect = svgElement("rect", {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rx: 5,
        fill,
        opacity: selected ? 1 : 0.82,
      });
      const anchor = node.layer === layerNames.length - 1 ? "end" : "start";
      const labelX = node.layer === layerNames.length - 1 ? node.x - 7 : node.x + node.width + 7;
      const text = svgElement("text", {
        x: labelX,
        y: node.y + node.height / 2 - 3,
        "text-anchor": anchor,
      });
      const first = svgElement("tspan", { x: labelX, dy: 0 });
      first.textContent = node.label;
      const second = svgElement("tspan", { x: labelX, dy: 13, fill: colors.muted });
      second.textContent = `${node.count} 次`;
      text.append(first, second);
      const activate = () => {
        if (node.layer === 0) {
          const value = Object.keys(strategyLabels).find((key) => strategyLabels[key] === node.label);
          if (value) state.strategy = value;
        }
        if (node.layer === 4) state.status = node.label === "最终成功" ? "success" : "failure";
        syncControls();
        render();
      };
      if (node.layer === 0 || node.layer === 4) {
        group.addEventListener("click", activate);
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") activate();
        });
      }
      group.addEventListener("mousemove", (event) =>
        showTooltip(event, `<strong>${node.label}</strong><br>${node.count} / ${runs.length} 次运行`),
      );
      group.addEventListener("mouseleave", hideTooltip);
      group.append(rect, text);
      svg.append(group);
    });
    elements.flow.append(svg);
  }

  function rateColor(value) {
    const mix = (start, end, amount) => {
      const from = start.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16));
      const to = end.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16));
      return `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)).join(" ")})`;
    };
    return mix(colors.directSoft, colors.reflect, Math.max(0, Math.min(1, value)));
  }

  function renderMatrix() {
    clear(elements.matrix);
    const tasks = unique(data.runs.map((run) => run.task_type));
    const strategies = unique(data.runs.map((run) => run.prompt_variant));
    const corner = document.createElement("div");
    corner.className = "matrix-heading";
    corner.textContent = "完成率";
    elements.matrix.append(corner);
    strategies.forEach((strategy) => {
      const head = document.createElement("div");
      head.className = "matrix-heading";
      head.textContent = strategyLabels[strategy] || strategy;
      elements.matrix.append(head);
    });
    let cellIndex = 0;
    tasks.forEach((task) => {
      const label = document.createElement("div");
      label.className = "matrix-row-label";
      label.textContent = taskLabels[task] || task;
      elements.matrix.append(label);
      strategies.forEach((strategy) => {
        const runs = data.runs.filter(
          (run) => run.task_type === task && run.prompt_variant === strategy,
        );
        const successRate = rate(runs, (run) => run.final_status === "success");
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "matrix-cell";
        cell.style.setProperty("--cell-index", String(cellIndex));
        cellIndex += 1;
        cell.style.background = rateColor(successRate);
        const activeTask = state.task === "all" || state.task === task;
        const activeStrategy = state.strategy === "all" || state.strategy === strategy;
        cell.style.opacity = activeTask && activeStrategy ? "1" : "0.34";
        cell.setAttribute(
          "aria-label",
          `${taskLabels[task] || task}，${strategyLabels[strategy] || strategy}，完成率 ${Math.round(
            successRate * 100,
          )}%，样本 ${runs.length} 次`,
        );
        cell.innerHTML = `<span><strong>${Math.round(successRate * 100)}%</strong><small>${
          runs.filter((run) => run.final_status === "success").length
        } / ${runs.length} 成功</small></span>`;
        cell.addEventListener("click", () => {
          state.task = task;
          state.strategy = strategy;
          state.status = "all";
          syncControls();
          render();
        });
        elements.matrix.append(cell);
      });
    });
  }

  function extent(values) {
    if (!values.length) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? [Math.max(0, min - 1), max + 1] : [min, max];
  }

  function linear(domain, range) {
    const span = domain[1] - domain[0] || 1;
    return (value) => range[0] + ((value - domain[0]) / span) * (range[1] - range[0]);
  }

  function renderScatter(runs) {
    clear(elements.scatter);
    if (!runs.length) {
      elements.scatter.innerHTML = '<div class="empty-state">当前筛选没有散点数据。</div>';
      return;
    }
    const width = Math.max(520, elements.scatter.clientWidth || 620);
    const height = 355;
    const margin = { top: 18, right: 24, bottom: 58, left: 54 };
    const xExtent = extent(runs.map((run) => run.duration_sec));
    const yExtent = extent(runs.map((run) => run.fix_rounds));
    const xPad = Math.max(5, (xExtent[1] - xExtent[0]) * 0.08);
    const x = linear([Math.max(0, xExtent[0] - xPad), xExtent[1] + xPad], [margin.left, width - margin.right]);
    const y = linear([Math.max(0, yExtent[0] - 0.5), yExtent[1] + 0.7], [height - margin.bottom, margin.top]);
    const pointOrder = new Map(
      [...runs]
        .sort(
          (a, b) =>
            x(a.duration_sec) - y(a.fix_rounds) - (x(b.duration_sec) - y(b.fix_rounds)),
        )
        .map((run, index, ordered) => [
          run.run_id,
          Math.round((index / Math.max(1, ordered.length - 1)) * 32),
        ]),
    );
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": "运行时长、修复轮次、工具调用次数与最终状态的散点图",
    });
    const xTicks = 5;
    const yTicks = Math.min(6, Math.max(2, Math.ceil(yExtent[1]) + 1));
    for (let i = 0; i < xTicks; i += 1) {
      const value = x.domainMin
        ? x.domainMin + i
        : Math.max(0, xExtent[0] - xPad) + (i / (xTicks - 1)) * (xExtent[1] + xPad - Math.max(0, xExtent[0] - xPad));
      const px = x(value);
      svg.append(
        svgElement("line", {
          x1: px,
          y1: margin.top,
          x2: px,
          y2: height - margin.bottom,
          class: "grid-line",
        }),
      );
      const label = svgElement("text", {
        x: px,
        y: height - margin.bottom + 20,
        "text-anchor": "middle",
        class: "axis-label",
      });
      label.textContent = Math.round(value);
      svg.append(label);
    }
    for (let i = 0; i < yTicks; i += 1) {
      const value = i;
      const py = y(value);
      svg.append(
        svgElement("line", {
          x1: margin.left,
          y1: py,
          x2: width - margin.right,
          y2: py,
          class: "grid-line",
        }),
      );
      const label = svgElement("text", {
        x: margin.left - 10,
        y: py + 4,
        "text-anchor": "end",
        class: "axis-label",
      });
      label.textContent = String(value);
      svg.append(label);
    }
    svg.append(
      svgElement("line", {
        x1: margin.left,
        y1: height - margin.bottom,
        x2: width - margin.right,
        y2: height - margin.bottom,
        class: "axis-line",
      }),
    );
    const xTitle = svgElement("text", {
      x: (margin.left + width - margin.right) / 2,
      y: height - 14,
      "text-anchor": "middle",
      class: "axis-title",
    });
    xTitle.textContent = "运行时长（秒）";
    const yTitle = svgElement("text", {
      transform: `translate(14 ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`,
      "text-anchor": "middle",
      class: "axis-title",
    });
    yTitle.textContent = "修复轮次（轮）";
    svg.append(xTitle, yTitle);
    runs.forEach((run, index) => {
      const point = svgElement("circle", {
        cx: x(run.duration_sec),
        cy: y(run.fix_rounds),
        r: Math.min(12, 4 + run.tool_calls * 1.1),
        fill: run.final_status === "success" ? colors.pass : colors.fail,
        class: `scatter-point${state.selectedRun === run.run_id ? " is-selected" : ""}`,
        tabindex: "0",
        role: "button",
        "aria-label": `${run.run_id}，${run.duration_sec} 秒，${run.fix_rounds} 轮修复，${run.tool_calls} 次工具调用，${
          run.final_status === "success" ? "成功" : "失败"
        }`,
      });
      point.style.setProperty("--point-index", String(pointOrder.get(run.run_id) ?? index % 22));
      const detail = `<strong>${run.run_id}</strong><br>${taskLabels[run.task_type]} · ${
        strategyLabels[run.prompt_variant]
      }<br>${run.duration_sec} 秒 · ${run.fix_rounds} 轮修复 · ${run.tool_calls} 次工具调用`;
      point.addEventListener("mousemove", (event) => showTooltip(event, detail));
      point.addEventListener("mouseleave", hideTooltip);
      const choose = () => {
        state.selectedRun = run.run_id;
        renderScatter(runs);
        renderExplorer(runs);
      };
      point.addEventListener("click", choose);
      point.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") choose();
      });
      svg.append(point);
    });
    elements.scatter.append(svg);
  }

  function renderAdvancedViews(runs) {
    if (!window.TraceVega) {
      renderScatter(runs);
      return Promise.resolve();
    }
    return window.TraceVega.renderAll(runs, data.labels || {}, (runId) => {
      if (!runs.some((run) => run.run_id === runId)) return;
      state.selectedRun = runId;
      renderExplorer(runs);
    });
  }

  function renderExplorer(runs) {
    const list = $("#runList");
    clear(list);
    $("#runListCount").textContent = `${runs.length} 条`;
    if (!runs.length) {
      list.innerHTML = '<div class="empty-state">没有符合条件的运行。</div>';
      $("#timeline").replaceChildren();
      $("#runSummary").replaceChildren();
      $("#logDetail").textContent = "";
      $("#selectedRunBadge").textContent = "未选择";
      return;
    }
    if (!runs.some((run) => run.run_id === state.selectedRun)) state.selectedRun = runs[0].run_id;
    runs.slice(0, 18).forEach((run, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "run-item";
      button.style.setProperty("--item-index", String(index));
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(run.run_id === state.selectedRun));
      button.innerHTML = `
        <i class="status-dot ${run.final_status === "success" ? "success" : ""}" aria-hidden="true"></i>
        <span><strong>${run.run_id}</strong><small>${taskLabels[run.task_type]} · ${
          strategyLabels[run.prompt_variant]
        }</small></span>
        <span>${run.fix_rounds} 轮</span>`;
      button.addEventListener("click", () => {
        state.selectedRun = run.run_id;
        renderAdvancedViews(runs);
        renderExplorer(runs);
      });
      list.append(button);
    });
    const run = runs.find((item) => item.run_id === state.selectedRun) || runs[0];
    $("#selectedRunBadge").textContent = run.run_id;
    const summary = $("#runSummary");
    summary.innerHTML = [
      ["task", "任务", taskLabels[run.task_type]],
      ["strategy", "策略", strategyLabels[run.prompt_variant]],
      ["status", "状态", run.final_status === "success" ? "成功" : "失败"],
      ["duration", "时长", `${run.duration_sec} 秒`],
    ]
      .map(
        ([key, label, value]) =>
          `<span class="summary-chip summary-${key}${
            key === "status" ? ` is-${run.final_status}` : ""
          }">${label}：<b>${value}</b></span>`,
      )
      .join("");
    const timeline = $("#timeline");
    clear(timeline);
    run.events.forEach((event, index) => {
      const item = document.createElement("li");
      item.className = `timeline-event is-${event.event_type}`;
      item.style.setProperty("--event-index", String(index));
      const copy = compactEventResult(event);
      item.innerHTML = `
        <i class="event-dot" aria-hidden="true"></i>
        <span class="event-action">${event.action}</span>
        <span class="event-copy">${escapeHtml(copy)}</span>`;
      timeline.append(item);
    });
    $("#logDetail").textContent = run.events
      .map(
        (event) =>
          `[${event.turn_id.toString().padStart(2, "0")}] ${event.role.toUpperCase()} / ${event.action}\n${
            event.error || event.content || "（无文本）"
          }`,
      )
      .join("\n\n");
  }

  function compactEventResult(event) {
    const text = String(event.error || event.content || "").trim();
    if (event.event_type === "receive") return "已接收";
    if (event.event_type === "plan") return "输入与测试";
    if (event.event_type === "code") return "首版完成";
    if (event.event_type === "error") {
      return text.match(/\b[A-Za-z]+Error\b/)?.[0] || "测试未通过";
    }
    if (event.event_type === "diagnose") {
      const errorType = text.match(/\b[A-Za-z]+Error\b/)?.[0];
      return errorType ? `定位 ${errorType}` : "定位根因";
    }
    if (event.event_type === "fix") {
      const round = text.match(/第\s*(\d+)\s*轮/)?.[1];
      return round ? `第 ${round} 轮完成` : "补丁完成";
    }
    if (event.event_type === "test") {
      const passed = text.match(/(\d+)\s+passed/i)?.[1];
      return passed ? `${passed} 项通过` : /fail/i.test(text) ? "测试未通过" : "测试通过";
    }
    if (event.event_type === "success") return "全部通过";
    if (event.event_type === "stop") return "未恢复";
    return text.length > 16 ? `${text.slice(0, 16)}…` : text || "已记录";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInsights(runs) {
    const list = $("#insightList");
    clear(list);
    if (!runs.length) {
      list.innerHTML = "<li>当前筛选没有足够数据生成发现。</li>";
      return;
    }
    const direct = runs.filter((run) => run.prompt_variant === "direct");
    const reflect = runs.filter((run) => run.prompt_variant === "reflect");
    const directSuccess = rate(direct, (run) => run.final_status === "success");
    const reflectSuccess = rate(reflect, (run) => run.final_status === "success");
    const directFirst = rate(direct, (run) => run.first_pass);
    const reflectFirst = rate(reflect, (run) => run.first_pass);
    const errored = runs.filter((run) => run.had_error);
    const recovered = errored.filter((run) => run.final_status === "success");
    const taskStats = unique(runs.map((run) => run.task_type)).map((task) => {
      const subset = runs.filter((run) => run.task_type === task);
      const d = subset.filter((run) => run.prompt_variant === "direct");
      const r = subset.filter((run) => run.prompt_variant === "reflect");
      return {
        task,
        direct: rate(d, (run) => run.final_status === "success"),
        reflect: rate(r, (run) => run.final_status === "success"),
        count: subset.length,
        medianFix: median(subset.map((run) => run.fix_rounds)),
      };
    });
    const largestGap = taskStats.sort(
      (a, b) => Math.abs(b.reflect - b.direct) - Math.abs(a.reflect - a.direct),
    )[0];
    const noFix = runs.filter((run) => run.fix_rounds === 0);
    const multiFix = runs.filter((run) => run.fix_rounds >= 2);
    const anomaly = [...runs].sort(
      (a, b) => b.fix_rounds - a.fix_rounds || b.duration_sec - a.duration_sec,
    )[0];
    const items = [
      `<strong>总体完成差异：</strong>结构化反思为 ${pct(
        reflect.filter((run) => run.final_status === "success").length,
        reflect.length,
      )}（n=${reflect.length}），直接提示为 ${pct(
        direct.filter((run) => run.final_status === "success").length,
        direct.length,
      )}（n=${direct.length}），相差 ${Math.round((reflectSuccess - directSuccess) * 100)} 个百分点。`,
      `<strong>首次通过：</strong>结构化反思的首次通过率为 ${Math.round(
        reflectFirst * 100,
      )}%，直接提示为 ${Math.round(directFirst * 100)}%；这一指标只描述首轮测试，不等于最终质量。`,
      `<strong>错误恢复：</strong>${errored.length} 次出现错误的运行中有 ${recovered.length} 次最终成功，恢复率为 ${pct(
        recovered.length,
        errored.length,
      )}；路径图可继续核查错误类型与修复轮次。`,
      largestGap
        ? `<strong>多变量关系：</strong>${taskLabels[largestGap.task]}中，结构化反思与直接提示的完成率分别为 ${Math.round(
            largestGap.reflect * 100,
          )}% 和 ${Math.round(largestGap.direct * 100)}%（n=${
            largestGap.count
          }），该任务的修复轮次中位数为 ${largestGap.medianFix.toFixed(1)}。`
        : "<strong>多变量关系：</strong>当前筛选不足以比较任务、策略与结果。",
      `<strong>异常与代价：</strong>${anomaly.run_id} 出现 ${anomaly.fix_rounds} 轮修复、${
        anomaly.tool_calls
      } 次工具调用并最终${anomaly.final_status === "success" ? "成功" : "失败"}；同时，0 轮修复运行平均 ${mean(
        noFix.map((run) => run.duration_sec),
      ).toFixed(1)} 秒，2 轮及以上平均 ${mean(multiFix.map((run) => run.duration_sec)).toFixed(
        1,
      )} 秒。异常个案应回到时间线而非只看均值。`,
    ];
    items.forEach((html) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      copy.className = "insight-copy";
      copy.innerHTML = html;
      item.append(copy);
      list.append(item);
    });
  }

  function syncControls() {
    elements.taskFilter.value = state.task;
    elements.strategyFilter.value = state.strategy;
    elements.statusFilter.value = state.status;
  }

  function renderFilterSummary(runs) {
    $("#filterSummary").textContent = `${runs.length} 次运行`;
  }

  async function renderContent() {
    const runs = filteredRuns();
    renderFilterSummary(runs);
    renderMetrics(runs);
    renderFlow(runs);
    renderMatrix();
    const advancedViews = renderAdvancedViews(runs);
    renderExplorer(runs);
    renderInsights(runs);
    await advancedViews;
  }

  function animateRefreshedViews() {
    const regions = [$(".metric-grid"), $(".dashboard-grid"), $(".insights")].filter(Boolean);
    regions.forEach((region) => region.classList.remove("is-refreshing"));
    if (regions[0]) void regions[0].offsetWidth;
    regions.forEach((region) => region.classList.add("is-refreshing"));
    window.setTimeout(
      () => regions.forEach((region) => region.classList.remove("is-refreshing")),
      420,
    );
  }

  function render({ animate = true } = {}) {
    if (!animate || reducedMotion.matches) return renderContent();
    if (typeof document.startViewTransition === "function") {
      const transition = document.startViewTransition(() => renderContent());
      transition.finished.catch(() => {});
      return transition.finished;
    }
    return renderContent().then(animateRefreshedViews);
  }

  elements.taskFilter.addEventListener("change", (event) => {
    state.task = event.target.value;
    render();
  });
  elements.strategyFilter.addEventListener("change", (event) => {
    state.strategy = event.target.value;
    render();
  });
  elements.statusFilter.addEventListener("change", (event) => {
    state.status = event.target.value;
    render();
  });
  $("#resetButton").addEventListener("click", () => {
    Object.assign(state, { task: "all", strategy: "all", status: "all", selectedRun: null });
    syncControls();
    render();
  });
  $("#exportButton").addEventListener("click", () => {
    const payload = {
      exported_at: new Date().toISOString(),
      filters: { task: state.task, strategy: state.strategy, status: state.status },
      source_mode: data.metadata.mode,
      runs: filteredRuns(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "trace-filtered-runs.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const runs = filteredRuns();
      renderFlow(runs);
      renderAdvancedViews(runs);
    }, 120);
  });

  renderMetadata();
  syncControls();
  render({ animate: false });
})();

