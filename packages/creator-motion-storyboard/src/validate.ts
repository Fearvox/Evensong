import type { Capsule, ValidationResult } from "./types";

/**
 * Machine check: validates a capsule structually and semantically.
 * Returns a list of errors; empty array means valid.
 */
export function machineCheck(capsule: Capsule): ValidationResult {
  const errors: string[] = [];

  // Structural
  if (!capsule.id) errors.push("Missing capsule.id");
  if (!capsule.title) errors.push("Missing capsule.title");
  if (!capsule.canvas) {
    errors.push("Missing capsule.canvas");
  } else {
    if (typeof capsule.canvas.width !== "number" || capsule.canvas.width < 1) {
      errors.push("canvas.width must be a positive number");
    }
    if (
      typeof capsule.canvas.height !== "number" ||
      capsule.canvas.height < 1
    ) {
      errors.push("canvas.height must be a positive number");
    }
  }

  if (!Array.isArray(capsule.scenes) || capsule.scenes.length === 0) {
    errors.push("scenes must be a non-empty array");
  } else {
    // Semantic checks on scenes
    const ids = new Set<string>();
    for (let i = 0; i < capsule.scenes.length; i++) {
      const s = capsule.scenes[i];
      if (s.index !== i) {
        errors.push(`scene[${i}].index=${s.index}, expected ${i}`);
      }
      if (s.duration <= 0) {
        errors.push(`scene[${i}] has non-positive duration`);
      }
      if (ids.has(s.id)) {
        errors.push(`Duplicate scene id: ${s.id}`);
      }
      ids.add(s.id);

      // Check elements fit within canvas
      for (const el of s.elements) {
        if (el.x < 0 || el.y < 0) {
          errors.push(`scene[${i}] element has negative position`);
        }
        if (el.x + el.width > capsule.canvas.width) {
          errors.push(
            `scene[${i}] element overflows canvas width (${el.x}+${el.width} > ${capsule.canvas.width})`,
          );
        }
        if (el.y + el.height > capsule.canvas.height) {
          errors.push(
            `scene[${i}] element overflows canvas height (${el.y}+${el.height} > ${capsule.canvas.height})`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
