import { animate, inView, stagger } from "motion";

const ease = [0.22, 1, 0.36, 1];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.documentElement.classList.add("motion-enhanced");

const revealSelector = [
  ".site-shell",
  ".hero-copy",
  ".result-frame",
  ".section-grid > div",
  ".section-heading",
  ".signal",
  ".timeline article",
  ".pipeline-strip",
  ".route-chart-shell",
  ".route-note",
  ".evidence-card",
  ".evidence-focus",
  ".note-stack article",
  ".figure-band figure",
  ".dashboard-hero > *",
  ".kpi-card",
  ".chart-shell",
  ".data-card",
  ".table-wrap",
  ".compare-row",
  ".matrix",
  ".axis-card",
  ".artifact-row"
].join(",");

const revealGroups = [
  { group: ".hero-shell", items: ".hero-copy, .result-frame", amount: 0.2 },
  { group: ".signal-band", items: ".signal", amount: 0.18 },
  { group: ".section-grid", items: ":scope > div", amount: 0.16 },
  { group: ".timeline", items: "article", amount: 0.2 },
  { group: ".pipeline-strip", items: ".pipe-node, .pipe-arrow", amount: 0.2 },
  { group: ".route-layout", items: ".route-chart-shell, .route-note", amount: 0.15 },
  { group: ".evidence-layout", items: ".evidence-card, .evidence-focus", amount: 0.15 },
  { group: ".note-stack", items: "article", amount: 0.18 },
  { group: ".figure-band", items: "figure", amount: 0.15 },
  { group: ".dashboard-hero", items: ":scope > *", amount: 0.2 },
  { group: ".kpi-grid", items: ".kpi-card", amount: 0.18 },
  { group: ".data-grid", items: ".data-card", amount: 0.14 },
  { group: ".axis-grid", items: ".axis-card", amount: 0.18 },
  { group: ".artifact-list", items: ".artifact-row", amount: 0.18 }
];

function prepareForReveal(targets) {
  targets.forEach((target) => {
    if (target.dataset.revealReady === "true") return;
    target.dataset.revealReady = "true";
    target.style.opacity = "0";
    target.style.transform = "translateY(18px)";
  });
}

function runReveal(targets, startDelay = 0) {
  const pending = targets.filter((target) => target.dataset.revealDone !== "true");
  if (!pending.length) return;

  pending.forEach((target) => {
    target.dataset.revealDone = "true";
  });

  animate(
    pending,
    {
      opacity: [0, 1],
      transform: ["translateY(18px)", "translateY(0px)"]
    },
    {
      delay: stagger(0.055, { startDelay }),
      duration: 0.68,
      ease
    }
  );
}

function revealElements() {
  const grouped = new Set();

  if (reducedMotion) {
    const targets = [...document.querySelectorAll(revealSelector)];
    targets.forEach((target) => {
      target.style.opacity = "";
      target.style.transform = "";
    });
    return;
  }

  revealGroups.forEach(({ group, items, amount }) => {
    document.querySelectorAll(group).forEach((container) => {
      const targets = [...container.querySelectorAll(items)];
      if (!targets.length) return;
      targets.forEach((target) => grouped.add(target));
      prepareForReveal(targets);
      inView(
        container,
        () => runReveal(targets),
        { amount, margin: "0px 0px -8% 0px" }
      );
    });
  });

  const leftovers = [...document.querySelectorAll(revealSelector)].filter((target) => !grouped.has(target));
  prepareForReveal(leftovers);
  leftovers.forEach((target) => {
    inView(
      target,
      () => runReveal([target]),
      { amount: 0.14, margin: "0px 0px -8% 0px" }
    );
  });
}

function animateFills() {
  const fills = [...document.querySelectorAll(".fill")];

  if (reducedMotion) return;

  fills.forEach((fill) => {
    const targetWidth = fill.style.getPropertyValue("--w") || "100%";
    inView(fill, () => {
      animate(fill, { width: ["0%", targetWidth.trim()] }, { duration: 0.82, ease });
    });
  });
}

function animateCounters() {
  const counters = [...document.querySelectorAll("[data-count-to]")];

  if (reducedMotion) return;

  counters.forEach((counter) => {
    const target = Number(counter.dataset.countTo);
    if (!Number.isFinite(target)) return;

    const suffix = counter.dataset.countSuffix || "";
    const decimals = String(counter.dataset.countTo).includes(".") ? 1 : 0;

    inView(counter, () => {
      animate(0, target, {
        duration: 0.78,
        ease,
        onUpdate(value) {
          counter.textContent = `${value.toFixed(decimals)}${suffix}`;
        },
        onComplete() {
          counter.textContent = `${target.toFixed(decimals)}${suffix}`;
        }
      });
    });
  });
}

