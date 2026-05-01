import { describe, it, expect } from "bun:test";
import { machineCheck } from "../validate";
import { validCapsule } from "./fixtures";

describe("machineCheck", () => {
  it("passes a valid capsule", () => {
    expect(machineCheck(validCapsule).valid).toBe(true);
  });

  it("catches index mismatch", () => {
    const c = {
      ...validCapsule,
      scenes: [{ ...validCapsule.scenes[0], index: 5 }],
    };
    const r = machineCheck(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("index"))).toBe(true);
  });

  it("catches non-positive duration", () => {
    const c = {
      ...validCapsule,
      scenes: [{ ...validCapsule.scenes[0], duration: 0 }],
    };
    const r = machineCheck(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("duration"))).toBe(true);
  });

  it("catches duplicate scene ids", () => {
    const c = {
      ...validCapsule,
      scenes: [
        validCapsule.scenes[0],
        { ...validCapsule.scenes[1], id: "scene-1" },
      ],
    };
    const r = machineCheck(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("catches element overflowing canvas width", () => {
    const c = {
      ...validCapsule,
      scenes: [
        {
          ...validCapsule.scenes[0],
          elements: [
            { type: "text" as const, x: 1200, y: 0, width: 200, height: 40 },
          ],
        },
      ],
    };
    const r = machineCheck(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("overflows canvas width"))).toBe(
      true,
    );
  });

  it("catches negative element position", () => {
    const c = {
      ...validCapsule,
      scenes: [
        {
          ...validCapsule.scenes[0],
          elements: [
            { type: "text" as const, x: -10, y: 0, width: 100, height: 40 },
          ],
        },
      ],
    };
    const r = machineCheck(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("negative position"))).toBe(true);
  });
});
