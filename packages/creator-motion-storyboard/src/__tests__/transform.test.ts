import { describe, it, expect } from "bun:test";
import { transform } from "../transform";
import { validCapsule } from "./fixtures";

describe("transform", () => {
  it("produces a StoryboardOutput from a valid capsule", () => {
    const result = transform(validCapsule);
    expect(result.capsuleId).toBe("cap-001");
    expect(result.sceneCount).toBe(2);
    expect(result.totalDurationMs).toBe(5500);
    expect(typeof result.generatedAt).toBe("string");
    expect(typeof result.html).toBe("string");
  });

  it("generates self-contained HTML", () => {
    const result = transform(validCapsule);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<title>Test Storyboard");
    expect(result.html).toContain("scene-1");
    expect(result.html).toContain("scene-2");
  });

  it("escapes HTML in user content", () => {
    const capsule = {
      ...validCapsule,
      title: '<script>alert("xss")</script>',
      scenes: [
        {
          ...validCapsule.scenes[0],
          caption: '<img src=x onerror=alert(1)>',
          elements: [
            {
              type: "text" as const,
              x: 0,
              y: 0,
              width: 100,
              height: 20,
              content: '<iframe src="evil">',
            },
          ],
        },
      ],
    };
    const result = transform(capsule);
    // XSS: unescaped HTML tags must not appear in output
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img ");
    expect(result.html).not.toContain("<iframe");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).toContain("&lt;iframe");
  });

  it("renders canvas dimensions in the output", () => {
    const result = transform(validCapsule);
    expect(result.html).toContain("width:1280px");
    expect(result.html).toContain("height:720px");
  });

  it("renders scene metadata", () => {
    const result = transform(validCapsule);
    expect(result.html).toContain("Total duration: 5.5s");
    expect(result.html).toContain("Scenes: 2");
  });
});
