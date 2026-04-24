import { animate, inView, stagger } from "motion";

const ease = [0.22, 1, 0.36, 1];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.documentElement.classList.add("motion-enhanced");

const revealSelector = [
  ".site-shell",
  ".hero-copy",
  ".result-frame",
  ".signal",
  ".timeline article",
  ".pipeline-strip",
  ".evidence-card",
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

function revealElements() {
  const targets = [...document.querySelectorAll(revealSelector)];

  if (reducedMotion) {
    targets.forEach((target) => {
      target.style.opacity = "";
      target.style.transform = "";
    });
    return;
  }

  targets.forEach((target, index) => {
    inView(
      target,
      () => {
        animate(
          target,
          {
            transform: ["translateY(18px)", "translateY(0px)"]
          },
          {
            delay: Math.min(index * 0.018, 0.18),
            duration: 0.72,
            ease
          }
        );
      },
      { amount: 0.12, margin: "0px 0px -10% 0px" }
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

revealElements();
animateFills();
animateCounters();
stageHero();

const chartRoot = document.getElementById("rar-chart-root");
if (chartRoot) {
  mountDashboardChart(chartRoot).catch((error) => {
    chartRoot.dataset.enhanced = "failed";
    console.warn("[handoff] chart enhancement failed", error?.message || error);
  });
}