function stageHero() {
  if (reducedMotion) return;

  const heroItems = document.querySelectorAll(".hero-actions .button, .metric-list div, .pipe-node");
  if (!heroItems.length) return;

  animate(
    heroItems,
    { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
    { delay: stagger(0.055, { startDelay: 0.18 }), duration: 0.55, ease }
  );
}

function animateRouteFallbacks() {
  if (reducedMotion) return;

  document.querySelectorAll(".route-track").forEach((track) => {
    const nodes = [...track.querySelectorAll(".route-node")];
    const edges = [...track.querySelectorAll(".route-edge")];

    nodes.forEach((node) => {
      node.style.opacity = "0";
      node.style.transform = "translateY(10px)";
    });
    edges.forEach((edge) => {
      edge.style.transformOrigin = "left center";
      edge.style.transform = "scaleX(0)";
      edge.style.opacity = "0.1";
    });

    inView(
      track,
      () => {
        animate(
          nodes,
          { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
          { delay: stagger(0.075), duration: 0.58, ease }
        );
        animate(
          edges,
          { opacity: [0.1, 1], transform: ["scaleX(0)", "scaleX(1)"] },
          { delay: stagger(0.08, { startDelay: 0.16 }), duration: 0.62, ease }
        );
      },
      { amount: 0.24, margin: "0px 0px -8% 0px" }
    );
  });
}

function tooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const ReactRef = window.React;
  if (!ReactRef) return null;

  const lines = payload
    .map((item) => `${item.name}: ${item.value}`)
    .join(" / ");

  return ReactRef.createElement(
    "div",
    { className: "chart-tooltip" },
    ReactRef.createElement("strong", null, label),
    ReactRef.createElement("span", null, lines)
  );
}

async function mountDashboardChart(root) {
  const [
    { default: ReactModule },
    { createRoot },
    Recharts
  ] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("recharts")
  ]);

  window.React = ReactModule;
  const React = ReactModule;
  const {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Cell
  } = Recharts;

  const data = [
    { name: "dense", top1: 17, top5: 18, p50: 526, color: "#77766d" },
    { name: "dense-rar", top1: 24, top5: 24, p50: 1703, color: "#2f6a58" },
    { name: "adaptive", top1: 24, top5: 24, p50: 1615, color: "#b18a22" }
  ];

  const maxLatency = Math.max(...data.map((row) => row.p50));

  function BenchmarkChart() {
    return React.createElement(
      "div",
      {
        className: "chart-enhanced",
        "data-motion": "recharts-island"
      },
      React.createElement(
        "div",
        { className: "chart-panel" },
        React.createElement(
          "div",
          { className: "chart-legend", "aria-hidden": "true" },
          React.createElement("span", null, React.createElement("i", { style: { "--c": "#2f6a58" } }), "Top-1"),
          React.createElement("span", null, React.createElement("i", { style: { "--c": "#b18a22" } }), "Top-5")
        ),
        React.createElement(
          ResponsiveContainer,
          { width: "100%", height: 300 },
          React.createElement(
            BarChart,
            {
              data,
              margin: { top: 8, right: 16, bottom: 8, left: -12 },
              barGap: 5,
              barCategoryGap: "24%",
              accessibilityLayer: true
            },
            React.createElement(XAxis, {
              dataKey: "name",
              axisLine: false,
              tickLine: false,
              tick: { fill: "#69675f", fontSize: 12 }
            }),
            React.createElement(YAxis, {
              domain: [0, 24],
              ticks: [0, 12, 24],
              axisLine: false,
              tickLine: false,
              tick: { fill: "#69675f", fontSize: 12 }
            }),
            React.createElement(Tooltip, { content: tooltipContent, cursor: { fill: "rgba(47, 106, 88, 0.08)" } }),
            React.createElement(
              Bar,
              {
                name: "Top-1",
                dataKey: "top1",
                radius: [4, 4, 0, 0],
                isAnimationActive: !reducedMotion,
                animationDuration: 900
              },
              data.map((entry) => React.createElement(Cell, { key: `${entry.name}-top1`, fill: entry.color }))
            ),
            React.createElement(Bar, {
              name: "Top-5",
              dataKey: "top5",
              fill: "#b18a22",
              radius: [4, 4, 0, 0],
              isAnimationActive: !reducedMotion,
              animationDuration: 1050
            })
          )
        )
      ),
      React.createElement(
        "aside",
        { className: "chart-side" },
        data.map((row) =>
          React.createElement(
            "div",
            {
              className: "chart-stat",
              key: row.name
            },
            React.createElement("span", null, row.name),
            React.createElement("strong", null, `${row.top1}/24`),
            React.createElement(
              "p",
              null,
              `p50 ${row.p50} ms / ${Math.round((row.p50 / maxLatency) * 100)}% of max chart latency`
            )
          )
        )
      )
    );
  }

  root.dataset.enhanced = "true";
  createRoot(root).render(React.createElement(BenchmarkChart));
  if (!reducedMotion) {
    requestAnimationFrame(() => {
      const enhanced = root.querySelector(".chart-enhanced");
      if (enhanced) {
        animate(enhanced, { transform: ["translateY(16px)", "translateY(0px)"] }, { duration: 0.7, ease });
      }
    });
  }
}

function routeTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const ReactRef = window.React;
  if (!ReactRef) return null;
  const row = payload[0]?.payload;

  return ReactRef.createElement(
    "div",
    { className: "chart-tooltip" },
    ReactRef.createElement("strong", null, label),
    ReactRef.createElement("span", null, row?.detail || "")
  );
}

async function mountRouteGraph(root) {
  const [
    { default: ReactModule },
    { createRoot },
    Recharts
  ] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("recharts")
  ]);

  window.React = ReactModule;
  const React = ReactModule;
  const {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid
  } = Recharts;

  const routeKind = root.dataset.routeGraph || "handoff";
  const routeSets = {
    handoff: [
      { stage: "Query", value: 58, detail: "24 adversarial Wave 3+I retrieval cases enter one formal harness.", color: "#69675f" },
      { stage: "TopK 50", value: 61, detail: "BGE-M3 exposes the ideal candidate for q113 at rank 27.", color: "#2f6a58" },
      { stage: "RAR", value: 65, detail: "DeepSeek V4 Flash reranks the exposed candidate pool.", color: "#b18a22" },
      { stage: "0854", value: 72, detail: "The clean formal run records 24/24 for dense-rar and adaptive.", color: "#2f6a58" }
    ],
    dashboard: [
      { stage: "0801", value: 52, detail: "TopK 20 baseline is clean but misses the q113 ideal candidate.", color: "#77766d" },
      { stage: "Rank 27", value: 61, detail: "The q113 diagnostic shows the ideal appears inside TopK 50.", color: "#b18a22" },
      { stage: "RAR", value: 66, detail: "The reranker selects the ideal once it is present.", color: "#2f6a58" },
      { stage: "24/24", value: 74, detail: "Formal 0854 closes the suite with zero pipeline errors.", color: "#2f6a58" }
    ]
  };
  const data = routeSets[routeKind] || routeSets.handoff;

  function RouteDot(props) {
    const { cx, cy, payload } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

    return React.createElement(
      "g",
      null,
      React.createElement("circle", {
        cx,
        cy,
        r: 9,
        fill: payload.color,
        stroke: "#f7f4ea",
        strokeWidth: 3
      }),
      React.createElement("circle", {
        cx,
        cy,
        r: 15,
        fill: "none",
        stroke: payload.color,
        strokeOpacity: 0.18,
        strokeWidth: 2
      })
    );
  }

  function RouteGraph() {
    return React.createElement(
      "div",
      { className: "route-chart-enhanced", "data-motion": "route-graph" },
      React.createElement(
        "div",
        { className: "route-chart-panel" },
        React.createElement(
          ResponsiveContainer,
          { width: "100%", height: 230 },
          React.createElement(
            LineChart,
            { data, margin: { top: 22, right: 24, bottom: 20, left: 24 }, accessibilityLayer: true },
            React.createElement(CartesianGrid, { stroke: "rgba(105, 103, 95, 0.16)", vertical: false }),
            React.createElement(XAxis, {
              dataKey: "stage",
              axisLine: false,
              tickLine: false,
              interval: 0,
              tick: { fill: "#69675f", fontSize: 12, fontWeight: 600 }
            }),
            React.createElement(YAxis, {
              hide: true,
              domain: [48, 78]
            }),
            React.createElement(Tooltip, { content: routeTooltipContent, cursor: { stroke: "rgba(47, 106, 88, 0.18)" } }),
            React.createElement(Line, {
              type: "monotone",
              dataKey: "value",
              stroke: "#2f6a58",
              strokeWidth: 2.5,
              dot: RouteDot,
              activeDot: { r: 8 },
              isAnimationActive: !reducedMotion,
              animationDuration: 1100
            })
          )
        )
      ),
      React.createElement(
        "div",
        { className: "route-chart-copy" },
        data.map((row, index) =>
          React.createElement(
            "div",
            { key: row.stage },
            React.createElement("strong", null, `${String(index + 1).padStart(2, "0")} / ${row.stage}`),
            React.createElement("span", null, row.detail)
          )
        )
      )
    );
  }

  root.dataset.enhanced = "true";
  createRoot(root).render(React.createElement(RouteGraph));
  if (!reducedMotion) {
    requestAnimationFrame(() => {
      const enhanced = root.querySelector(".route-chart-enhanced");
      if (enhanced) {
        animate(
          enhanced,
          { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0px)"] },
          { duration: 0.68, ease }
        );
      }
    });
  }
}

revealElements();
animateFills();
animateCounters();
stageHero();
animateRouteFallbacks();

const chartRoot = document.getElementById("rar-chart-root");
if (chartRoot) {
  mountDashboardChart(chartRoot).catch((error) => {
    chartRoot.dataset.enhanced = "failed";
    console.warn("[handoff] chart enhancement failed", error?.message || error);
  });
}

document.querySelectorAll("[data-route-graph]").forEach((root) => {
  mountRouteGraph(root).catch((error) => {
    root.dataset.enhanced = "failed";
    console.warn("[handoff] route graph enhancement failed", error?.message || error);
  });
});
