import type { Capsule } from "./types";

/**
 * JSON Schema contract for capsule validation.
 * This is the public-safe input boundary — every capsule is validated
 * against this schema before transformation.
 */
export const CAPSULE_SCHEMA: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://syndash.dev/schemas/capsule-v1.json",
  title: "Motion Storyboard Capsule",
  description:
    "A capsule of scene data ready for motion-storyboard rendering.",
  type: "object",
  required: ["id", "title", "canvas", "scenes"],
  properties: {
    id: { type: "string", description: "Unique capsule identifier." },
    title: { type: "string", description: "Human-readable title." },
    canvas: {
      type: "object",
      required: ["width", "height"],
      properties: {
        width: { type: "number", minimum: 1, maximum: 3840 },
        height: { type: "number", minimum: 1, maximum: 2160 },
      },
    },
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "index", "duration", "transition", "elements"],
        properties: {
          id: { type: "string" },
          index: { type: "integer", minimum: 0 },
          duration: { type: "number", minimum: 0 },
          caption: { type: "string" },
          overlay: { type: "string" },
          transition: {
            type: "string",
            enum: ["fade", "slide-left", "slide-right", "zoom", "none"],
          },
          background: { type: "string" },
          elements: {
            type: "array",
            items: {
              type: "object",
              required: ["type", "x", "y", "width", "height"],
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "shape", "placeholder"],
                },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number", minimum: 0 },
                height: { type: "number", minimum: 0 },
                content: { type: "string" },
                style: { type: "object" },
              },
            },
          },
        },
      },
    },
    metadata: { type: "object" },
  },
};

/**
 * Validates a capsule against the JSON Schema contract using structural checks.
 * For full JSON Schema validation, integrate with a library like ajv.
 */
export function validateCapsule(capsule: unknown): capsule is Capsule {
  if (!capsule || typeof capsule !== "object") return false;
  const c = capsule as Record<string, unknown>;

  if (typeof c.id !== "string") return false;
  if (typeof c.title !== "string") return false;

  const canvas = c.canvas as Record<string, unknown> | undefined;
  if (
    !canvas ||
    typeof canvas.width !== "number" ||
    typeof canvas.height !== "number" ||
    canvas.width < 1 ||
    canvas.height < 1
  )
    return false;

  const scenes = c.scenes as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(scenes) || scenes.length === 0) return false;

  for (const scene of scenes) {
    if (typeof scene.id !== "string") return false;
    if (typeof scene.index !== "number") return false;
    if (typeof scene.duration !== "number" || scene.duration < 0) return false;
    if (
      typeof scene.transition !== "string" ||
      !["fade", "slide-left", "slide-right", "zoom", "none"].includes(
        scene.transition as string,
      )
    )
      return false;
    if (!Array.isArray(scene.elements)) return false;
    for (const el of scene.elements as Array<Record<string, unknown>>) {
      if (
        typeof el.type !== "string" ||
        !["text", "shape", "placeholder"].includes(el.type as string)
      )
        return false;
      if (
        typeof el.x !== "number" ||
        typeof el.y !== "number" ||
        typeof el.width !== "number" ||
        typeof el.height !== "number"
      )
        return false;
    }
  }

  return true;
}
