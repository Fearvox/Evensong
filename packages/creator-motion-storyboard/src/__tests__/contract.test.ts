import { describe, it, expect } from "bun:test";
import { validateCapsule, CAPSULE_SCHEMA } from "../contract";
import { validCapsule } from "./fixtures";

describe("CAPSULE_SCHEMA", () => {
  it("has a $id", () => {
    expect(CAPSULE_SCHEMA.$id).toBe("https://syndash.dev/schemas/capsule-v1.json");
  });

  it("requires id, title, canvas, scenes", () => {
    expect(CAPSULE_SCHEMA.required).toContain("id");
    expect(CAPSULE_SCHEMA.required).toContain("title");
    expect(CAPSULE_SCHEMA.required).toContain("canvas");
    expect(CAPSULE_SCHEMA.required).toContain("scenes");
  });
});

describe("validateCapsule", () => {
  it("accepts a valid capsule", () => {
    expect(validateCapsule(validCapsule)).toBe(true);
  });

  it("rejects null / non-object", () => {
    expect(validateCapsule(null)).toBe(false);
    expect(validateCapsule("string")).toBe(false);
    expect(validateCapsule(42)).toBe(false);
  });

  it("rejects missing id", () => {
    const c = { ...validCapsule, id: undefined };
    expect(validateCapsule(c)).toBe(false);
  });

  it("rejects missing title", () => {
    const c = { ...validCapsule, title: undefined };
    expect(validateCapsule(c)).toBe(false);
  });

  it("rejects invalid canvas dimensions", () => {
    expect(validateCapsule({ ...validCapsule, canvas: { width: 0, height: 100 } })).toBe(false);
    expect(validateCapsule({ ...validCapsule, canvas: null })).toBe(false);
  });

  it("rejects empty scenes array", () => {
    expect(validateCapsule({ ...validCapsule, scenes: [] })).toBe(false);
  });

  it("rejects scene with invalid transition", () => {
    const c = {
      ...validCapsule,
      scenes: [{ ...validCapsule.scenes[0], transition: "explode" }],
    };
    expect(validateCapsule(c)).toBe(false);
  });

  it("rejects scene with invalid element type", () => {
    const c = {
      ...validCapsule,
      scenes: [
        {
          ...validCapsule.scenes[0],
          elements: [
            { type: "video", x: 0, y: 0, width: 100, height: 100 },
          ],
        },
      ],
    };
    expect(validateCapsule(c)).toBe(false);
  });
});
