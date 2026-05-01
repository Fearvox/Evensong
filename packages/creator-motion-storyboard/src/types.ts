/** Transition between scenes in the storyboard. */
export type Transition = "fade" | "slide-left" | "slide-right" | "zoom" | "none";

/** A visual element placed on a scene's canvas. */
export interface SceneElement {
  type: "text" | "shape" | "placeholder";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  /** Inline CSS style properties applied to the element. */
  style?: Record<string, string>;
}

/** A single storyboard scene with timing and visual elements. */
export interface Scene {
  id: string;
  index: number;
  /** Duration in milliseconds. */
  duration: number;
  caption?: string;
  overlay?: string;
  transition: Transition;
  /** CSS-compatible background value (color, gradient, etc.). */
  background?: string;
  elements: SceneElement[];
}

/** Fixed canvas dimensions shared across all scenes. */
export interface Canvas {
  width: number;
  height: number;
}

/** Input capsule: packaged scene data for storyboard generation. */
export interface Capsule {
  id: string;
  title: string;
  canvas: Canvas;
  scenes: Scene[];
  metadata?: Record<string, unknown>;
}

/** Result returned by the transform controller. */
export interface StoryboardOutput {
  capsuleId: string;
  generatedAt: string;
  /** Self-contained HTML document. */
  html: string;
  sceneCount: number;
  totalDurationMs: number;
}

/** A single ledger entry recording a transformation. */
export interface LedgerEntry {
  capsuleId: string;
  timestamp: string;
  sceneCount: number;
  totalDurationMs: number;
  htmlByteLength: number;
}

/** Validation result from machine check. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
