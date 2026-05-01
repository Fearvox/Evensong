import type { Capsule, StoryboardOutput } from "./types";

/**
 * Transforms a validated capsule into a StoryboardOutput containing
 * a self-contained HTML storyboard page.
 *
 * Public-safe: the generated HTML escapes all capsule-originated strings
 * so user content is rendered as text, never interpreted as markup or script.
 */
export function transform(capsule: Capsule): StoryboardOutput {
  const html = renderStoryboard(capsule);
  const totalDurationMs = capsule.scenes.reduce(
    (sum, s) => sum + s.duration,
    0,
  );

  return {
    capsuleId: capsule.id,
    generatedAt: new Date().toISOString(),
    html,
    sceneCount: capsule.scenes.length,
    totalDurationMs,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSceneCSS(sceneIndex: number, total: number): string {
  const pct = (sceneIndex / Math.max(total, 1)) * 100;
  return `.scene-${sceneIndex} { animation-delay: ${pct}%; }`;
}

function renderSceneElements(
  elements: Capsule["scenes"][number]["elements"],
): string {
  return elements
    .map((el) => {
      const styles = Object.entries(el.style ?? {})
        .map(([k, v]) => `${k}:${v}`)
        .join(";");
      return `<div class="el el-${el.type}" style="left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;${styles}">${esc(el.content ?? "")}</div>`;
    })
    .join("\n");
}

function renderStoryboard(capsule: Capsule): string {
  const { width, height } = capsule.canvas;
  const scenes = capsule.scenes;
  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);

  const sceneMarkers = scenes
    .map(
      (s, i) => `
    <div class="scene" id="scene-${esc(s.id)}">
      <div class="scene-canvas" style="width:${width}px;height:${height}px;background:${s.background ?? "#1a1a2e"};">
        ${renderSceneElements(s.elements)}
        ${s.caption ? `<div class="caption">${esc(s.caption)}</div>` : ""}
        ${s.overlay ? `<div class="overlay">${esc(s.overlay)}</div>` : ""}
      </div>
      <div class="scene-meta">
        <span class="scene-index">#${i + 1}</span>
        <span class="scene-duration">${(s.duration / 1000).toFixed(1)}s</span>
        <span class="scene-transition">${esc(s.transition)}</span>
      </div>
    </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(capsule.title)} — Motion Storyboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f1a;color:#e0e0e0;padding:24px}
h1{font-size:1.25rem;margin-bottom:8px;color:#fff}
.meta-bar{font-size:.8rem;color:#888;margin-bottom:24px;display:flex;gap:16px;flex-wrap:wrap}
.storyboard{display:flex;flex-wrap:wrap;gap:24px;justify-content:center}
.scene{border-radius:8px;overflow:hidden;background:#1a1a2e;box-shadow:0 4px 24px rgba(0,0,0,.4)}
.scene-canvas{position:relative;overflow:hidden}
.el{position:absolute;display:flex;align-items:center;justify-content:center;font-size:14px}
.el-text{color:#fff;background:rgba(0,0,0,.5);border-radius:4px;padding:4px 8px}
.el-shape{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:4px}
.el-placeholder{background:repeating-linear-gradient(45deg,rgba(255,255,255,.03),rgba(255,255,255,.03) 10px,rgba(255,255,255,.06) 10px,rgba(255,255,255,.06) 20px);border:1px dashed rgba(255,255,255,.2);border-radius:4px}
.caption{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;padding:6px 16px;border-radius:4px;font-size:13px;max-width:90%;text-align:center}
.overlay{position:absolute;top:12px;right:12px;background:rgba(0,0,0,.6);color:#ccc;padding:4px 10px;border-radius:4px;font-size:11px}
.scene-meta{display:flex;gap:12px;padding:8px 12px;font-size:.75rem;color:#666;background:rgba(0,0,0,.3)}
.scene-index{color:#fff;font-weight:600}
.scene-duration{color:#aaa}
@media (max-width:${width + 48}px){.storyboard{flex-direction:column;align-items:center}}
</style>
</head>
<body>
<h1>${esc(capsule.title)}</h1>
<div class="meta-bar">
  <span>Scenes: ${scenes.length}</span>
  <span>Total duration: ${(totalDuration / 1000).toFixed(1)}s</span>
  <span>Canvas: ${width}&times;${height}</span>
  <span>Generated: ${new Date().toISOString()}</span>
</div>
<div class="storyboard">
  ${sceneMarkers}
</div>
</body>
</html>`;
}
